// Recover a session when OpenCode ends a model stream without a usable answer.
// The continuation is a fully synthetic user message, so OpenDeputy merges it
// into the existing turn instead of showing a request the user never typed.

const IDLE_QUIET_MS = 1_000;
const INTERRUPTED_TURN_WATCHDOG_MS = 15_000;
const BUSY_RECHECK_DELAY_MS = 30_000;
const MAX_BUSY_RECHECKS = 6;
const FETCH_TIMEOUT_MS = 10_000;
const MESSAGE_FETCH_LIMIT = 120;
const MAX_AUTO_RECOVERY_ATTEMPTS = 2;
const RECOVERY_PROMPT_PREFIX = '[OpenDeputy automatic recovery]';

// These errors are safe to retry once or twice because they normally describe a
// transient provider/transport failure. User aborts and permission failures are
// deliberately excluded: retrying those would violate an explicit user choice.
const TRANSIENT_ERROR_PATTERN = /(?:5\d\d|408|429|abort(?:ed)? by (?:the )?host|ai_apicallerror|upstream request failed|rate limit|tim(?:e|ed)[ -]?out|timeout|network|socket|connection|fetch|parser faas|temporar|overloaded|unavailable|reset)/i;
const NON_RETRYABLE_ERROR_PATTERN = /(?:messageabortederror|user abort|cancel(?:led|ed)|permission denied|access denied|not allowed|authentication|unauthori[sz]ed|invalid api key|insufficient balance|content policy)/i;

const buildRecoveryPrompt = (attempt, maxAttempts) => [
  RECOVERY_PROMPT_PREFIX,
  `Attempt ${attempt} of ${maxAttempts}.`,
  'The previous model turn ended unexpectedly before producing a usable final response.',
  'Continue the latest user request from the existing session state.',
  'If a tool command failed, use its exact output to repair the command or file and retry only that failed step.',
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

const extractAssistantMessage = (payload) => {
  if (!payload || payload.type !== 'message.updated') return null;
  const info = payload.properties?.info;
  if (!info || typeof info !== 'object' || info.role !== 'assistant') return null;
  if (typeof info.sessionID !== 'string' || !info.sessionID) return null;
  const directory = typeof payload.properties?.directory === 'string'
    ? payload.properties.directory
    : (typeof info.directory === 'string' ? info.directory : '');
  return { sessionId: info.sessionID, directory, message: { info, parts: [] } };
};

const messageInfo = (message) => (message?.info && typeof message.info === 'object' ? message.info : null);
const messageParts = (message) => (Array.isArray(message?.parts) ? message.parts : []);

const errorText = (error) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);
  const values = [
    error.name,
    error.message,
    error.code,
    error.statusCode,
    error.type,
    error.data?.name,
    error.data?.message,
    error.error?.name,
    error.error?.message,
    error.cause?.name,
    error.cause?.message,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map(String);
  return values.join(' ');
};

const hasSubstantivePart = (message) => messageParts(message).some((part) => {
  if (!part || typeof part !== 'object') return false;
  if (part.type === 'text' || part.type === 'reasoning') {
    return typeof part.text === 'string' && part.text.trim().length > 0;
  }
  return part.type !== 'step-start' && part.type !== 'step-finish';
});

const isRetryableAssistantError = (message) => {
  const info = messageInfo(message);
  if (!info?.error) return false;
  const text = errorText(info.error);
  if (NON_RETRYABLE_ERROR_PATTERN.test(text)) return false;
  // Invalid requests are usually deterministic. The parser/FaaS and timeout
  // variants are transient, so keep those eligible for the bounded retry.
  if (/invalid_request_error/i.test(text) && !/(?:parser faas|timeout|temporar)/i.test(text)) return false;
  // Unknown provider errors are still bounded by MAX_AUTO_RECOVERY_ATTEMPTS;
  // recognized permanent errors above are the ones that must not be retried.
  return TRANSIENT_ERROR_PATTERN.test(text) || !text || !/permanent|unsupported|not found/i.test(text);
};

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
  return !hasSubstantivePart(message);
};

// A provider can persist the next assistant message before it has written a
// finish marker. This is the shape from the reported session: the preceding
// assistant turn has a completed (failed) bash result, then the new assistant
// record is empty and never receives `time.completed`.
const isUnfinishedAssistant = (message) => {
  const info = messageInfo(message);
  if (!info || info.role !== 'assistant' || info.error) return false;
  if (typeof info.id !== 'string' || !info.id) return false;
  if (Number.isFinite(info.time?.completed)) return false;
  return !hasSubstantivePart(message);
};

