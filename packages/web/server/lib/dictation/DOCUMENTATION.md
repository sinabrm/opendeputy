# Dictation module

Server-authoritative streaming speech-to-text for the chat composer, plus
local text-to-speech. The client streams 16 kHz mono PCM16 chunks (base64)
over a WebSocket; the server runs the transcription and streams live partial
transcripts back.

Local TTS (Kokoro via sherpa-onnx OfflineTts) runs in the same worker process
and is exposed as `POST /api/dictation/tts/speak` (JSON `{text, speakerId?,
speed?, model?}` → WAV bytes; 503 with `reasonCode` while the model is
downloading). TTS models live in the same catalog/downloader as STT models
(`local/model-catalog.js` `LOCAL_TTS_MODEL_CATALOG`) and are managed by the
same status/download/delete routes.

## Local model provenance and integrity

OpenDeputy downloads converted archives from the
[k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) release pages. The
original model sources and the licenses declared by their publishers are:

| Catalog model | Original model source | Publisher-declared model license |
| --- | --- | --- |
| `parakeet-tdt-0.6b-v2-int8` | [NVIDIA Parakeet TDT 0.6B v2](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) | CC-BY-4.0 |
| `parakeet-tdt-0.6b-v3-int8` | [NVIDIA Parakeet TDT 0.6B v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) | CC-BY-4.0 |
| `whisper-base-int8` | [OpenAI Whisper](https://github.com/openai/whisper) | MIT |
| `whisper-tiny-int8` | [OpenAI Whisper](https://github.com/openai/whisper) | MIT |
| `kokoro-en-v0_19` | [Kokoro-82M v0.19](https://huggingface.co/hexgrad/Kokoro-82M/tree/e6a2633a608163a6383195168a1abf0c4b8aeaa7) | Apache-2.0 |

These entries describe the model weights, not every support file in a converted
archive. `local/model-catalog.js` is the source of truth for each archive URL,
expected byte size, SHA-256, checksum provenance, original project, and model
license link.

The Parakeet and Kokoro checksums are the SHA-256 digests published by GitHub's
release API. GitHub does not publish digests for the two older Whisper release
assets, so those checksums are explicitly marked `maintainer-verified` and were
computed from the exact upstream assets on 2026-08-16.

The downloader fails closed when integrity metadata is missing or malformed. It
streams each download to a uniquely named temporary file, verifies both byte
size and SHA-256, and only then moves it into the download cache for extraction.
Cached archives are reverified before use. Failed downloads, checksum failures,
and failed extractions remove their temporary or cached archive; extraction is
staged so partial model files never appear at the final installed path.

## Ownership

- `runtime.js` — registers `GET /api/dictation/status`,
  `POST /api/dictation/models/:modelId/download`, and the
  `/api/dictation/ws` WebSocket endpoint (auth-gated the same way as the
  terminal WS: UI session token or `oc_url_token`, plus origin check).
  Created from the startup pipeline (`startup-pipeline-runtime.js`) before
  the generic OpenCode proxy so routes are not shadowed.
- `stream-manager.js` — `DictationStreamManager`, one per WS connection.
  Chunk reordering by `seq` + ack, resampling to the provider rate,
  auto-commit every ~15 s of audio, silence suppression by PCM peak,
  partial-transcript concatenation, adaptive finalization timeout.
- `service.js` — provider resolution and readiness. Providers:
  - `local` (default): sherpa-onnx Parakeet TDT in a forked worker process.
    Models auto-download in the background on first use; while missing, the
    stream fails with `reasonCode: 'model_download_in_progress'` and the
    status route reports per-model install/download state.
  - `openai-compatible`: buffered per-segment transcription against any
    OpenAI-compatible `/v1/audio/transcriptions` endpoint
    (`openai-compatible-session.js`, reuses `../tts/stt.js`).
- `local/` — worker process + client (IPC, idle shutdown TTL), sherpa
  recognizer engine and realtime session (throttled re-decode for partials),
  model catalog and downloader. The native `sherpa-onnx-node` addon is only
  ever loaded inside the worker process.
- `audio.js` — PCM16 helpers: format parsing, peak, WAV wrapping, streaming
  linear resampler.

## WebSocket protocol (JSON text frames)

Client → server: `start {dictationId, format, options}`,
`chunk {dictationId, seq, audio}`, `finish {dictationId, finalSeq}`,
`cancel {dictationId}`, `ping`.

Server → client: `ready`, `ack {ackSeq}`, `partial {text}`,
`finish_accepted {timeoutMs}`, `final {text}`,
`error {error, retryable, reasonCode?}`, `pong`.

`options` in `start` carries the client-selected provider config:
`{ provider: 'local' | 'openai-compatible', language?, localModel?,
openaiCompatible?: { baseUrl, model, apiKey } }`.

## Invariants

- Never load `sherpa-onnx-node` in the main server process.
- The stream manager acks only the highest contiguous seq; the client is
  expected to retain unacked segments for retry/replay.
- Silence-only segments (peak < 300) are cleared, never committed, so
  Whisper-style providers do not hallucinate on silence.
- Model files live under `~/.config/openchamber/speech-models`.
