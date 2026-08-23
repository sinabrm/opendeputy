import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgentToolRuntime } from './runtime.js';
import {
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS,
  OPENCHAMBER_CONTROL_ACTION_DEFINITIONS,
  OPENCHAMBER_WEB_ACTION_DEFINITIONS,
} from '../openchamber-control/actions.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const createRuntime = async (overrides = {}) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-agent-tool-'));
  temporaryDirectories.push(dataDir);
  const executeAction = vi.fn(async () => ({ projects: [] }));
  const env = {};
  const runtime = createAgentToolRuntime({
    crypto,
    fsPromises: fs,
    path,
    dataDir,
    getActivePort: () => 3901,
    executeAction,
    env,
    ...overrides,
  });
  return { runtime, dataDir, executeAction, env };
};

describe('agent tool action allowlist', () => {
  it('defines a short title and agent description for every action', () => {
    expect(OPENCHAMBER_CONTROL_ACTION_DEFINITIONS.every(({ action, title, description }) => action && title && description)).toBe(true);
  });

  it.each([
    'projects.list',
    'models.list',
    'panel.list',
    'panel.open',
    'panel.newBrowserTab',
    'panel.activate',
    'panel.closeTab',
    'panel.close',
    'panel.setExpanded',
    'session.list',
    'session.create',
    'session.send',
    'session.fork',
    'session.status',
    'session.messages',
    'schedule.list',
    'schedule.create',
    'schedule.run',
    'schedule.delete',
    'schedule.toggle',
  ])('delegates %s to the shared control service', async (action) => {
    const { runtime, executeAction } = await createRuntime();
    const input = { action, projectId: 'project-1' };
    await runtime.execute({ input, contextDirectory: '/work/project' });
    expect(executeAction).toHaveBeenCalledWith(action, input, '/work/project', {});
  });

  it.each([
    'session.delete',
    'schedule.status',
  ])('rejects %s outside the agent allowlist without invoking the service', async (action) => {
    const { runtime, executeAction } = await createRuntime();
    await expect(runtime.execute({ input: { action } })).resolves.toEqual(expect.objectContaining({
      ok: false,
      action,
      error: expect.objectContaining({ kind: 'usage' }),
    }));
    expect(executeAction).not.toHaveBeenCalled();
  });
});

