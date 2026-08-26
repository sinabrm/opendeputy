import fsPromises from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ACTION_TIMEOUT_MS = 45_000;
const MAX_ACTION_TIMEOUT_MS = 120_000;
const MAX_TEXT_CHARS = 6_000;
const MAX_ELEMENTS = 120;
const MAX_LABEL_CHARS = 80;

const VIEWPORTS = Object.freeze({
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
  fill: { width: 1440, height: 900 },
});

const BLOCKED_METADATA_HOSTS = new Set([
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'fd00:ec2::254',
  'metadata.google.internal',
  'metadata.goog',
]);

const asEnabled = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

const asNonEmptyString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const viewportFor = (value) => VIEWPORTS[value] || VIEWPORTS.desktop;

const viewportSummary = (value) => {
  const viewport = viewportFor(value);
  return { mode: VIEWPORTS[value] ? value : 'desktop', ...viewport };
};

export class HeadlessBrowserError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'HeadlessBrowserError';
    this.status = status;
  }
}

export const isBlockedHeadlessBrowserUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    return BLOCKED_METADATA_HOSTS.has(hostname);
  } catch {
    return false;
  }
};

export const resolveHeadlessBrowserConfig = ({ env = process.env, dataDir }) => ({
  enabled: asEnabled(env.OPENDEPUTY_HEADLESS_BROWSER),
  executablePath: asNonEmptyString(env.OPENDEPUTY_BROWSER_EXECUTABLE),
  userDataDir: asNonEmptyString(env.OPENDEPUTY_BROWSER_DATA_DIR)
    || path.join(dataDir, 'headless-browser'),
  noSandbox: asEnabled(env.OPENDEPUTY_HEADLESS_BROWSER_NO_SANDBOX),
});

/**
 * A persistent browser owned by the server process.
 *
 * It is deliberately opt-in. Desktop builds keep using their visible Electron
 * browser, while a self-hosted server can enable this runtime and continue
 * browser work without a connected renderer.
 */
