import { EventEmitter } from 'events';

import { describe, expect, it, vi } from 'vitest';

import {
  DictationWorkerClient,
  WorkerBackedTranscriptionSession,
} from './worker-client.js';

describe('local dictation worker language transport', () => {
  it('forwards the selected language into the worker session request', async () => {
    const client = new DictationWorkerClient();
    const sendRequest = vi
      .spyOn(client, 'sendRequest')
      .mockResolvedValue({ requiredSampleRate: 16000 });

    await client.createSession(
      { modelsDir: '/models', modelId: 'whisper-base-int8', language: 'fa-IR' },
      new EventEmitter(),
    );

    expect(sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session.create',
        modelsDir: '/models',
        modelId: 'whisper-base-int8',
        language: 'fa-IR',
      }),
    );
    client.shutdown();
  });

  it('preserves language in the worker-backed session configuration', async () => {
    const client = {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'session-1', requiredSampleRate: 16000 }),
    };
    const session = new WorkerBackedTranscriptionSession(client, {
      modelsDir: '/models',
      modelId: 'whisper-base-int8',
      language: 'fa',
    });

    await session.connect();

    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'fa' }),
      session,
    );
  });
});
