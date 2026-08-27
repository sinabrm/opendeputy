import { describe, expect, test } from 'bun:test';

import type { DictationClient } from './dictation-client';
import { DictationStreamSender } from './dictation-stream-sender';

const modelDownloadingError = (): Error & { reasonCode: string } => {
    const error = new Error('Dictation model is downloading') as Error & { reasonCode: string };
    error.reasonCode = 'model_download_in_progress';
    return error;
};

const createClient = () => {
    let startAttempts = 0;
    const startCalls: unknown[][] = [];
    const chunkCalls: unknown[][] = [];
    const finishCalls: unknown[][] = [];
    const client = {
        isConnected: true,
        startDictationStream: async (...args: unknown[]) => {
            startCalls.push(args);
            startAttempts += 1;
            if (startAttempts < 3) {
                throw modelDownloadingError();
            }
        },
        sendDictationStreamChunk: (...args: unknown[]) => {
            chunkCalls.push(args);
            return true;
        },
        finishDictationStream: async (...args: unknown[]) => {
            finishCalls.push(args);
            return { text: 'multilingual transcript' };
        },
        cancelDictationStream: () => undefined,
        startCalls,
        chunkCalls,
        finishCalls,
    };
    return client;
};

describe('DictationStreamSender model readiness', () => {
    test('waits for the first model download and replays buffered audio automatically', async () => {
        const client = createClient();
        const sender = new DictationStreamSender({
            client: client as unknown as DictationClient,
            getStartOptions: () => ({ provider: 'local', localModel: 'whisper-base-int8' }),
            createDictationId: () => 'dictation-1',
        });
        sender.enqueueSegment('pcm-segment');

        const result = await sender.finish(0, {
            waitForModelDownload: true,
            retryDelayMs: 0,
            maxWaitMs: 1000,
        });

        expect(result.text).toBe('multilingual transcript');
        expect(client.startCalls).toHaveLength(3);
        expect(client.chunkCalls).toEqual([['dictation-1', 0, 'pcm-segment']]);
        expect(client.finishCalls).toEqual([['dictation-1', 0]]);
    });

    test('does not retry unrelated stream failures', async () => {
        const client = createClient();
        client.startDictationStream = async (...args: unknown[]) => {
            client.startCalls.push(args);
            throw new Error('Microphone server unavailable');
        };
        const sender = new DictationStreamSender({
            client: client as unknown as DictationClient,
            getStartOptions: () => ({ provider: 'local' }),
        });
        sender.enqueueSegment('pcm-segment');

        await expect(sender.finish(0, {
            waitForModelDownload: true,
            retryDelayMs: 0,
            maxWaitMs: 1000,
        })).rejects.toThrow('Microphone server unavailable');
        expect(client.startCalls).toHaveLength(1);
    });

    test('stops waiting immediately when the user cancels', async () => {
        const client = createClient();
        client.startDictationStream = async (...args: unknown[]) => {
            client.startCalls.push(args);
            throw modelDownloadingError();
        };
        const sender = new DictationStreamSender({
            client: client as unknown as DictationClient,
            getStartOptions: () => ({ provider: 'local' }),
        });
        sender.enqueueSegment('pcm-segment');
        const controller = new AbortController();

        const finishing = sender.finish(0, {
            waitForModelDownload: true,
            signal: controller.signal,
            retryDelayMs: 60_000,
        });
        controller.abort();

        let abortError: unknown;
        try {
            await finishing;
        } catch (error) {
            abortError = error;
        }
        expect((abortError as Error).name).toBe('AbortError');
    });
});
