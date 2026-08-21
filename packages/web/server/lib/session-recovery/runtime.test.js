import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createUnknownFinishRecoveryRuntime } from './runtime.js';

const SESSION_ID = 'ses_parent';
const DIRECTORY = '/workspace';

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const userMessage = (id = 'msg_user') => ({
  info: { id, sessionID: SESSION_ID, role: 'user', time: { created: 1 } },
  parts: [{ type: 'text', text: 'Complete the work' }],
});

const unknownAssistant = (id = 'msg_unknown', overrides = {}) => ({
  info: {
    id,
    sessionID: SESSION_ID,
    parentID: 'msg_user',
    role: 'assistant',
    finish: 'unknown',
    providerID: 'opencode',
    modelID: 'muse-spark-1.2-contributor-free',
    agent: 'build',
    variant: 'xhigh',
    time: { completed: 10 },
    ...overrides,
  },
  parts: [
    { type: 'step-start' },
    { type: 'reasoning', text: '' },
    { type: 'step-finish', reason: 'unknown' },
  ],
});

const recoveryMessage = (id, attempt) => ({
  info: { id, sessionID: SESSION_ID, role: 'user', time: { created: attempt + 1 } },
  parts: [{
    type: 'text',
    text: `[OpenDeputy automatic recovery]\nAttempt ${attempt} of 2.`,
    synthetic: true,
  }],
});

const idlePayload = () => ({
  type: 'session.status',
  properties: { sessionID: SESSION_ID, status: { type: 'idle' }, directory: DIRECTORY },
});

const requestPath = (input) => new URL(typeof input === 'string' ? input : input.url).pathname;

const createRuntime = (fetchImpl, options = {}) => createUnknownFinishRecoveryRuntime({
  buildOpenCodeUrl: (pathname) => `http://opencode.test${pathname}`,
  getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer test' }),
  fetchImpl,
  quietMs: 10,
  ...options,
});

