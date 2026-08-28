import { describe, expect, test } from 'bun:test';

import type { runtimeFetch } from '@/lib/runtime-fetch';
import {
    preloadLocalDictationModel,
    prepareLocalDictationModel,
    requestLocalDictationModelPreload,
} from './dictation-model-readiness';

const jsonResponse = (value: unknown, status = 200): Response => new Response(
    JSON.stringify(value),
    { status, headers: { 'content-type': 'application/json' } },
);

const statusPayload = (overrides: Partial<{
    installed: boolean;
    downloading: boolean;
    downloadError: string | null;
}> = {}) => ({
    models: [{
        id: 'whisper-base-int8',
        installed: false,
        downloading: false,
        downloadError: null,
        ...overrides,
    }],
});

describe('local dictation model preparation', () => {
    test('requests a non-blocking preload for the selected model', async () => {
        const calls: Array<{ path: string; method: string | undefined }> = [];
        const fetchRuntime = async (
            input: string | URL | Request,
            init?: RequestInit,
        ): Promise<Response> => {
            calls.push({ path: String(input), method: init?.method });
            return jsonResponse({ ok: true, installed: false });
        };

        await requestLocalDictationModelPreload({
            modelId: 'whisper-base-int8',
            signal: new AbortController().signal,
            fetchRuntime: fetchRuntime as typeof runtimeFetch,
        });

        expect(calls).toEqual([{
            path: '/api/dictation/models/whisper-base-int8/download',
            method: 'POST',
        }]);
    });

    test('skips preload when no local model is selected', async () => {
        let called = false;
        const fetchRuntime = async (): Promise<Response> => {
            called = true;
            return jsonResponse({ ok: true });
        };

        await requestLocalDictationModelPreload({
            modelId: '   ',
            signal: new AbortController().signal,
            fetchRuntime: fetchRuntime as typeof runtimeFetch,
        });

        expect(called).toBe(false);
    });

    test('retries a failed background download and stops after installation', async () => {
        const calls: string[] = [];
        let statusReads = 0;
        const fetchRuntime = async (input: string | URL | Request): Promise<Response> => {
            const path = String(input);
            calls.push(path);
            if (path.includes('/download')) {
                return jsonResponse({ ok: true });
            }
            statusReads += 1;
            return jsonResponse(statusReads === 1
                ? statusPayload({ downloadError: 'network interrupted' })
                : statusPayload({ installed: true }));
        };

        await preloadLocalDictationModel({
            modelId: 'whisper-base-int8',
            signal: new AbortController().signal,
            fetchRuntime: fetchRuntime as typeof runtimeFetch,
            pollIntervalMs: 0,
            retryDelaysMs: [0],
        });

        expect(calls).toEqual([
            '/api/dictation/models/whisper-base-int8/download',
            '/api/dictation/status',
            '/api/dictation/models/whisper-base-int8/download',
            '/api/dictation/status',
        ]);
    });

    test('returns immediately when the model is already installed', async () => {
        const calls: string[] = [];
        const fetchRuntime = async (input: string | URL | Request): Promise<Response> => {
            calls.push(String(input));
            return jsonResponse(statusPayload({ installed: true }));
        };

        await prepareLocalDictationModel({
            provider: 'local',
            modelId: 'whisper-base-int8',
            signal: new AbortController().signal,
            fetchRuntime: fetchRuntime as typeof runtimeFetch,
        });

        expect(calls).toEqual(['/api/dictation/status']);
    });

    test('finds installed text-to-speech models in the TTS catalog snapshot', async () => {
        const calls: string[] = [];
        const fetchRuntime = async (input: string | URL | Request): Promise<Response> => {
            calls.push(String(input));
            return jsonResponse({
                models: [],
                ttsModels: [{
                    id: 'vits-piper-fa-en-medium',
                    installed: true,
                    downloading: false,
                    downloadError: null,
                }],
            });
        };

        await prepareLocalDictationModel({
            provider: 'local',
            modelId: 'vits-piper-fa-en-medium',
            signal: new AbortController().signal,
            fetchRuntime: fetchRuntime as typeof runtimeFetch,
        });

        expect(calls).toEqual(['/api/dictation/status']);
    });

    test('starts the download and waits until installation completes', async () => {
        const calls: string[] = [];
        let statusReads = 0;
        const fetchRuntime = async (input: string | URL | Request): Promise<Response> => {
            const path = String(input);
            calls.push(path);
            if (path.includes('/download')) {
                return jsonResponse({ ok: true });
            }
            statusReads += 1;
            return jsonResponse(statusReads === 1
                ? statusPayload()
                : statusPayload({ installed: true }));
        };

        await prepareLocalDictationModel({
            provider: 'local',
            modelId: 'whisper-base-int8',
            signal: new AbortController().signal,
            fetchRuntime: fetchRuntime as typeof runtimeFetch,
            pollIntervalMs: 0,
        });

        expect(calls).toEqual([
            '/api/dictation/status',
            '/api/dictation/models/whisper-base-int8/download',
            '/api/dictation/status',
        ]);
    });

    test('reports a download failure instead of opening the microphone', async () => {
        const fetchRuntime = async (): Promise<Response> =>
            jsonResponse(statusPayload({ downloadError: 'checksum failed' }));

        await expect(prepareLocalDictationModel({
            provider: 'local',
            modelId: 'whisper-base-int8',
            signal: new AbortController().signal,
            fetchRuntime: fetchRuntime as typeof runtimeFetch,
        })).rejects.toThrow('checksum failed');
    });

    test('stops polling when the user cancels', async () => {
        const controller = new AbortController();
        const fetchRuntime = async (): Promise<Response> =>
            jsonResponse(statusPayload({ downloading: true }));
        const preparing = prepareLocalDictationModel({
            provider: 'local',
            modelId: 'whisper-base-int8',
            signal: controller.signal,
            fetchRuntime: fetchRuntime as typeof runtimeFetch,
            pollIntervalMs: 60_000,
        });
        controller.abort();

        let abortError: unknown;
        try {
            await preparing;
        } catch (error) {
            abortError = error;
        }
        expect((abortError as Error).name).toBe('AbortError');
    });
});
