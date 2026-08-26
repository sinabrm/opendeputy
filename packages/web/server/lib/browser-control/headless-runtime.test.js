import { describe, expect, test } from 'bun:test';
import path from 'node:path';

import {
  createHeadlessBrowserRuntime,
  isBlockedHeadlessBrowserUrl,
  resolveHeadlessBrowserConfig,
} from './headless-runtime.js';

describe('headless browser configuration', () => {
  test('is opt-in and keeps its profile under the OpenDeputy data directory', () => {
    expect(resolveHeadlessBrowserConfig({ env: {}, dataDir: '/data' })).toEqual({
      enabled: false,
      executablePath: null,
      userDataDir: path.join('/data', 'headless-browser'),
      noSandbox: false,
    });
    expect(resolveHeadlessBrowserConfig({
      env: {
        OPENDEPUTY_HEADLESS_BROWSER: 'true',
        OPENDEPUTY_BROWSER_EXECUTABLE: '/usr/bin/chromium',
        OPENDEPUTY_BROWSER_DATA_DIR: '/profiles/browser',
      },
      dataDir: '/data',
    })).toMatchObject({
      enabled: true,
      executablePath: '/usr/bin/chromium',
      userDataDir: '/profiles/browser',
    });
  });

  test('blocks common cloud metadata endpoints', () => {
    expect(isBlockedHeadlessBrowserUrl('http://169.254.169.254/latest/meta-data')).toBe(true);
    expect(isBlockedHeadlessBrowserUrl('http://metadata.google.internal/computeMetadata/v1/')).toBe(true);
    expect(isBlockedHeadlessBrowserUrl('http://metadata.google.internal./computeMetadata/v1/')).toBe(true);
    expect(isBlockedHeadlessBrowserUrl('http://[fd00:ec2::254]/latest/meta-data')).toBe(true);
    expect(isBlockedHeadlessBrowserUrl('https://example.com/')).toBe(false);
  });
});

describe('headless browser runtime', () => {
  test('lazily launches one persistent context and closes it on shutdown', async () => {
    const calls = [];
    let currentUrl = 'about:blank';
    let currentViewport = { width: 1440, height: 900 };
    const page = {
      isClosed: () => false,
      on: () => {},
      goto: async (url) => { calls.push(['goto', url]); currentUrl = url; },
      waitForLoadState: async () => {},
      title: async () => 'Example',
      url: () => currentUrl,
      setViewportSize: async (value) => { currentViewport = value; },
      viewportSize: () => currentViewport,
      screenshot: async () => Buffer.from('image'),
    };
    const context = {
      setDefaultTimeout: () => {},
      setDefaultNavigationTimeout: () => {},
      route: async () => {},
      on: () => {},
      pages: () => [page],
      newPage: async () => page,
      close: async () => { calls.push(['close']); },
    };
    const runtime = createHeadlessBrowserRuntime({
      env: {
        OPENDEPUTY_HEADLESS_BROWSER: 'true',
        OPENDEPUTY_BROWSER_EXECUTABLE: '/browser',
      },
      dataDir: '/data',
      fs: {
        access: async () => {},
        mkdir: async () => {},
      },
      loadPlaywright: async () => ({
        chromium: {
          launchPersistentContext: async (profile, options) => {
            calls.push(['launch', profile, options.executablePath, options.chromiumSandbox]);
            return context;
          },
        },
      }),
      logger: { info: () => {} },
    });

    await expect(runtime.request('browser.open', { url: 'https://example.com/' })).resolves.toMatchObject({
      opened: true,
      url: 'https://example.com/',
    });
    await expect(runtime.request('browser.resize', { viewport: 'mobile' })).resolves.toMatchObject({
      viewport: { mode: 'mobile', width: 390, height: 844 },
    });
    await expect(runtime.request('browser.capture', {})).resolves.toMatchObject({
      base64: Buffer.from('image').toString('base64'),
      mime: 'image/png',
      width: 390,
      height: 844,
    });
    await runtime.stop();

    expect(calls.filter(([name]) => name === 'launch')).toEqual([
      ['launch', path.join('/data', 'headless-browser'), '/browser', true],
    ]);
    expect(calls).toContainEqual(['goto', 'https://example.com/']);
    expect(calls.filter(([name]) => name === 'close')).toHaveLength(1);
  });

  test('refuses a metadata URL before navigation', async () => {
    const runtime = createHeadlessBrowserRuntime({
      env: { OPENDEPUTY_HEADLESS_BROWSER: 'true', OPENDEPUTY_BROWSER_EXECUTABLE: '/browser' },
      dataDir: '/data',
      fs: { access: async () => {}, mkdir: async () => {} },
      loadPlaywright: async () => ({
        chromium: {
          launchPersistentContext: async () => ({
            setDefaultTimeout: () => {},
            setDefaultNavigationTimeout: () => {},
            route: async () => {},
            on: () => {},
            pages: () => [{ isClosed: () => false, on: () => {} }],
            close: async () => {},
          }),
        },
      }),
      logger: { info: () => {} },
    });

    await expect(runtime.request('browser.open', { url: 'http://169.254.169.254/' }))
      .rejects.toThrow('metadata');
    await runtime.stop();
  });

  test('rejects on timeout even when Chromium launch never settles', async () => {
    let fireTimeout;
    const runtime = createHeadlessBrowserRuntime({
      env: { OPENDEPUTY_HEADLESS_BROWSER: 'true', OPENDEPUTY_BROWSER_EXECUTABLE: '/browser' },
      dataDir: '/data',
      fs: { access: async () => {}, mkdir: async () => {} },
      loadPlaywright: async () => ({
        chromium: { launchPersistentContext: () => new Promise(() => {}) },
      }),
      setTimer: (callback) => { fireTimeout = callback; return 1; },
      clearTimer: () => {},
      logger: { info: () => {} },
    });

    const inflight = runtime.request('browser.open', { url: 'https://example.com/' }, { timeoutMs: 5_000 });
    await Promise.resolve();
    fireTimeout();
    await expect(inflight).rejects.toThrow('within 5s');
  });
});