export const createHeadlessBrowserRuntime = ({
  env = process.env,
  dataDir,
  logger = console,
  loadPlaywright = () => import('playwright-core'),
  fs = fsPromises,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) => {
  if (!asNonEmptyString(dataDir)) throw new TypeError('dataDir is required');

  const config = resolveHeadlessBrowserConfig({ env, dataDir });
  let browserContext = null;
  let contextPromise = null;
  let closePromise = null;
  let activePage = null;
  let activeViewport = 'desktop';
  let actionQueue = Promise.resolve();
  let consoleProblems = [];
  const attachedPages = new WeakSet();

  const resolveExecutablePath = async () => {
    const candidates = [
      config.executablePath,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
      }
    }

    throw new HeadlessBrowserError(
      'Server browser is enabled but no Chromium executable was found. Set OPENDEPUTY_BROWSER_EXECUTABLE.',
      503,
    );
  };

  const attachPage = (page) => {
    activePage = page;
    if (attachedPages.has(page)) return;
    attachedPages.add(page);
    page.on?.('console', (message) => {
      const type = message.type?.() || '';
      if (type !== 'warning' && type !== 'error') return;
      consoleProblems.push({ level: type, message: String(message.text?.() || '').slice(0, 400), source: '' });
      if (consoleProblems.length > 20) consoleProblems = consoleProblems.slice(-20);
    });
    page.on?.('pageerror', (error) => {
      consoleProblems.push({ level: 'error', message: String(error?.message || error).slice(0, 400), source: '' });
      if (consoleProblems.length > 20) consoleProblems = consoleProblems.slice(-20);
    });
    page.on?.('close', () => {
      if (activePage === page) activePage = null;
    });
  };

  const closeBrowser = async () => {
    if (closePromise) return closePromise;
    const pendingContext = contextPromise;
    contextPromise = null;
    const currentContext = browserContext;
    browserContext = null;
    activePage = null;

    closePromise = (async () => {
      let context = currentContext;
      if (!context && pendingContext) {
        try { context = await pendingContext; } catch { context = null; }
      }
      if (context) {
        try { await context.close(); } catch {}
      }
    })().finally(() => {
      closePromise = null;
    });
    return closePromise;
  };

  const launchBrowser = async () => {
    if (closePromise) await closePromise;
    await fs.mkdir(config.userDataDir, { recursive: true });
    const executablePath = await resolveExecutablePath();
    const playwright = await loadPlaywright();
    const chromium = playwright?.chromium || playwright?.default?.chromium;
    if (!chromium?.launchPersistentContext) {
      throw new HeadlessBrowserError('playwright-core did not provide Chromium support', 503);
    }

    const args = ['--disable-dev-shm-usage'];
    if (config.noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');
    const context = await chromium.launchPersistentContext(config.userDataDir, {
      executablePath,
      headless: true,
      acceptDownloads: true,
      viewport: viewportFor(activeViewport),
      args,
      chromiumSandbox: !config.noSandbox,
      timeout: 30_000,
    });
    context.setDefaultTimeout?.(15_000);
    context.setDefaultNavigationTimeout?.(35_000);
    await context.route?.('**/*', async (route) => {
      const requestUrl = route.request?.().url?.() || '';
      if (isBlockedHeadlessBrowserUrl(requestUrl)) {
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    context.on?.('page', attachPage);
    context.on?.('close', () => {
      if (browserContext === context) browserContext = null;
      activePage = null;
    });

    browserContext = context;
    const pages = context.pages?.() || [];
    attachPage(pages[0] || await context.newPage());
    logger.info?.(`[headless-browser] Chromium ready at ${executablePath}`);
    return context;
  };

  const ensurePage = async () => {
    if (!config.enabled) throw new HeadlessBrowserError('Server browser is disabled', 503);
    if (activePage && !activePage.isClosed?.()) return activePage;
    if (!browserContext) {
      if (!contextPromise) {
        contextPromise = launchBrowser().finally(() => {
          contextPromise = null;
        });
      }
      await contextPromise;
    }
    if (!activePage || activePage.isClosed?.()) {
      attachPage(await browserContext.newPage());
    }
    return activePage;
  };

  const waitAfterInteraction = async (page) => {
    await page.waitForTimeout?.(120);
    try { await page.waitForLoadState?.('domcontentloaded', { timeout: 3_000 }); } catch {}
  };

  const snapshotPage = async (page, selector) => page.evaluate(({ scopeSelector, limits }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
    };
    const label = (element) => (
      element.getAttribute('aria-label')
      || element.innerText
      || element.textContent
      || element.getAttribute('value')
      || element.getAttribute('placeholder')
      || ''
    ).replace(/\s+/g, ' ').trim().slice(0, limits.maxLabelChars);
    const isUnique = (candidate) => {
      try { return document.querySelectorAll(candidate).length === 1; } catch { return false; }
    };
    const cssPath = (element) => {
      const tag = element.tagName.toLowerCase();
      if (element.id) {
        const candidate = `#${CSS.escape(element.id)}`;
        if (isUnique(candidate)) return candidate;
      }
      for (const attribute of ['data-testid', 'data-test-id', 'data-test', 'name', 'aria-label']) {
        const value = element.getAttribute(attribute);
        if (!value || String(value).includes('"')) continue;
        const candidate = `${tag}[${attribute}="${value}"]`;
        if (isUnique(candidate)) return candidate;
      }
      const parts = [];
      let node = element;
      let depth = 0;
      while (node && node.nodeType === 1 && depth < 6) {
        let part = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (!parent) { parts.unshift(part); break; }
        const siblings = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        parts.unshift(part);
        node = parent;
        depth += 1;
      }
      return parts.join(' > ');
    };

    let root = document;
    if (scopeSelector) {
      try { root = document.querySelector(scopeSelector); } catch { return { ok: false, error: `Invalid selector: ${scopeSelector}` }; }
      if (!root) return { ok: false, error: `No element matches ${scopeSelector}` };
    }
    const elements = [];
    let visibleTotal = 0;
    const candidates = root.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]');
    for (const element of candidates) {
      if (!visible(element)) continue;
      visibleTotal += 1;
      if (elements.length >= limits.maxElements) continue;
      const rect = element.getBoundingClientRect();
      const entry = {
        selector: cssPath(element),
        tag: element.tagName.toLowerCase(),
        bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      };
      if (rect.bottom > 0 && rect.top < window.innerHeight) entry.inViewport = true;
      const type = element.getAttribute('type');
      const role = element.getAttribute('role');
      const labelText = label(element);
      if (type) entry.type = type;
      if (role) entry.role = role;
      if (labelText) entry.label = labelText;
      if (element.disabled === true) entry.disabled = true;
      elements.push(entry);
    }
    const text = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    const documentElement = document.documentElement;
    const result = {
      ok: true,
      url: String(location.href),
      title: String(document.title || ''),
      scope: scopeSelector || 'document',
      scrollY: Math.round(window.scrollY),
      maxScrollY: Math.max(0, Math.round(documentElement.scrollHeight - window.innerHeight)),
      text: text.slice(0, limits.maxTextChars),
      elements,
    };
    if (text.length > limits.maxTextChars) {
      result.textTruncated = true;
      result.textTotalChars = text.length;
    }
    if (visibleTotal > elements.length) {
      result.elementsTruncated = true;
      result.interactiveElementsOnPage = visibleTotal;
    }
    return result;
  }, {
    scopeSelector: selector || '',
    limits: { maxTextChars: MAX_TEXT_CHARS, maxElements: MAX_ELEMENTS, maxLabelChars: MAX_LABEL_CHARS },
  });

  const performAction = async (action, parameters) => {
    const page = await ensurePage();

    if (action === 'browser.open') {
      const url = asNonEmptyString(parameters.url);
      if (!url) throw new HeadlessBrowserError('url is required', 400);
      if (isBlockedHeadlessBrowserUrl(url)) throw new HeadlessBrowserError('Cloud metadata endpoints are blocked', 403);
      if (VIEWPORTS[parameters.viewport]) {
        activeViewport = parameters.viewport;
        await page.setViewportSize(viewportFor(activeViewport));
      }
      consoleProblems = [];
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35_000 });
      let settled = true;
      try { await page.waitForLoadState('networkidle', { timeout: 5_000 }); } catch { settled = false; }
      return {
        url: page.url(),
        title: await page.title(),
        opened: true,
        settled,
        viewport: viewportSummary(activeViewport),
      };
    }

    if (action === 'browser.back' || action === 'browser.forward') {
      const response = action === 'browser.back'
        ? await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 })
        : await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15_000 });
      if (!response) throw new HeadlessBrowserError(action === 'browser.back' ? 'There is nothing to go back to' : 'There is nothing to go forward to', 400);
      return { url: page.url(), title: await page.title() };
    }

    if (action === 'browser.resize') {
      if (!VIEWPORTS[parameters.viewport]) throw new HeadlessBrowserError('viewport is required', 400);
      activeViewport = parameters.viewport;
      await page.setViewportSize(viewportFor(activeViewport));
      return { viewport: viewportSummary(activeViewport) };
    }

    if (action === 'browser.snapshot') {
      const result = await snapshotPage(page, asNonEmptyString(parameters.selector));
      if (result?.ok !== true) throw new HeadlessBrowserError(result?.error || 'Browser snapshot failed', 400);
      return {
        ...result,
        viewport: viewportSummary(activeViewport),
        ...(consoleProblems.length ? { consoleProblems: [...consoleProblems] } : {}),
      };
    }

    if (action === 'browser.capture') {
      const viewport = page.viewportSize?.() || viewportFor(activeViewport);
      const image = await page.screenshot({ type: 'png', fullPage: false });
      return {
        base64: Buffer.from(image).toString('base64'),
        mime: 'image/png',
        url: page.url(),
        title: await page.title(),
        viewport: viewportSummary(activeViewport),
        width: viewport.width,
        height: viewport.height,
      };
    }

    if (action === 'browser.click') {
      let locator;
      const selector = asNonEmptyString(parameters.selector);
      const text = asNonEmptyString(parameters.text);
      if (selector) {
        locator = page.locator(selector).first();
      } else if (text) {
        locator = page.locator('a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], summary, label').filter({ hasText: text }).first();
      } else {
        throw new HeadlessBrowserError('browser.click requires selector or text', 400);
      }
      await locator.waitFor({ state: 'visible' });
      const description = await locator.evaluate((element, maxLabelChars) => {
        const label = (
          element.getAttribute('aria-label')
          || element.innerText
          || element.textContent
          || element.getAttribute('value')
          || element.getAttribute('placeholder')
          || ''
        ).replace(/\s+/g, ' ').trim().slice(0, maxLabelChars);
        return {
          selector: element.id ? `#${CSS.escape(element.id)}` : element.tagName.toLowerCase(),
          label,
        };
      }, MAX_LABEL_CHARS);
      await locator.click();
      await waitAfterInteraction(page);
      return { ok: true, clicked: description.selector, label: description.label, url: page.url() };
    }

    if (action === 'browser.type') {
      const selector = asNonEmptyString(parameters.selector);
      if (!selector) throw new HeadlessBrowserError('selector is required', 400);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible' });
      await locator.fill(String(parameters.value ?? ''));
      if (parameters.submit === true) {
        await locator.press('Enter');
        await waitAfterInteraction(page);
      }
      return { ok: true, selector, url: page.url() };
    }

    if (action === 'browser.scroll') {
      const selector = asNonEmptyString(parameters.selector);
      if (selector) {
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: 'attached' });
        await locator.scrollIntoViewIfNeeded();
      } else {
        const direction = asNonEmptyString(parameters.direction);
        await page.evaluate((nextDirection) => {
          const pageHeight = Math.round(window.innerHeight * 0.85);
          const bottom = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          if (nextDirection === 'down') window.scrollTo({ top: window.scrollY + pageHeight, behavior: 'instant' });
          else if (nextDirection === 'up') window.scrollTo({ top: window.scrollY - pageHeight, behavior: 'instant' });
          else if (nextDirection === 'top') window.scrollTo({ top: 0, behavior: 'instant' });
          else if (nextDirection === 'bottom') window.scrollTo({ top: bottom, behavior: 'instant' });
        }, direction);
      }
      return page.evaluate(() => {
        const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const scrollY = Math.round(window.scrollY);
        return { ok: true, scrollY, maxScrollY: Math.round(maxScrollY), atTop: scrollY <= 1, atBottom: scrollY >= maxScrollY - 1 };
      });
    }

    if (action === 'browser.inspect') {
      const selector = asNonEmptyString(parameters.selector);
      if (!selector) throw new HeadlessBrowserError('selector is required', 400);
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'attached' });
      return locator.evaluate((target, input) => {
        const properties = [
          'color', 'background-color', 'background-image', 'opacity', 'font-family', 'font-size',
          'font-weight', 'line-height', 'letter-spacing', 'text-align', 'border-radius', 'border-width',
          'border-style', 'border-color', 'box-shadow', 'display', 'position', 'width', 'height',
          'padding', 'margin', 'gap', 'flex-direction', 'justify-content', 'align-items', 'z-index',
          'overflow', 'visibility',
        ];
        const computed = window.getComputedStyle(target);
        const styles = {};
        for (const property of properties) {
          const value = computed.getPropertyValue(property);
          if (value) styles[property] = value.trim();
        }
        const rect = target.getBoundingClientRect();
        return {
          ok: true,
          selector: input.selector,
          tag: target.tagName.toLowerCase(),
          label: (target.getAttribute('aria-label') || target.innerText || target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, input.maxLabelChars),
          bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
          inViewport: rect.bottom > 0 && rect.top < window.innerHeight,
          styles,
        };
      }, { selector, maxLabelChars: MAX_LABEL_CHARS });
    }

    throw new HeadlessBrowserError(`Unsupported browser action: ${action}`, 400);
  };

  const runAction = async (action, parameters, { timeoutMs, signal } = {}) => {
    if (signal?.aborted) throw new HeadlessBrowserError('Server browser action was cancelled', 499);
    const boundedTimeout = Math.min(Math.max(1_000, Number(timeoutMs) || DEFAULT_ACTION_TIMEOUT_MS), MAX_ACTION_TIMEOUT_MS);
    let rejectInterruption;
    const interruption = new Promise((_resolve, reject) => {
      rejectInterruption = reject;
    });
    const onAbort = () => {
      rejectInterruption(new HeadlessBrowserError('Server browser action was cancelled', 499));
      void closeBrowser();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimer(() => {
      rejectInterruption(new HeadlessBrowserError(
        `Server browser did not respond within ${Math.round(boundedTimeout / 1000)}s`,
        504,
      ));
      void closeBrowser();
    }, boundedTimeout);
    try {
      return await Promise.race([performAction(action, parameters), interruption]);
    } catch (error) {
      if (error instanceof HeadlessBrowserError) throw error;
      throw new HeadlessBrowserError(error instanceof Error ? error.message : String(error), 500);
    } finally {
      clearTimer(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };

  return {
    enabled: config.enabled,
    config: { ...config },
    request(action, parameters = {}, options = {}) {
      const queued = actionQueue.then(
        () => runAction(action, parameters, options),
        () => runAction(action, parameters, options),
      );
      actionQueue = queued.catch(() => undefined);
      return queued;
    },
    async stop() {
      await closeBrowser();
    },
  };
};
