/**
 * Final-only cloud dictation through OpenCode Zen's Muse audio model.
 *
 * Audio still arrives over the existing dictation WebSocket, but unlike the
 * local and Whisper-compatible providers Muse receives one complete WAV after
 * the user stops speaking. This keeps the microphone path relay-safe while
 * avoiding a local speech-model download.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import { pcm16ToWav } from './audio.js';

const MUSE_SAMPLE_RATE = 16000;
const MUSE_MODEL = 'muse-spark-1.2-contributor-free';
const MUSE_RESPONSES_URL = 'https://opencode.ai/zen/v1/responses';
const MUSE_REQUEST_TIMEOUT_MS = 3 * 60 * 1000;
const MUSE_MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const responseText = (payload) => {
  if (typeof payload?.output_text === 'string') {
    return payload.output_text.trim();
  }
  if (!Array.isArray(payload?.output)) {
    return '';
  }
  return payload.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((part) => (part?.type === 'output_text' && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
};

const requestSignal = (signal) => {
  const timeout = AbortSignal.timeout(MUSE_REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
};

export async function transcribeWithMuse({ wav, language, signal, fetchImpl = fetch }) {
  const languageInstruction = typeof language === 'string' && language.trim()
    ? ` The expected language is ${language.trim()}.`
    : ' Detect the spoken language automatically.';
  const response = await fetchImpl(MUSE_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: MUSE_MODEL,
      instructions:
        'Act only as a speech transcription engine. Preserve the speaker\'s language, wording, and punctuation. Do not answer, explain, translate, summarize, or add labels. Output only the transcript.',
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Transcribe the attached recording exactly.${languageInstruction}`,
          },
          {
            type: 'input_audio',
            input_audio: {
              data: wav.toString('base64'),
              format: 'wav',
            },
          },
        ],
      }],
      reasoning: { effort: 'minimal' },
      max_output_tokens: 4096,
      stream: false,
      store: false,
    }),
    signal: requestSignal(signal),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const detail = body ? `: ${body.slice(0, 300)}` : '';
    throw new Error(`Muse transcription failed with ${response.status}${detail}`);
  }

  const payload = await response.json();
  const text = responseText(payload);
  if (text) {
    return text;
  }
  const reason = payload?.incomplete_details?.reason;
  throw new Error(
    reason
      ? `Muse returned no transcript (${reason})`
      : 'Muse returned no transcript',
  );
}

export class MuseTranscriptionSession extends EventEmitter {
  constructor({ language, transcribe = transcribeWithMuse } = {}) {
    super();
    this.language = language;
    this.transcribe = transcribe;
    this.requiredSampleRate = MUSE_SAMPLE_RATE;
    this.supportsAutoCommit = false;
    this.connected = false;
    this.segmentId = randomUUID();
    this.pcmChunks = [];
    this.pcmBytes = 0;
    this.abortController = null;
  }

  async connect() {
    this.connected = true;
  }

  appendPcm16(chunk) {
    if (!this.connected) {
      this.emit('error', new Error('Muse dictation session is not connected'));
      return;
    }
    if (this.pcmBytes + chunk.length > MUSE_MAX_AUDIO_BYTES) {
      this.emit('error', new Error('Recording is too long for Muse transcription'));
      return;
    }
    this.pcmChunks.push(chunk);
    this.pcmBytes += chunk.length;
  }

  commit() {
    if (!this.connected) {
      this.emit('error', new Error('Muse dictation session is not connected'));
      return;
    }

    const committedId = this.segmentId;
    const pcm16 = this.pcmChunks.length === 1
      ? this.pcmChunks[0]
      : Buffer.concat(this.pcmChunks, this.pcmBytes);
    this.segmentId = randomUUID();
    this.pcmChunks = [];
    this.pcmBytes = 0;
    this.emit('committed', { segmentId: committedId, previousSegmentId: null });

    const abortController = new AbortController();
    this.abortController = abortController;
    void this.transcribe({
      wav: pcm16ToWav(pcm16, MUSE_SAMPLE_RATE),
      language: this.language,
      signal: abortController.signal,
    }).then((text) => {
      if (!this.connected || abortController.signal.aborted) {
        return;
      }
      this.emit('transcript', {
        segmentId: committedId,
        transcript: text.trim(),
        isFinal: true,
      });
    }).catch((error) => {
      if (!abortController.signal.aborted) {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    }).finally(() => {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    });
  }

  clear() {
    this.pcmChunks = [];
    this.pcmBytes = 0;
    this.segmentId = randomUUID();
  }

  close() {
    this.connected = false;
    this.abortController?.abort();
    this.abortController = null;
    this.clear();
  }
}
