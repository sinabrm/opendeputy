// Recover a session when OpenCode ends a model stream with an empty
// `finish: unknown`. The continuation is a fully synthetic user message, so
// OpenDeputy merges it into the existing turn instead of showing a request the
// user never typed.

const IDLE_QUIET_MS = 1_000;
const FETCH_TIMEOUT_MS = 10_000;
const MESSAGE_FETCH_LIMIT = 120;
const MAX_AUTO_RECOVERY_ATTEMPTS = 2;
const RECOVERY_PROMPT_PREFIX = '[OpenDeputy automatic recovery]';

const buildRecoveryPrompt = (attempt, maxAttempts) => [
  RECOVERY_PROMPT_PREFIX,
  `Attempt ${attempt} of ${maxAttempts}.`,
  'The previous model stream ended before producing a response.',
  'Continue the latest user request from the existing session state.',
  'Treat completed tool results as authoritative and do not repeat completed side-effecting actions.',
  'Inspect current state before any further side effect, then finish the task and report the result.',
].join('\n');

const extractSessionStatus = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const properties = payload.properties && typeof payload.properties === 'object' ? payload.properties : {};
  if (payload.type === 'session.idle') {
    const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
    return sessionId ? { sessionId, type: 'idle', directory: '' } : null;
  }
  if (payload.type !== 'session.status') return null;
  const status = properties.status && typeof properties.status === 'object' ? properties.status : {};
  const info = properties.info && typeof properties.info === 'object' ? properties.info : {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const type = typeof status.type === 'string'
    ? status.type.trim()
    : (typeof info.type === 'string' ? info.type.trim() : '');
  const directory = typeof properties.directory === 'string' && properties.directory
    ? properties.directory
    : (typeof info.directory === 'string' ? info.directory : '');
  return sessionId && type ? { sessionId, type, directory } : null;
};

const extractNewUserMessage = (payload) => {
  if (!payload || payload.type !== 'message.updated') return null;
  const info = payload.properties?.info;
  if (!info || typeof info !== 'object' || info.role !== 'user') return null;
  if (typeof info.sessionID !== 'string' || !info.sessionID) return null;
  return {
    sessionId: info.sessionID,
    createdAt: typeof info.time?.created === 'number' ? info.time.created : 0,
  };
};

const messageInfo = (message) => (message?.info && typeof message.info === 'object' ? message.info : null);
const messageParts = (message) => (Array.isArray(message?.parts) ? message.parts : []);

const isRecoveryUserMessage = (message) => {
  if (messageInfo(message)?.role !== 'user') return false;
  return messageParts(message).some((part) => (
    part?.type === 'text'
    && part.synthetic === true
    && typeof part.text === 'string'
    && part.text.startsWith(RECOVERY_PROMPT_PREFIX)
  ));
};

const isVisibleUserMessage = (message) => (
  messageInfo(message)?.role === 'user'
  && messageParts(message).some((part) => part?.synthetic !== true)
);

const recoveryAttemptsForLatestUserTurn = (messages) => {
  let latestVisibleUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isVisibleUserMessage(messages[index])) {
      latestVisibleUserIndex = index;
      break;
    }
  }
  if (latestVisibleUserIndex < 0) return null;
  return messages
    .slice(latestVisibleUserIndex + 1)
    .filter(isRecoveryUserMessage)
    .length;
};

const isEmptyUnknownAssistant = (message) => {
  const info = messageInfo(message);
  if (!info || info.role !== 'assistant' || info.finish !== 'unknown' || info.error) return false;
  if (typeof info.id !== 'string' || !info.id) return false;
  if (!Number.isFinite(info.time?.completed)) return false;
  return !messageParts(message).some((part) => {
    if (!part || typeof part !== 'object') return false;
    if (part.type === 'text') return typeof part.text === 'string' && part.text.trim().length > 0;
    if (part.type === 'reasoning' || part.type === 'step-start' || part.type === 'step-finish') return false;
    return true;
  });
};

