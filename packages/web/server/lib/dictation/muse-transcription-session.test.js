import { describe, expect, it } from 'bun:test';

import {
  MuseTranscriptionSession,
  transcribeWithMuse,
} from './muse-transcription-session.js';

const loudPcm = (samples = 1600) => {
  const values = new Int16Array(samples);
  values.fill(6000);
  return Buffer.from(values.buffer);
};

describe('Muse dictation', () => {
  it('sends WAV audio to Muse and extracts response text', async () => {
    let request;
    const text = await transcribeWithMuse({
      wav: Buffer.from('wav-data'),
      language: 'fa',
      fetchImpl: async (url, init) => {
        request = { url, init };
        return new Response(JSON.stringify({ output_text: 'سلام دنیا' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    expect(text).toBe('سلام دنیا');
    expect(request.url).toBe('https://opencode.ai/zen/v1/responses');
    const body = JSON.parse(request.init.body);
    expect(body.model).toBe('muse-spark-1.2-contributor-free');
    expect(body.input[0].content[1].type).toBe('input_audio');
    expect(body.input[0].content[1].input_audio.format).toBe('wav');
    expect(body.input[0].content[0].text).toContain('fa');
  });

  it('buffers audio and emits one final transcript on commit', async () => {
    const calls = [];
    const session = new MuseTranscriptionSession({
      transcribe: async ({ wav, language }) => {
        calls.push({ wav, language });
        return 'hello from muse';
      },
      language: 'en',
    });
    await session.connect();

    const transcript = new Promise((resolve, reject) => {
      session.once('transcript', resolve);
      session.once('error', reject);
    });
    session.appendPcm16(loudPcm());
    session.appendPcm16(loudPcm());
    session.commit();

    expect(await transcript).toMatchObject({ transcript: 'hello from muse', isFinal: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].language).toBe('en');
    expect(calls[0].wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(session.supportsAutoCommit).toBe(false);
  });
});