// Provider failures with no usable text can also be resumed. A completed
// answer is never retried; only an empty/partial failure is eligible.
const isRecoverableAssistantError = (message) => {
  const info = messageInfo(message);
  if (!info || info.role !== 'assistant' || !info.error) return false;
  // If the failed assistant already contains text, a file, or any tool part,
  // retrying could duplicate visible output or a side effect. Only an empty
  // failed turn is safe for this automatic continuation.
  if (typeof info.id !== 'string' || !info.id || hasSubstantivePart(message)) return false;
  return isRetryableAssistantError(message);
};

const isRecoverableAssistantTail = (message) => (
  isEmptyUnknownAssistant(message)
  || isUnfinishedAssistant(message)
  || isRecoverableAssistantError(message)
);

export const createUnknownFinishRecoveryRuntime = ({
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  fetchImpl = fetch,
  quietMs = IDLE_QUIET_MS,
  interruptedTurnWatchdogMs = INTERRUPTED_TURN_WATCHDOG_MS,
  busyRecheckDelayMs = BUSY_RECHECK_DELAY_MS,
  maxBusyRechecks = MAX_BUSY_RECHECKS,
  maxAttempts = MAX_AUTO_RECOVERY_ATTEMPTS,
}) => {
  const timers = new Map();
  const inflight = new Set();
  const busyRechecks = new Map();
  const lastEventActivityBySession = new Map();
  let stopped = false;

  const clearScheduledTimer = (sessionId) => {
    const existing = timers.get(sessionId);
    if (!existing) return;
    clearTimeout(existing.timer);
    timers.delete(sessionId);
  };

  const clearTimer = (sessionId) => {
    clearScheduledTimer(sessionId);
    busyRechecks.delete(sessionId);
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

  const fetchSessionActivity = async (sessionId, directory) => {
    const statuses = await fetchJson('/session/status', directory);
    if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) {
      const lastEventStatus = lastEventActivityBySession.get(sessionId);
      return lastEventStatus === 'busy' || lastEventStatus === 'retry' ? lastEventStatus : null;
    }
    const status = statuses[sessionId];
    if (!status || typeof status !== 'object') {
      // A valid status map omits idle sessions, so absence here is authoritative
      // idle evidence. The local event state is only a fallback when the whole
      // status response is malformed/unavailable (handled above).
      return 'idle';
    }
    const type = typeof status.type === 'string' ? status.type.trim() : '';
    if (type === 'busy' || type === 'retry') return type;
    if (type === 'idle') return 'idle';
    return null;
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

  const recover = async (sessionId, directory, checkActivity = false) => {
    const session = await fetchJson(`/session/${encodeURIComponent(sessionId)}`, directory);
    if (!session || typeof session !== 'object') return;
    if (typeof session.parentID === 'string' && session.parentID) return;

    const sessionDirectory = directory || (typeof session.directory === 'string' ? session.directory : '');
    if (checkActivity) {
      const activity = await fetchSessionActivity(sessionId, sessionDirectory);
      if (activity === 'busy' || activity === 'retry') return 'busy';
      if (!activity) return;
    }

    const messages = await fetchRecentMessages(sessionId, sessionDirectory);
    if (!messages?.length) return;
    const failedMessage = messages[messages.length - 1];
    if (!isRecoverableAssistantTail(failedMessage)) return;

    const attempts = recoveryAttemptsForLatestUserTurn(messages);
    if (attempts === null || attempts >= maxAttempts) {
      if (attempts !== null) {
        console.warn(`[session-recovery] ${sessionId} reached the ${maxAttempts}-attempt recovery limit`);
      }
      return;
    }

    const failedInfo = messageInfo(failedMessage);
    const latest = await fetchRecentMessages(sessionId, sessionDirectory);
    const latestInfo = latest?.length ? messageInfo(latest[latest.length - 1]) : null;
    if (!latestInfo || latestInfo.id !== failedInfo.id || !isRecoverableAssistantTail(latest[latest.length - 1])) {
      console.log('[session-recovery] tail moved on, dropping automatic recovery');
      return;
    }
    if (stopped) return;

    const attempt = attempts + 1;
    let sent;
    try {
      sent = await sendRecovery({
        sessionId,
        directory: sessionDirectory,
        lastAssistantInfo: failedInfo,
        attempt,
      });
    } catch (error) {
      // The POST may have reached OpenCode even when the response failed. Do
      // not automatically resend it and risk duplicating a side effect.
      if (error && typeof error === 'object') error.recoveryPromptAttempted = true;
      throw error;
    }
    if (sent) console.log(`[session-recovery] retrying ${sessionId} (${attempt}/${maxAttempts})`);
  };

  const armTimer = (sessionId, directory, options = {}) => {
    clearScheduledTimer(sessionId);
    if (options.preserveBusyRechecks !== true) busyRechecks.delete(sessionId);
    const checkActivity = options.checkActivity === true;
    const delayMs = Number.isFinite(options.delayMs)
      ? Math.max(0, options.delayMs)
      : (checkActivity ? interruptedTurnWatchdogMs : quietMs);
    const timer = setTimeout(() => {
      timers.delete(sessionId);
      if (stopped || inflight.has(sessionId)) return;
      inflight.add(sessionId);
      recover(sessionId, directory, checkActivity)
        .then((result) => {
          if (result !== 'busy') busyRechecks.delete(sessionId);
          if (result !== 'busy' || stopped) return;
          const attempt = (busyRechecks.get(sessionId) ?? 0) + 1;
          if (attempt > maxBusyRechecks) {
            busyRechecks.delete(sessionId);
            console.warn(`[session-recovery] ${sessionId} remained busy; stopping watchdog after ${maxBusyRechecks} checks`);
            return;
          }
          busyRechecks.set(sessionId, attempt);
          armTimer(sessionId, directory, {
            checkActivity: true,
            delayMs: busyRecheckDelayMs,
            preserveBusyRechecks: true,
          });
        })
        .catch((error) => {
          console.warn('[session-recovery] automatic recovery failed:', error?.message || error);
          // A disconnected OpenCode endpoint must not strand the watchdog.
          // Retry checks with the same backoff, but never resend a prompt from
          // a normal error path unless a later authoritative event arms it.
          if (!checkActivity || stopped || error?.recoveryPromptAttempted) return;
          const attempt = (busyRechecks.get(sessionId) ?? 0) + 1;
          if (attempt > maxBusyRechecks) {
            busyRechecks.delete(sessionId);
            console.warn(`[session-recovery] ${sessionId} recovery checks failed; stopping watchdog after ${maxBusyRechecks} checks`);
            return;
          }
          busyRechecks.set(sessionId, attempt);
          armTimer(sessionId, directory, {
            checkActivity: true,
            delayMs: busyRecheckDelayMs,
            preserveBusyRechecks: true,
          });
        })
        .finally(() => {
          inflight.delete(sessionId);
        });
    }, delayMs);
    if (typeof timer?.unref === 'function') timer.unref();
    timers.set(sessionId, { timer, armedAt: Date.now(), checkActivity });
  };

  const processPayload = (payload, directoryHint = '') => {
    if (stopped) return;
    const status = extractSessionStatus(payload);
    if (status) {
      if (status.type === 'idle') {
        lastEventActivityBySession.delete(status.sessionId);
        armTimer(status.sessionId, status.directory || directoryHint);
      } else if (status.type === 'busy' || status.type === 'retry') {
        lastEventActivityBySession.set(status.sessionId, status.type);
        // Keep an unfinished-turn watchdog alive while OpenCode reports busy.
        // A normal idle timer is cancelled when a new turn starts, but a
        // watchdog is deliberately retained so a stream that never settles can
        // be checked again without sending a duplicate prompt while it runs.
        const existing = timers.get(status.sessionId);
        if (!existing?.checkActivity) {
          armTimer(status.sessionId, status.directory || directoryHint, { checkActivity: true });
        }
      } else {
        lastEventActivityBySession.set(status.sessionId, status.type);
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

    const assistantMessage = extractAssistantMessage(payload);
    if (assistantMessage && isRecoverableAssistantTail(assistantMessage.message)) {
      // This is a fallback for streams that never publish the final idle/error
      // event. The status check inside recover() prevents a still-running model
      // turn from being duplicated.
      armTimer(assistantMessage.sessionId, assistantMessage.directory || directoryHint, { checkActivity: true });
      return;
    }

    if (payload?.type === 'session.error') {
      const sessionId = typeof payload.properties?.sessionID === 'string'
        ? payload.properties.sessionID
        : (typeof payload.properties?.info?.sessionID === 'string' ? payload.properties.info.sessionID : '');
      // Error events settle the session just like idle events. The message
      // read below decides whether it is a user abort/permanent failure or a
      // recoverable provider/tool interruption.
      const eventDirectory = typeof payload.properties?.directory === 'string'
        ? payload.properties.directory
        : (typeof payload.properties?.info?.directory === 'string' ? payload.properties.info.directory : directoryHint);
      if (sessionId) {
        lastEventActivityBySession.delete(sessionId);
        armTimer(sessionId, eventDirectory);
      }
    }
  };

  const stop = () => {
    stopped = true;
    for (const { timer } of timers.values()) clearTimeout(timer);
    timers.clear();
    busyRechecks.clear();
    lastEventActivityBySession.clear();
  };

  return { processPayload, stop };
};