export const createUnknownFinishRecoveryRuntime = ({
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  fetchImpl = fetch,
  quietMs = IDLE_QUIET_MS,
  maxAttempts = MAX_AUTO_RECOVERY_ATTEMPTS,
}) => {
  const timers = new Map();
  const inflight = new Set();
  let stopped = false;

  const clearTimer = (sessionId) => {
    const existing = timers.get(sessionId);
    if (!existing) return;
    clearTimeout(existing.timer);
    timers.delete(sessionId);
  };

  const buildUrl = (pathname, directory, params = {}) => {
    const url = new URL(buildOpenCodeUrl(pathname, ''));
    if (directory) url.searchParams.set('directory', directory);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    return url.toString();
  };

  const fetchJson = async (pathname, directory, params) => {
    const response = await fetchImpl(buildUrl(pathname, directory, params), {
      method: 'GET',
      headers: { Accept: 'application/json', ...getOpenCodeAuthHeaders() },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`OpenCode GET ${pathname} failed with ${response.status}`);
    return response.json().catch(() => null);
  };

  const fetchRecentMessages = async (sessionId, directory) => {
    const messages = await fetchJson(
      `/session/${encodeURIComponent(sessionId)}/message`,
      directory,
      { limit: MESSAGE_FETCH_LIMIT },
    );
    return Array.isArray(messages) ? messages : null;
  };

  const sendRecovery = async ({ sessionId, directory, lastAssistantInfo, attempt }) => {
    const providerID = typeof lastAssistantInfo.providerID === 'string' ? lastAssistantInfo.providerID : '';
    const modelID = typeof lastAssistantInfo.modelID === 'string' ? lastAssistantInfo.modelID : '';
    if (!providerID || !modelID) return false;
    const agent = typeof lastAssistantInfo.agent === 'string' && lastAssistantInfo.agent
      ? lastAssistantInfo.agent
      : (typeof lastAssistantInfo.mode === 'string' ? lastAssistantInfo.mode : '');
    const variant = typeof lastAssistantInfo.variant === 'string' ? lastAssistantInfo.variant : '';
    const response = await fetchImpl(
      buildUrl(`/session/${encodeURIComponent(sessionId)}/prompt_async`, directory),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...getOpenCodeAuthHeaders(),
        },
        body: JSON.stringify({
          model: { providerID, modelID },
          ...(agent ? { agent } : {}),
          ...(variant ? { variant } : {}),
          parts: [{ type: 'text', text: buildRecoveryPrompt(attempt, maxAttempts), synthetic: true }],
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenCode prompt_async failed with ${response.status}${body ? `: ${body}` : ''}`);
    }
    return true;
  };

  const recover = async (sessionId, directory) => {
    const session = await fetchJson(`/session/${encodeURIComponent(sessionId)}`, directory);
    if (!session || typeof session !== 'object') return;
    if (typeof session.parentID === 'string' && session.parentID) return;

    const messages = await fetchRecentMessages(sessionId, directory);
    if (!messages?.length) return;
    const failedMessage = messages[messages.length - 1];
    if (!isEmptyUnknownAssistant(failedMessage)) return;

    const attempts = recoveryAttemptsForLatestUserTurn(messages);
    if (attempts === null || attempts >= maxAttempts) {
      if (attempts !== null) {
        console.warn(`[session-recovery] ${sessionId} reached the ${maxAttempts}-attempt recovery limit`);
      }
      return;
    }

    const failedInfo = messageInfo(failedMessage);
    const latest = await fetchRecentMessages(sessionId, directory);
    const latestInfo = latest?.length ? messageInfo(latest[latest.length - 1]) : null;
    if (!latestInfo || latestInfo.id !== failedInfo.id || !isEmptyUnknownAssistant(latest[latest.length - 1])) {
      console.log('[session-recovery] tail moved on, dropping automatic recovery');
      return;
    }
    if (stopped) return;

    const attempt = attempts + 1;
    const sent = await sendRecovery({
      sessionId,
      directory,
      lastAssistantInfo: failedInfo,
      attempt,
    });
    if (sent) console.log(`[session-recovery] retrying ${sessionId} (${attempt}/${maxAttempts})`);
  };

  const armTimer = (sessionId, directory) => {
    clearTimer(sessionId);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      if (stopped || inflight.has(sessionId)) return;
      inflight.add(sessionId);
      recover(sessionId, directory)
        .catch((error) => {
          console.warn('[session-recovery] automatic recovery failed:', error?.message || error);
        })
        .finally(() => {
          inflight.delete(sessionId);
        });
    }, quietMs);
    if (typeof timer?.unref === 'function') timer.unref();
    timers.set(sessionId, { timer, armedAt: Date.now() });
  };

  const processPayload = (payload, directoryHint = '') => {
    if (stopped) return;
    const status = extractSessionStatus(payload);
    if (status) {
      if (status.type === 'idle') {
        armTimer(status.sessionId, status.directory || directoryHint);
      } else {
        clearTimer(status.sessionId);
      }
      return;
    }

    const userMessage = extractNewUserMessage(payload);
    if (userMessage) {
      const armed = timers.get(userMessage.sessionId);
      if (armed && userMessage.createdAt >= armed.armedAt) clearTimer(userMessage.sessionId);
      return;
    }

    if (payload?.type === 'session.error') {
      const sessionId = typeof payload.properties?.sessionID === 'string' ? payload.properties.sessionID : '';
      if (sessionId) clearTimer(sessionId);
    }
  };

  const stop = () => {
    stopped = true;
    for (const { timer } of timers.values()) clearTimeout(timer);
    timers.clear();
  };

  return { processPayload, stop };
};
