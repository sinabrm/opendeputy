import { runtimeFetch } from '@/lib/runtime-fetch';

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_PRELOAD_RETRY_DELAYS_MS = [30_000, 120_000] as const;

type RuntimeFetchLike = typeof runtimeFetch;

interface LocalModelSnapshot {
    installed: boolean;
    downloading: boolean;
    downloadError: string | null;
}

export async function requestLocalDictationModelPreload(params: {
    modelId?: string;
    signal: AbortSignal;
    fetchRuntime?: RuntimeFetchLike;
}): Promise<void> {
    const modelId = params.modelId?.trim();
    if (!modelId) {
        return;
    }
    const fetchRuntime = params.fetchRuntime ?? runtimeFetch;
    const response = await fetchRuntime(
        `/api/dictation/models/${encodeURIComponent(modelId)}/download`,
        { method: 'POST', signal: params.signal },
    );
    if (!response.ok) {
        throw new Error(response.statusText || `HTTP ${response.status}`);
    }
}

export async function preloadLocalDictationModel(params: {
    modelId?: string;
    signal: AbortSignal;
    fetchRuntime?: RuntimeFetchLike;
    pollIntervalMs?: number;
    retryDelaysMs?: readonly number[];
}): Promise<void> {
    const retryDelays = params.retryDelaysMs ?? DEFAULT_PRELOAD_RETRY_DELAYS_MS;
    let attempt = 0;

    while (!params.signal.aborted) {
        try {
            await requestLocalDictationModelPreload(params);
            await prepareLocalDictationModel({
                provider: 'local',
                modelId: params.modelId,
                signal: params.signal,
                fetchRuntime: params.fetchRuntime,
                pollIntervalMs: params.pollIntervalMs,
            });
            return;
        } catch (error) {
            if (params.signal.aborted || attempt >= retryDelays.length) {
                throw error;
            }
            await waitForPoll(retryDelays[attempt], params.signal);
            attempt += 1;
        }
    }

    throw createAbortError();
}

const parseLocalModelSnapshot = (payload: unknown, modelId: string): LocalModelSnapshot | null => {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const body = payload as { models?: unknown; ttsModels?: unknown };
    const models = [
        ...(Array.isArray(body.models) ? body.models : []),
        ...(Array.isArray(body.ttsModels) ? body.ttsModels : []),
    ];
    if (models.length === 0) {
        return null;
    }
    const entry = models.find((candidate) =>
        Boolean(candidate)
        && typeof candidate === 'object'
        && (candidate as { id?: unknown }).id === modelId,
    );
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    return {
        installed: (entry as { installed?: unknown }).installed === true,
        downloading: (entry as { downloading?: unknown }).downloading === true,
        downloadError: typeof (entry as { downloadError?: unknown }).downloadError === 'string'
            ? (entry as { downloadError: string }).downloadError
            : null,
    };
};

const createAbortError = (): Error => {
    const error = new Error('Dictation preparation cancelled');
    error.name = 'AbortError';
    return error;
};

const waitForPoll = (delayMs: number, signal: AbortSignal): Promise<void> => {
    if (signal.aborted) {
        return Promise.reject(createAbortError());
    }
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, delayMs);
        const onAbort = () => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', onAbort);
            reject(createAbortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
};

export async function prepareLocalDictationModel(params: {
    provider?: 'muse' | 'local' | 'openai-compatible';
    modelId?: string;
    signal: AbortSignal;
    fetchRuntime?: RuntimeFetchLike;
    pollIntervalMs?: number;
}): Promise<void> {
    if (params.provider !== 'local' || !params.modelId) {
        return;
    }
    const fetchRuntime = params.fetchRuntime ?? runtimeFetch;
    const query = { provider: 'local', localModel: params.modelId } as const;

    while (!params.signal.aborted) {
        const response = await fetchRuntime('/api/dictation/status', {
            query,
            signal: params.signal,
        });
        if (!response.ok) {
            throw new Error(response.statusText || `HTTP ${response.status}`);
        }
        const snapshot = parseLocalModelSnapshot(await response.json(), params.modelId);
        if (!snapshot) {
            throw new Error('model_status_unavailable');
        }
        if (snapshot.installed) {
            return;
        }
        if (snapshot.downloadError) {
            throw new Error(snapshot.downloadError);
        }
        if (!snapshot.downloading) {
            const download = await fetchRuntime(
                `/api/dictation/models/${encodeURIComponent(params.modelId)}/download`,
                { method: 'POST', signal: params.signal },
            );
            if (!download.ok) {
                throw new Error(download.statusText || `HTTP ${download.status}`);
            }
        }
        await waitForPoll(params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, params.signal);
    }
    throw createAbortError();
}