describe('managed agent tool runtime', () => {
  it('materializes the plugin and preserves configured plugin entries', async () => {
    const { runtime, dataDir, env } = await createRuntime();
    env.OPENCODE_CONFIG_CONTENT = '{ // existing\n "plugin": ["file:///existing.js", ["example-plugin", {"flag": true}]], "model": "test/model" }';
    env.OPENDEPUTY_COMPUTER_USE_BINARY = path.join(dataDir, 'open-computer-use.exe');
    env.OPENDEPUTY_TOUCHPOINT_PYTHON = path.join(dataDir, 'touchpoint-runtime', 'python.exe');
    env.OPENDEPUTY_AGENT_KIT_ROOT = path.join(dataDir, 'packaged-agent-kit');
    env.OPENDEPUTY_NODE_BINARY = path.join(dataDir, 'OpenDeputy.exe');
    env.OPENDEPUTY_OPENCODE_BINARY = path.join(dataDir, 'opencode.exe');
    env.USERPROFILE = dataDir;

    const preparedEnv = await runtime.prepareManagedOpenCodeEnv();
    const config = JSON.parse(preparedEnv.OPENCODE_CONFIG_CONTENT);
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const source = await fs.readFile(pluginPath, 'utf8');

    expect(config.model).toBe('test/model');
    expect(config.plugin).toEqual([
      'file:///existing.js',
      ['example-plugin', { flag: true }],
      expect.stringContaining('/agent-tool/opendeputy-plugin.js'),
    ]);
    expect(Object.keys(config.mcp)).toEqual([
      'playwright',
      'open_computer_use',
      'open_browser_use',
      'computer_use',
      'agent_overlay',
      'touchpoint',
      'visual_grounding',
      'workspace_tools',
    ]);
    expect(config.mcp.open_computer_use).toEqual({
      type: 'local',
      command: [env.OPENDEPUTY_COMPUTER_USE_BINARY, 'mcp'],
      enabled: true,
      timeout: 30_000,
    });
    expect(config.mcp.playwright.command).toEqual([
      env.OPENDEPUTY_NODE_BINARY,
      path.join(env.OPENDEPUTY_AGENT_KIT_ROOT, 'node_modules', '@playwright', 'mcp', 'cli.js'),
      '--browser',
      'chrome',
    ]);
    expect(config.mcp.touchpoint).toEqual({
      type: 'local',
      command: [env.OPENDEPUTY_TOUCHPOINT_PYTHON, '-m', 'touchpoint.mcp.server'],
      enabled: true,
      timeout: 30_000,
      environment: {
        PYTHONNOUSERSITE: '1',
        PYTHONUTF8: '1',
        TOUCHPOINT_CDP_DISCOVER: 'true',
        TOUCHPOINT_FALLBACK_INPUT: 'false',
      },
    });
    expect(config.mcp.agent_overlay.timeout).toBe(30_000);
    expect(config.skills.paths).toEqual([
      path.join(env.OPENDEPUTY_AGENT_KIT_ROOT, 'skills', 'computer-control'),
      path.join(env.OPENDEPUTY_AGENT_KIT_ROOT, 'skills', 'desktop-workspace'),
      path.join(env.OPENDEPUTY_AGENT_KIT_ROOT, 'skills', 'open-browser-use'),
      path.join(env.OPENDEPUTY_AGENT_KIT_ROOT, 'skills', 'open-computer-use'),
    ]);
    expect(config.permission['open_computer_use_*']).toBe('ask');
    expect(config.permission.open_computer_use_list_apps).toBe('allow');
    expect(preparedEnv.OPENCHAMBER_AGENT_TOOL_URL).toBe('http://127.0.0.1:3901/api/openchamber/agent-tool');
    expect(preparedEnv.OPENCHAMBER_AGENT_TOOL_TOKEN).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(source).toContain('opendeputy: {');
    for (const { action, description } of OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS) {
      expect(source).toContain(JSON.stringify({ const: action, description }));
    }
    expect(source).not.toContain('"schedule.status"');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?schema=${Date.now()}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    expect(hooks.tool.opendeputy.description).toContain('Session dispatches return immediately by default');
    expect(hooks.tool.opendeputy.description).toContain('Set wait only when the user asks or the next step requires the completed result');
    expect(hooks.tool.opendeputy_panel.description).toContain("built-in right-panel surfaces");
    expect(hooks.tool.opendeputy_panel.description).toContain('Do the underlying work with native file/edit');
    expect(hooks.tool.opendeputy_panel.description).toContain('cannot close its window');
    expect(hooks.tool.opendeputy_web.description).toContain('every unqualified request');
    expect(hooks.tool.opendeputy_web.description).toContain('creates or reuses and focuses the Browser tab');
    expect(hooks.tool.opendeputy_web.description).toContain('explicitly requests an external browser');
    expect(hooks.tool.opendeputy.args.action.oneOf).toContainEqual({
      const: 'session.messages',
      description: 'Read text-only messages and current sessionStatus for sessionId; directory and limit 10 are defaults',
    });
    expect(hooks.tool.opendeputy.args.parameters.properties.wait.description).toBe(
      'Wait for current session activity to become idle. Omit by default; use only when the user asks or the next step requires the completed result',
    );
    expect(hooks.tool.opendeputy.args.parameters.properties.sessionId).toEqual({ type: 'string' });
    expect(hooks.tool.opendeputy_panel.args.parameters.properties.panelMode.enum).toEqual([
      'context', 'git', 'pr', 'changes', 'walkthrough', 'files', 'terminal', 'notes', 'plan', 'browser', 'chat',
    ]);
    expect(hooks.tool.opendeputy_panel.args.parameters.properties.tabId.description).toContain('panel.list');
    expect(source).not.toContain('title: "OpenChamber"');
    expect(source).not.toContain('@opencode-ai/plugin');
    expect(source).not.toContain(preparedEnv.OPENCHAMBER_AGENT_TOOL_TOKEN);
  });

  it('emits separate control, panel, web, and workspace tools with scoped inputs', async () => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?both=${Date.now()}`);
    const { tool } = await pluginModule.OpenDeputyPlugin();

    const controlActions = tool.opendeputy.args.action.enum;
    const panelActions = tool.opendeputy_panel.args.action.enum;
    const webActions = tool.opendeputy_web.args.action.enum;
    const workspaceActions = tool.opendeputy_workspace.args.action.enum;
    expect(webActions).toContain('browser.open');
    expect(controlActions).not.toContain('browser.open');
    expect(controlActions).not.toContain('panel.closeTab');
    expect(panelActions).toContain('panel.closeTab');
    expect(panelActions).not.toContain('session.create');
    expect(webActions).not.toContain('session.create');
    expect(workspaceActions).toContain('memory.search');
    expect(workspaceActions).not.toContain('browser.open');

    // Turning one tool off has to remove its inputs too, not just its actions.
    expect(Object.keys(tool.opendeputy_web.args.parameters.properties)).toContain('url');
    expect(Object.keys(tool.opendeputy.args.parameters.properties)).not.toContain('url');
    expect(Object.keys(tool.opendeputy.args.parameters.properties)).toContain('sessionId');
    expect(Object.keys(tool.opendeputy.args.parameters.properties)).not.toContain('panelMode');
    expect(Object.keys(tool.opendeputy_panel.args.parameters.properties)).toContain('panelMode');
    expect(Object.keys(tool.opendeputy_panel.args.parameters.properties)).toContain('tabId');
    expect(Object.keys(tool.opendeputy_workspace.args.parameters.properties)).toContain('inputPath');
  });

  it('routes ordinary browser requests to the in-app panel', () => {
    const browserOpen = OPENCHAMBER_WEB_ACTION_DEFINITIONS.find(({ action }) => action === 'browser.open');

    expect(browserOpen?.description).toContain('Default for an unqualified browser');
    expect(browserOpen?.description).toContain('focus the in-app Browser tab in the right panel');
  });

  it('adds the internal-surface default to the always-loaded system prompt once', async () => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?system=${Date.now()}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    const output = { system: ['base prompt'] };

    await hooks['experimental.chat.system.transform']({ sessionID: 'system-test' }, output);
    await hooks['experimental.chat.system.transform']({ sessionID: 'system-test' }, output);

    expect(output.system).toHaveLength(2);
    expect(output.system[1]).toContain('OpenDeputy routing is internal-first in every language');
    expect(output.system[1]).toContain('Context, Git, PR/Pull Request, Changes/Diff, Walkthrough, Files/Editor, Terminal, Project Notes, Plan, Browser, Chat');
    expect(output.system[1]).toContain('Use opendeputy_panel panel.open');
    expect(output.system[1]).toContain('no built-in surface or direct tool supports the request');
  });

  it.each([
    ['context', 'Open the Context panel'],
    ['git', 'Show Git in the right panel'],
    ['pr', 'Open the PR panel'],
    ['changes', 'Inspect the Changes panel'],
    ['walkthrough', 'Show the Walkthrough'],
    ['files', 'Use the Files panel'],
    ['terminal', 'Run this in the Terminal'],
    ['notes', 'Write this in Project Notes'],
    ['plan', 'Open the Plan panel'],
    ['browser', 'Check the Browser panel'],
    ['chat', 'Open the Chat panel'],
  ])('keeps the %s surface inside OpenDeputy', async (surface, prompt) => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?surface=${Date.now()}-${surface}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    const sessionID = `surface-${surface}`;

    await hooks['chat.message'](
      { sessionID },
      { message: { role: 'user' }, parts: [{ type: 'text', text: prompt }] },
    );

    await expect(hooks['tool.execute.before'](
      { tool: 'open_computer_use_get_app_state', sessionID, callID: 'desktop-call' },
      { args: { app: 'OpenDeputy' } },
    )).rejects.toThrow(/routing blocked|external-browser fallback/);
    await expect(hooks['tool.execute.before'](
      { tool: 'opendeputy_panel', sessionID, callID: 'panel-call' },
      { args: { action: 'panel.open', parameters: { panelMode: surface } } },
    )).resolves.toBeUndefined();
  });

  it.each([
    ['Persian', 'ترمینال را باز کن'],
    ['German', 'Öffne die Git-Ansicht'],
    ['Japanese', 'ファイルパネルを開いて'],
    ['Chinese', '打开项目笔记'],
    ['Arabic', 'اعرض التغييرات'],
  ])('keeps an unqualified %s surface request inside OpenDeputy', async (_language, prompt) => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?surface-language=${Date.now()}-${encodeURIComponent(_language)}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    const sessionID = `surface-language-${_language}`;

    await hooks['chat.message'](
      { sessionID },
      { message: { role: 'user' }, parts: [{ type: 'text', text: prompt }] },
    );

    await expect(hooks['tool.execute.before'](
      { tool: 'touchpoint_snapshot', sessionID, callID: 'desktop-call' },
      { args: { app: 'OpenDeputy' } },
    )).rejects.toThrow('right-panel routing blocked desktop control');
  });

  it.each([
    ['Windows Terminal', 'Open Windows Terminal and run dir'],
    ['VS Code', 'Use VS Code to edit the files'],
    ['GitHub Desktop', 'Show the changes in GitHub Desktop'],
  ])('allows an explicitly named external app: %s', async (_app, prompt) => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?external-app=${Date.now()}-${encodeURIComponent(_app)}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    const sessionID = `external-app-${_app}`;

    await hooks['chat.message'](
      { sessionID },
      { message: { role: 'user' }, parts: [{ type: 'text', text: prompt }] },
    );

    await expect(hooks['tool.execute.before'](
      { tool: 'open_computer_use_get_app_state', sessionID, callID: 'desktop-call' },
      { args: { app: _app } },
    )).resolves.toBeUndefined();
  });

  it('leaves unsupported app requests available to desktop control', async () => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?unsupported-app=${Date.now()}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    const sessionID = 'unsupported-calculator';

    await hooks['chat.message'](
      { sessionID },
      { message: { role: 'user' }, parts: [{ type: 'text', text: 'Open Calculator' }] },
    );

    await expect(hooks['tool.execute.before'](
      { tool: 'open_computer_use_get_app_state', sessionID, callID: 'desktop-call' },
      { args: { app: 'Calculator' } },
    )).resolves.toBeUndefined();
  });

  it.each([
    ['English', 'Check how many tabs are open in the browser'],
    ['Persian', 'یه چک بکن ببین توی مرورگر چنتا تب باز داریم'],
    ['German', 'Prüfe, wie viele Tabs im Browser geöffnet sind'],
    ['Japanese', 'ブラウザで開いているタブがいくつあるか確認して'],
    ['Chinese', '检查浏览器里打开了几个标签页'],
    ['Arabic', 'تحقق من عدد علامات التبويب المفتوحة في المتصفح'],
  ])('blocks external-browser fallback for an unqualified %s request', async (_language, prompt) => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?internal=${Date.now()}-${encodeURIComponent(_language)}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    const sessionID = `internal-${_language}`;

    await hooks['chat.message'](
      { sessionID },
      { message: { role: 'user' }, parts: [{ type: 'text', text: prompt }] },
    );

    await expect(hooks['tool.execute.before'](
      { tool: 'open_browser_use_tabs', sessionID, callID: 'obu-call' },
      { args: {} },
    )).rejects.toThrow('defaults to the in-app Browser');
    await expect(hooks['tool.execute.before'](
      { tool: 'touchpoint_snapshot', sessionID, callID: 'desktop-call' },
      { args: { app: 'firefox' } },
    )).rejects.toThrow('Use opendeputy_panel with panel.list');
    await expect(hooks['tool.execute.before'](
      { tool: 'opendeputy_panel', sessionID, callID: 'panel-call' },
      { args: { action: 'panel.list', parameters: {} } },
    )).resolves.toBeUndefined();
  });

  it.each([
    ['English', 'Check the tabs in Firefox'],
    ['OpenDeputy wording', 'In OpenDeputy, use Firefox to check the tabs'],
    ['Named tool', 'Use Open Browser Use to check my existing user tab'],
    ['Persian', 'تب‌های فایرفاکس را بررسی کن'],
    ['German', 'Prüfe die Tabs in Chrome'],
    ['Japanese', 'Chromeのタブを確認して'],
    ['Chinese', '检查 Firefox 标签页'],
    ['Arabic', 'تحقق من علامات التبويب في Chrome'],
  ])('allows an explicitly requested external browser in %s', async (_language, prompt) => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?external=${Date.now()}-${encodeURIComponent(_language)}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    const sessionID = `external-${_language}`;

    await hooks['chat.message'](
      { sessionID },
      { message: { role: 'user' }, parts: [{ type: 'text', text: prompt }] },
    );

    await expect(hooks['tool.execute.before'](
      { tool: 'open_browser_use_tabs', sessionID, callID: 'obu-call' },
      { args: {} },
    )).resolves.toBeUndefined();
    await expect(hooks['tool.execute.before'](
      { tool: 'touchpoint_snapshot', sessionID, callID: 'desktop-call' },
      { args: { app: 'firefox' } },
    )).resolves.toBeUndefined();
  });

  it('keeps unrelated desktop control available after an internal-browser turn', async () => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?desktop=${Date.now()}`);
    const hooks = await pluginModule.OpenDeputyPlugin();
    const sessionID = 'desktop-after-browser';

    await hooks['chat.message'](
      { sessionID },
      { message: { role: 'user' }, parts: [{ type: 'text', text: 'Open the internal browser' }] },
    );
    await hooks['chat.message'](
      { sessionID },
      { message: { role: 'user' }, parts: [{ type: 'text', text: 'Now inspect Notepad' }] },
    );

    await expect(hooks['tool.execute.before'](
      { tool: 'touchpoint_snapshot', sessionID, callID: 'notepad-call' },
      { args: { app: 'notepad' } },
    )).resolves.toBeUndefined();
  });

  it('accepts inputs passed beside the action, not only inside parameters', async () => {
    const { runtime, dataDir } = await createRuntime();
    const prepared = await runtime.prepareManagedOpenCodeEnv();
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?flat=${Date.now()}`);
    const { tool } = await pluginModule.OpenDeputyPlugin();

    const sent = [];
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.OPENCHAMBER_AGENT_TOOL_URL;
    const originalToken = process.env.OPENCHAMBER_AGENT_TOOL_TOKEN;
    process.env.OPENCHAMBER_AGENT_TOOL_URL = prepared.OPENCHAMBER_AGENT_TOOL_URL;
    process.env.OPENCHAMBER_AGENT_TOOL_TOKEN = prepared.OPENCHAMBER_AGENT_TOOL_TOKEN;
    globalThis.fetch = async (_endpoint, init) => {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ schemaVersion: 1, ok: true, action: 'browser.open', data: {} }));
    };
    const context = { directory: '/work/project', abort: new AbortController().signal, metadata: () => {} };

    try {
      // The shape a model actually produced: url and viewport next to action.
      await tool.opendeputy_web.execute(
        { action: 'browser.open', url: 'https://example.test', viewport: 'mobile' },
        context,
      );
      // The documented shape must keep working, and win when both are present.
      await tool.opendeputy_web.execute(
        { action: 'browser.open', url: 'https://ignored.test', parameters: { url: 'https://example.test/nested' } },
        context,
      );
      // Both tools come from one template, so session control accepts it too.
      await tool.opendeputy.execute(
        { action: 'session.messages', sessionId: 'ses_1', limit: 3 },
        context,
      );
    } finally {
      globalThis.fetch = originalFetch;
      process.env.OPENCHAMBER_AGENT_TOOL_URL = originalUrl;
      process.env.OPENCHAMBER_AGENT_TOOL_TOKEN = originalToken;
    }

    expect(sent[0].input).toEqual({ action: 'browser.open', url: 'https://example.test', viewport: 'mobile' });
    expect(sent[1].input.url).toBe('https://example.test/nested');
    expect(sent[2].input).toEqual({ action: 'session.messages', sessionId: 'ses_1', limit: 3 });
  });

  it('omits a tool the user turned off', async () => {
    const { runtime, dataDir } = await createRuntime();
    await runtime.prepareManagedOpenCodeEnv({ includeControl: false, includeWeb: true, includeWorkspace: false });
    const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
    const pluginModule = await import(`${pathToFileURL(pluginPath).href}?web=${Date.now()}`);
    const { tool } = await pluginModule.OpenDeputyPlugin();

    expect(Object.keys(tool)).toEqual(['opendeputy_web']);
  });

  it('refuses to inject a plugin with no tools in it', async () => {
    const { runtime } = await createRuntime();
    let failed = false;
    try {
      await runtime.prepareManagedOpenCodeEnv({ includeControl: false, includeWeb: false, includeWorkspace: false });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it('executes actions through the shared control service', async () => {
    const executeAction = vi.fn(async () => ({ projects: [] }));
    const { runtime } = await createRuntime({ executeAction });
    const result = await runtime.execute({
      input: { action: 'projects.list' },
      contextDirectory: '/work/project',
    });

    expect(result).toEqual({
      schemaVersion: 1,
      ok: true,
      action: 'projects.list',
      data: { projects: [] },
    });
    expect(executeAction).toHaveBeenCalledWith('projects.list', { action: 'projects.list' }, '/work/project', {});
  });

  it('keeps service failures as structured tool results', async () => {
    const error = Object.assign(new Error('Task not found'), { statusCode: 404 });
    const { runtime } = await createRuntime({ executeAction: vi.fn(async () => { throw error; }) });

    await expect(runtime.execute({
      input: { action: 'schedule.run', taskId: 'missing' },
      contextDirectory: '/work/project',
    })).resolves.toEqual(expect.objectContaining({
      schemaVersion: 1,
      ok: false,
      action: 'schedule.run',
      error: { message: 'Task not found', kind: 'usage' },
    }));
  });

  it('forwards cancellation to the shared control service', async () => {
    const executeAction = vi.fn(async (_action, _input, _directory, options) => {
      await new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('OpenChamber action was cancelled'), { statusCode: 499 })), { once: true });
      });
    });
    const { runtime } = await createRuntime({ executeAction });
    const controller = new AbortController();
    const pending = runtime.execute({ input: { action: 'projects.list' } }, { signal: controller.signal });

    controller.abort();

    await expect(pending).resolves.toEqual(expect.objectContaining({
      ok: false,
      action: 'projects.list',
      error: { message: 'OpenChamber action was cancelled', kind: 'runtime' },
    }));
    expect(executeAction).toHaveBeenCalledWith('projects.list', { action: 'projects.list' }, undefined, { signal: controller.signal });
  });

  it('requires the per-child token on the loopback route', async () => {
    const { runtime } = await createRuntime();
    const env = await runtime.prepareManagedOpenCodeEnv();
    const app = express();
    runtime.registerRoutes(app, express);

    await request(app)
      .post('/api/openchamber/agent-tool')
      .send({ input: { action: 'projects.list' } })
      .expect(401);

    const response = await request(app)
      .post('/api/openchamber/agent-tool')
      .set('authorization', `Bearer ${env.OPENCHAMBER_AGENT_TOOL_TOKEN}`)
      .send({ input: { action: 'projects.list' } })
      .expect(200);
    expect(response.body).toEqual(expect.objectContaining({ ok: true, action: 'projects.list' }));
  });

  it('executes through the materialized plugin and authenticated callback', async () => {
    let activePort = null;
    const { runtime, dataDir } = await createRuntime({ getActivePort: () => activePort });
    const app = express();
    runtime.registerRoutes(app, express);
    const server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    activePort = server.address().port;

    const previousUrl = process.env.OPENCHAMBER_AGENT_TOOL_URL;
    const previousToken = process.env.OPENCHAMBER_AGENT_TOOL_TOKEN;
    try {
      const env = await runtime.prepareManagedOpenCodeEnv();
      process.env.OPENCHAMBER_AGENT_TOOL_URL = env.OPENCHAMBER_AGENT_TOOL_URL;
      process.env.OPENCHAMBER_AGENT_TOOL_TOKEN = env.OPENCHAMBER_AGENT_TOOL_TOKEN;
      const pluginPath = path.join(dataDir, 'agent-tool', 'opendeputy-plugin.js');
      const pluginModule = await import(`${pathToFileURL(pluginPath).href}?test=${Date.now()}`);
      const hooks = await pluginModule.OpenDeputyPlugin();
      const metadata = vi.fn();

      const result = await hooks.tool.opendeputy.execute(
        { action: 'projects.list', parameters: {} },
        { directory: '/work/project', abort: new AbortController().signal, metadata },
      );

      expect(JSON.parse(result.output)).toEqual({
        schemaVersion: 1,
        ok: true,
        action: 'projects.list',
        data: { projects: [] },
      });
      expect(result.title).toBe('List configured projects');
      expect(result.metadata.opendeputy.description).toBe('List configured projects');
      expect(metadata).toHaveBeenCalledWith(expect.objectContaining({
        title: 'List configured projects',
        metadata: expect.objectContaining({
          opendeputy: expect.objectContaining({ description: 'List configured projects' }),
        }),
      }));
    } finally {
      if (previousUrl === undefined) delete process.env.OPENCHAMBER_AGENT_TOOL_URL;
      else process.env.OPENCHAMBER_AGENT_TOOL_URL = previousUrl;
      if (previousToken === undefined) delete process.env.OPENCHAMBER_AGENT_TOOL_TOKEN;
      else process.env.OPENCHAMBER_AGENT_TOOL_TOKEN = previousToken;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