describe('empty unknown finish recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('continues with a hidden synthetic prompt using the same model and agent', async () => {
    const messages = [userMessage(), unknownAssistant()];
    const requests = [];
    const fetchImpl = vi.fn(async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      requests.push({ url, init });
      if (url.pathname === `/session/${SESSION_ID}`) return jsonResponse({ id: SESSION_ID });
      if (url.pathname === `/session/${SESSION_ID}/message`) return jsonResponse(messages);
      if (url.pathname === `/session/${SESSION_ID}/prompt_async`) return new Response(null, { status: 204 });
      throw new Error(`Unexpected request: ${url.pathname}`);
    });
    const runtime = createRuntime(fetchImpl);

    runtime.processPayload(idlePayload(), DIRECTORY);
    runtime.processPayload(idlePayload(), DIRECTORY);
    await vi.advanceTimersByTimeAsync(10);

    const prompts = requests.filter(({ url }) => url.pathname.endsWith('/prompt_async'));
    expect(prompts).toHaveLength(1);
    const [prompt] = prompts;
    expect(prompt?.url.searchParams.get('directory')).toBe(DIRECTORY);
    expect(prompt?.init.headers.Authorization).toBe('Bearer test');
    expect(JSON.parse(prompt.init.body)).toMatchObject({
      model: { providerID: 'opencode', modelID: 'muse-spark-1.2-contributor-free' },
      agent: 'build',
      variant: 'xhigh',
      parts: [{ type: 'text', synthetic: true }],
    });
    expect(JSON.parse(prompt.init.body).parts[0].text).toContain('Attempt 1 of 2');
    runtime.stop();
  });

  it.each([
    ['visible partial text', { parts: [{ type: 'text', text: 'Partial answer' }] }],
    ['a tool call', { parts: [{ type: 'tool', tool: 'bash', state: { status: 'completed' } }] }],
    ['a recorded error', { info: { error: { name: 'MessageAbortedError' } } }],
  ])('does not recover an unknown finish with %s', async (_name, change) => {
    const failed = unknownAssistant();
    if (change.info) Object.assign(failed.info, change.info);
    if (change.parts) failed.parts = change.parts;
    const fetchImpl = vi.fn(async (input) => {
      const pathname = requestPath(input);
      if (pathname === `/session/${SESSION_ID}`) return jsonResponse({ id: SESSION_ID });
      if (pathname === `/session/${SESSION_ID}/message`) return jsonResponse([userMessage(), failed]);
      throw new Error(`Unexpected request: ${pathname}`);
    });
    const runtime = createRuntime(fetchImpl);

    runtime.processPayload(idlePayload(), DIRECTORY);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchImpl.mock.calls.some(([input]) => requestPath(input).endsWith('/prompt_async'))).toBe(false);
    runtime.stop();
  });

  it('stops after two recoveries for the same visible user turn', async () => {
    const messages = [
      userMessage(),
      recoveryMessage('msg_recovery_1', 1),
      unknownAssistant('msg_unknown_1'),
      recoveryMessage('msg_recovery_2', 2),
      unknownAssistant('msg_unknown_2'),
    ];
    const fetchImpl = vi.fn(async (input) => {
      const pathname = requestPath(input);
      if (pathname === `/session/${SESSION_ID}`) return jsonResponse({ id: SESSION_ID });
      if (pathname === `/session/${SESSION_ID}/message`) return jsonResponse(messages);
      throw new Error(`Unexpected request: ${pathname}`);
    });
    const runtime = createRuntime(fetchImpl);

    runtime.processPayload(idlePayload(), DIRECTORY);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchImpl.mock.calls.some(([input]) => requestPath(input).endsWith('/prompt_async'))).toBe(false);
    runtime.stop();
  });

  it('drops recovery when the session tail moves during validation', async () => {
    const failed = unknownAssistant();
    let messageFetches = 0;
    const fetchImpl = vi.fn(async (input) => {
      const pathname = requestPath(input);
      if (pathname === `/session/${SESSION_ID}`) return jsonResponse({ id: SESSION_ID });
      if (pathname === `/session/${SESSION_ID}/message`) {
        messageFetches += 1;
        return jsonResponse(messageFetches === 1
          ? [userMessage(), failed]
          : [userMessage(), failed, userMessage('msg_new_user')]);
      }
      throw new Error(`Unexpected request: ${pathname}`);
    });
    const runtime = createRuntime(fetchImpl);

    runtime.processPayload(idlePayload(), DIRECTORY);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchImpl.mock.calls.some(([input]) => requestPath(input).endsWith('/prompt_async'))).toBe(false);
    runtime.stop();
  });

  it('skips child sessions', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const pathname = requestPath(input);
      if (pathname === `/session/${SESSION_ID}`) return jsonResponse({ id: SESSION_ID, parentID: 'ses_parent_root' });
      throw new Error(`Unexpected request: ${pathname}`);
    });
    const runtime = createRuntime(fetchImpl);

    runtime.processPayload(idlePayload(), DIRECTORY);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(requestPath(fetchImpl.mock.calls[0][0])).toBe(`/session/${SESSION_ID}`);
    runtime.stop();
  });

  it('cancels a pending retry when the user moves on', async () => {
    const fetchImpl = vi.fn();
    const runtime = createRuntime(fetchImpl);

    runtime.processPayload(idlePayload(), DIRECTORY);
    runtime.processPayload({
      type: 'message.updated',
      properties: {
        info: { role: 'user', sessionID: SESSION_ID, time: { created: Date.now() + 1 } },
      },
    }, DIRECTORY);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchImpl).not.toHaveBeenCalled();
    runtime.stop();
  });

  it('cancels a pending retry when the runtime stops', async () => {
    const fetchImpl = vi.fn();
    const runtime = createRuntime(fetchImpl);

    runtime.processPayload(idlePayload(), DIRECTORY);
    runtime.stop();
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
