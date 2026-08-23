import { parse as parseJsonc } from 'jsonc-parser';
import { pathToFileURL } from 'node:url';
import {
  OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS,
  OPENCHAMBER_AGENT_TOOL_ACTIONS,
  OPENCHAMBER_WEB_ACTION_DEFINITIONS,
  OPENCHAMBER_WEB_ACTIONS,
} from '../openchamber-control/actions.js';
import {
  WORKSPACE_ACTION_DEFINITIONS,
  WORKSPACE_ACTIONS,
} from '../workspace-tools/service.js';

const TOOL_SCHEMA_VERSION = 1;
// Everything either managed tool may ask for; the agent allowlist stays
// narrower than the full control surface.
const ACTIONS = new Set([...OPENCHAMBER_AGENT_TOOL_ACTIONS, ...OPENCHAMBER_WEB_ACTIONS, ...WORKSPACE_ACTIONS]);
const AGENT_TOOL_ACTION_TITLES = Object.fromEntries(
  [...OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS, ...OPENCHAMBER_WEB_ACTION_DEFINITIONS, ...WORKSPACE_ACTION_DEFINITIONS]
    .map(({ action, title }) => [action, title]),
);

/**
 * Each tool carries only the inputs its own actions take.
 *
 * A shared parameter object would leave a disabled capability's inputs visible
 * in the other tool's schema, which is both misleading and paid for in context
 * on every call.
 */
const WEB_PARAMETER_NAMES = ['url', 'selector', 'text', 'value', 'submit', 'direction', 'viewport', 'label'];
const WORKSPACE_PARAMETER_NAMES = [
  'content', 'kind', 'tags', 'query', 'id', 'inputPath', 'outputFormat',
  'outputDirectory', 'overwrite', 'previewFormat', 'text', 'voice',
  'outputName', 'limit',
];
const PANEL_PARAMETER_NAMES = [
  'projectId', 'directory', 'sessionId', 'panelMode', 'tabId', 'filePath',
  'line', 'column', 'diffScope', 'staged', 'readOnly', 'expanded',
];
const PANEL_ONLY_PARAMETER_NAMES = PANEL_PARAMETER_NAMES.filter(
  (name) => !['projectId', 'directory', 'sessionId'].includes(name),
);

const PANEL_ACTION_DEFINITIONS = OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS.filter(
  ({ action }) => action.startsWith('panel.'),
);
const PANEL_ACTIONS = PANEL_ACTION_DEFINITIONS.map(({ action }) => action);
const CONTROL_ACTION_DEFINITIONS = OPENCHAMBER_AGENT_TOOL_ACTION_DEFINITIONS.filter(
  ({ action }) => !action.startsWith('panel.'),
);
const CONTROL_ACTIONS = CONTROL_ACTION_DEFINITIONS.map(({ action }) => action);

const ALL_PARAMETER_PROPERTIES = {
  projectId: { type: 'string', description: 'Configured project ID; do not combine with directory' },
  directory: { type: 'string', description: 'Absolute checkout or session directory; defaults to the current session directory' },
  sessionId: { type: 'string' },
  messageId: { type: 'string', description: 'Optional fork boundary message ID' },
  taskId: { type: 'string' },
  title: { type: 'string' },
  prompt: { type: 'string' },
  model: { type: 'string', description: 'Model in provider/model format. When the user names no model: for session.create pick a suitable one from models.list favorites or recents (omit if there are none); for send and fork omit it — the session reuses its previous model' },
  agent: { type: 'string', description: 'OpenCode agent name; new sessions default to the build agent and existing sessions keep their previous one. Set only when the user explicitly requests a different agent' },
  variant: { type: 'string', description: 'Model variant; use only when the user explicitly requests it' },
  worktree: { type: 'string', description: 'New worktree name for session.create. Omit by default; use only when the user explicitly asks for an isolated worktree. Uncommitted changes do not carry over into a new worktree' },
  branch: { type: 'string', description: 'Branch name for the new worktree' },
  startRef: { type: 'string', description: 'Git ref used to create the new worktree' },
  setUpstream: { type: 'boolean', description: 'Make the new worktree branch track its upstream' },
  goal: { type: 'boolean', description: 'Run the dispatched prompt in Goal Mode; use only when the user explicitly requests it' },
  goalTokenBudget: { type: 'integer', minimum: 1000, maximum: 100_000_000, description: 'Goal token budget; requires goal' },
  wait: { type: 'boolean', description: 'Wait for current session activity to become idle. Omit by default; use only when the user asks or the next step requires the completed result' },
  timeout: { type: 'integer', minimum: 1, maximum: 86_400, description: 'Wait timeout in seconds (default 600); requires wait' },
  lastAssistant: { type: 'boolean', description: 'Return the last assistant text; create/send/fork require wait' },
  limit: { type: 'integer', minimum: 1, description: 'Maximum sessions or messages to return (default 10)' },
  all: { type: 'boolean', description: 'Include archived sessions or all messages, depending on the action' },
  last: { type: 'boolean', description: 'Return only the last matching session message' },
  withStatus: { type: 'boolean', description: 'Include authoritative status in session.list' },
  role: { type: 'string', enum: ['all', 'user', 'assistant'], description: 'Message role filter' },
  name: { type: 'string' },
  daily: { type: 'string', description: 'Daily run time in HH:mm format' },
  weekly: { type: 'string', description: 'Comma-separated weekdays; 0=Sunday and 6=Saturday' },
  once: { type: 'string', description: 'One-time run date in YYYY-MM-DD format' },
  time: { type: 'string', description: 'Weekly or one-time run time in HH:mm format' },
  cron: { type: 'string', description: 'Cron expression' },
  timezone: { type: 'string', description: 'IANA timezone' },
  disabled: { type: 'boolean', description: 'true disables and false enables; required for schedule.toggle' },
  panelMode: { type: 'string', enum: ['context', 'git', 'pr', 'changes', 'walkthrough', 'files', 'terminal', 'notes', 'plan', 'browser', 'chat'], description: 'Right-panel surface for panel.open' },
  tabId: { type: 'string', description: 'Exact right-panel tab ID returned by panel.list' },
  filePath: { type: 'string', description: 'File to show in Files or Changes' },
  line: { type: 'integer', minimum: 1, description: 'Files line number; requires filePath' },
  column: { type: 'integer', minimum: 1, description: 'Files column number; requires filePath' },
  diffScope: { type: 'string', enum: ['working', 'staged', 'turn'], description: 'Changes scope' },
  staged: { type: 'boolean', description: 'Show the staged version in Changes' },
  readOnly: { type: 'boolean', description: 'Open a split Chat tab read-only' },
  expanded: { type: 'boolean', description: 'Wide right panel when true, normal width when false' },
  url: { type: 'string', description: 'http(s) URL for browser.open' },
  selector: { type: 'string', description: 'CSS selector from a browser.snapshot result' },
  text: { type: 'string', description: 'Visible label to match when no selector is given' },
  value: { type: 'string', description: 'Text to type for browser.type' },
  submit: { type: 'boolean', description: 'Press Enter after typing' },
  direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Scroll direction for browser.scroll' },
  viewport: { type: 'string', enum: ['mobile', 'tablet', 'desktop', 'fill'], description: 'Page layout size; snapshots report which one is in effect' },
  label: { type: 'string', description: 'Short name for a browser.capture image, such as before-fix' },
  content: { type: 'string', description: 'User-approved fact for memory.add; never pass a secret' },
  kind: { type: 'string', description: 'Optional memory category; defaults to note' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Optional memory tags' },
  query: { type: 'string', description: 'Text to find in local memory' },
  id: { type: 'integer', minimum: 1, description: 'Memory id for memory.delete' },
  inputPath: { type: 'string', description: 'Document path, absolute or relative to the current session directory' },
  outputFormat: { type: 'string', enum: ['pdf', 'html', 'docx', 'xlsx', 'pptx'], description: 'Converted copy format; defaults to pdf' },
  outputDirectory: { type: 'string', description: 'Optional output directory, absolute or relative to the current session directory' },
  overwrite: { type: 'boolean', description: 'Replace an existing output only after the user approves' },
  previewFormat: { type: 'string', enum: ['pdf', 'html'], description: 'Preview format; defaults to pdf' },
  voice: { type: 'string', description: 'Installed Piper voice from voice.list' },
  outputName: { type: 'string', description: 'Optional safe filename for synthesized WAV audio' },
};

const pickParameters = (names) => Object.fromEntries(
  Object.entries(ALL_PARAMETER_PROPERTIES).filter(([name]) => names.includes(name)),
);

const CONTROL_PARAMETER_PROPERTIES = pickParameters(
  Object.keys(ALL_PARAMETER_PROPERTIES).filter((name) => (
    !WEB_PARAMETER_NAMES.includes(name)
    && !PANEL_ONLY_PARAMETER_NAMES.includes(name)
    && (!WORKSPACE_PARAMETER_NAMES.includes(name) || name === 'limit')
  )),
);
const PANEL_PARAMETER_PROPERTIES = pickParameters(PANEL_PARAMETER_NAMES);
const WEB_PARAMETER_PROPERTIES = pickParameters(WEB_PARAMETER_NAMES);
const WORKSPACE_PARAMETER_PROPERTIES = {
  ...pickParameters(WORKSPACE_PARAMETER_NAMES),
  text: { type: 'string', description: 'English or Persian text to synthesize; maximum 5000 characters' },
  limit: { type: 'integer', minimum: 1, description: 'Maximum memory or history records to return' },
};

const CONTROL_TOOL_DESCRIPTION = "Control OpenDeputy projects, sessions, and scheduled tasks on the user's behalf. Sessions and scheduled tasks you create are for the user to follow and interact with; never use this tool to delegate parts of your own current task. Use one action per call. Scope with projectId or directory; omit both to use the current session directory. Session dispatches return immediately by default and you receive no notification when a dispatched session finishes, so never promise to report back on it; the user follows it in OpenDeputy; a dispatched session needs no follow-up from you. If the user later asks how it went, use session.messages (add wait to block until it is idle, lastAssistant for just the final answer) — session.send always sends a NEW prompt and never just waits. Set wait only when the user asks or the next step requires the completed result. Session and worktree deletion are unavailable.";

const PANEL_TOOL_DESCRIPTION = "Default tool, in every language, for OpenDeputy's built-in right-panel surfaces: Context, Git, PR/Pull Request, Changes/Diff, Walkthrough, Files/Editor, Terminal, Project Notes, Plan, Browser, and Chat. Use panel.open to show or focus one; use panel.list first when exact tabs matter, then panel.activate or panel.closeTab with a returned tabId. Use panel.newBrowserTab, panel.close, or panel.setExpanded for those exact intents. These actions change only OpenDeputy app state and cannot close its window. Do the underlying work with native file/edit, shell/Git/GitHub, plan, or session tools, then show the matching internal surface. Never operate an OpenDeputy surface through desktop mouse or keyboard control.";

const WEB_TOOL_DESCRIPTION = "Default webpage tool for every unqualified request to open or use a browser, page, website, or URL, in any language. browser.open creates or reuses and focuses the Browser tab in OpenDeputy's right context panel. Use Open Browser Use only when the user explicitly requests an external browser or names Chrome, Firefox, Edge, Safari, Brave, Opera, Playwright, a browser profile or extension, or CDP. Use one action per call. Open a page, snapshot it to read its text and its interactive elements, then click, type or scroll using the selectors the snapshot returned; snapshots also report any errors the page logged. Pass a selector to browser.snapshot to read one part of a long page. browser.inspect returns computed styles when the question is how something renders. Set viewport to check a layout at mobile, tablet or desktop size. The page runs with the user's real logins, so treat what you see as their live session.";

const WORKSPACE_TOOL_DESCRIPTION = "Use OpenDeputy's local workspace capabilities. Memory stores only facts the user explicitly asks to remember; never store passwords, API keys, tokens, financial details, or other secrets, and ask before deleting non-test memory. Document conversion preserves the source and requires explicit approval before overwrite. Piper speech creates a local WAV file and does not play or upload it. ActivityWatch is optional: start it, read history, or stop it only when the user explicitly asks. Use workspace.status or voice.list to check optional local dependencies before relying on them.";

const IN_APP_ROUTING_GUIDANCE = "OpenDeputy routing is internal-first in every language. An unqualified request to open, show, use, inspect, edit, or work with Context, Git, PR/Pull Request, Changes/Diff, Walkthrough, Files/Editor, Terminal, Project Notes, Plan, Browser, Chat, or a right-panel tab means the matching built-in OpenDeputy surface. Use opendeputy_panel panel.open to show or focus it and panel.list before exact activate/close work. Do the actual work through the matching native data tool: file/edit tools for Files and Changes, shell and Git/GitHub tools for Terminal/Git/PR, plan/session tools for Plan/Chat/Context, and then show the result in the internal surface. Never click, type into, inspect, resize, or close OpenDeputy's own UI with desktop-control tools. If no built-in surface or direct tool supports the request, an appropriate external app remains available; a user can also explicitly name an external/system/desktop app. For an unqualified browser, tab, page, website, or URL use opendeputy_web for page content and opendeputy_panel for its tabs. Continue using the internal Browser after an internal failure and report it; external browser tools require an explicit external/system/desktop browser request or the name Chrome, Firefox, Edge, Safari, Brave, Opera, Open Browser Use, Playwright, a browser profile or extension, or CDP.";

const INTERNAL_BROWSER_MARKERS = [
  'in-app browser', 'internal browser', 'inside the app', 'right panel',
  'مرورگر داخل برنامه', 'مرورگر داخلی', 'پنل راست', 'پنل سمت راست',
  'المتصفح داخل التطبيق', 'المتصفح الداخلي', 'اللوحة اليمنى',
  'browser in der app', 'interner browser', 'rechtes panel',
  'アプリ内ブラウザ', '内部ブラウザ', '右パネル',
  '应用内浏览器', '内置浏览器', '内部浏览器', '右侧面板',
  '앱 내 브라우저', '내부 브라우저', '오른쪽 패널',
];
const EXTERNAL_BROWSER_MARKERS = [
  'chrome', 'firefox', 'microsoft edge', 'safari', 'brave', 'opera', 'open browser use', 'playwright', 'cdp',
  'external browser', 'system browser', 'desktop browser', 'real browser', 'computer browser',
  'browser profile', 'browser extension', 'existing user tab',
  'کروم', 'فایرفاکس', 'فایر فاکس', 'مایکروسافت اج', 'سافاری', 'مرورگر خارجی', 'مرورگر سیستم', 'مرورگر کامپیوتر', 'افزونه مرورگر', 'پروفایل مرورگر',
  'كروم', 'فايرفوكس', 'مايكروسوفت إيدج', 'سفاري', 'المتصفح الخارجي', 'متصفح النظام', 'متصفح الكمبيوتر', 'ملحق المتصفح', 'ملف تعريف المتصفح',
  'externer browser', 'systembrowser', 'desktop-browser', 'browserprofil', 'browser-erweiterung',
  'クローム', 'ファイアフォックス', 'マイクロソフトエッジ', 'サファリ', '外部ブラウザ', 'システムブラウザ', 'パソコンのブラウザ', 'ブラウザ拡張', 'ブラウザプロファイル',
  '谷歌浏览器', '火狐', '微软边缘', '苹果浏览器', '外部浏览器', '系统浏览器', '电脑浏览器', '浏览器扩展', '浏览器配置文件',
  '크롬', '파이어폭스', '마이크로소프트 엣지', '사파리', '외부 브라우저', '시스템 브라우저', '컴퓨터 브라우저', '브라우저 확장 프로그램', '브라우저 프로필',
  'внешний браузер', 'системный браузер', 'браузер компьютера', 'расширение браузера', 'профиль браузера',
];
const GENERIC_BROWSER_MARKERS = [
  'browser', 'tab', 'website', 'web page', 'url',
  'مرورگر', 'تب', 'وب‌سایت', 'وب سایت', 'صفحه وب',
  'متصفح', 'علامة تبويب', 'تبويب', 'موقع', 'صفحة ويب',
  'webseite',
  'ブラウザ', 'タブ', 'ウェブサイト', 'ウェブページ',
  '浏览器', '标签页', '网页', '网站',
  '브라우저', '탭', '웹사이트', '웹 페이지',
  'браузер', 'вкладк', 'веб-сайт', 'веб-страниц',
];
const EXTERNAL_BROWSER_TOOL_NAMESPACES = ['open_browser_use', 'playwright'];
const DESKTOP_TOOL_NAMESPACES = ['open_computer_use', 'computer_use', 'touchpoint'];
const BROWSER_APP_MARKERS = [
  'browser', 'chrome', 'firefox', 'edge', 'safari', 'brave', 'opera',
  'مرورگر', 'متصفح', 'ブラウザ', '浏览器', '브라우저', 'браузер',
];
const PANEL_SURFACE_PATTERNS = [
  '\\bcontext(?: panel| tab| view)?\\b', '\\bgit(?: panel| tab| view)?\\b', '\\bpull requests?\\b', '\\bpr(?: panel| tab| view)?\\b',
  '\\bchanges?(?: panel| tab| view)?\\b', '\\bdiffs?(?: panel| tab| view)?\\b', '\\bwalkthroughs?\\b',
  '\\bfiles?(?: panel| tab| view| editor)?\\b', '\\beditors?(?: panel| tab| view)?\\b', '\\bterminals?(?: panel| tab| view)?\\b',
  '\\bproject notes?\\b', '\\bnotes (?:panel|tab|view)\\b', '\\bplans? (?:panel|tab|view)\\b',
  '\\bbrowser(?: panel| tab| view)?\\b', '\\bchat (?:panel|tab|view)\\b', '\\bright (?:context )?panel\\b',
  'پنل راست', 'پنل سمت راست', 'کانتکست', 'گیت', 'پول ریکوئست', 'درخواست ادغام', 'تغییرات', 'تفاوت', 'مرور تغییرات', 'فایل', 'ویرایشگر', 'ترمینال', 'یادداشت پروژه', 'یادداشت‌ها', 'یادداشت ها', 'برنامه کار', 'مرورگر', 'چت',
  'اللوحة اليمنى', 'السياق', 'جيت', 'طلب السحب', 'التغييرات', 'الاختلافات', 'الملفات', 'المحرر', 'الطرفية', 'ملاحظات المشروع', 'الخطة', 'المتصفح', 'الدردشة',
  'rechtes panel', 'kontextansicht', 'git-ansicht', 'pull-request', 'änderungen', 'diff-ansicht', 'dateiansicht', 'terminalansicht', 'projektnotizen', 'planansicht', 'browseransicht', 'chatansicht',
  '右パネル', 'コンテキスト', 'gitパネル', 'プルリクエスト', '変更パネル', '差分', 'ウォークスルー', 'ファイルパネル', 'エディター', 'ターミナル', 'プロジェクトノート', 'プランパネル', 'ブラウザ', 'チャットパネル',
  '右侧面板', '上下文面板', 'git面板', '拉取请求', '更改面板', '差异', '演练', '文件面板', '编辑器', '终端', '项目笔记', '计划面板', '浏览器', '聊天面板',
];
const PANEL_INTENT_MARKERS = [
  'open', 'show', 'view', 'check', 'inspect', 'use', 'switch', 'focus', 'close', 'read', 'write', 'edit', 'add', 'remove', 'run', 'execute', 'work',
  'باز', 'نشان', 'ببین', 'بررسی', 'چک', 'استفاده', 'برو', 'بسته', 'بخوان', 'بنویس', 'ویرایش', 'اضافه', 'حذف', 'اجرا', 'کار',
  'öffne', 'anzeigen', 'prüfe', 'verwende', 'wechsel', 'schließe', 'lies', 'schreib', 'bearbeit',
  '開', '表示', '確認', '使って', '切り替', '閉じ', '読', '書', '編集', '実行',
  '打开', '显示', '查看', '检查', '使用', '切换', '关闭', '读取', '写入', '编辑', '运行',
  'افتح', 'اعرض', 'تحقق', 'استخدم', 'انتقل', 'أغلق', 'اقرأ', 'اكتب', 'حرر', 'شغل',
];
const STRONG_PANEL_MARKERS = [
  'right panel', 'context panel', 'project notes', 'pull request', 'pr panel', 'git panel', 'changes panel', 'diff panel',
  'walkthrough', 'files panel', 'file panel', 'editor panel', 'terminal panel', 'notes panel', 'plan panel', 'browser panel', 'chat panel',
  'پنل راست', 'پنل سمت راست', 'یادداشت پروژه', 'پول ریکوئست', 'درخواست ادغام', 'اللوحة اليمنى', 'ملاحظات المشروع',
  'rechtes panel', 'projektnotizen', '右パネル', 'プロジェクトノート', '右侧面板', '项目笔记',
];
const EXTERNAL_APP_MARKERS = [
  'external app', 'system app', 'desktop app', 'outside the app', 'outside opendeputy', 'separate app', 'standalone app',
  'windows terminal', 'powershell', 'command prompt', 'cmd.exe', 'file explorer', 'windows explorer',
  'visual studio code', 'vs code', 'vscode', 'notepad', 'github desktop', 'gitkraken', 'sourcetree', 'tortoisegit',
  'برنامه خارجی', 'برنامه سیستم', 'برنامه دسکتاپ', 'خارج از برنامه', 'بیرون برنامه', 'ترمینال ویندوز', 'پاورشل', 'فایل اکسپلورر',
  'تطبيق خارجي', 'تطبيق النظام', 'تطبيق سطح المكتب', 'خارج التطبيق', 'طرفية ويندوز', 'مستكشف الملفات',
  'externe app', 'system-app', 'desktop-app', 'außerhalb der app', 'windows-terminal', 'datei-explorer',
  '外部アプリ', 'システムアプリ', 'デスクトップアプリ', 'アプリの外', 'windowsターミナル', 'ファイルエクスプローラー',
  '外部应用', '系统应用', '桌面应用', '应用外部', 'windows终端', '文件资源管理器',
];

const asNonEmptyString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const createResult = ({ ok, action, data, error, exitCode }) => ({
  schemaVersion: TOOL_SCHEMA_VERSION,
  ok,
  action: action || 'unknown',
  ...(data !== undefined ? { data } : {}),
  ...(error ? { error } : {}),
  ...(Number.isInteger(exitCode) ? { exitCode } : {}),
});

const isLoopbackAddress = (value) => {
  const address = typeof value === 'string' ? value.toLowerCase() : '';
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
};

/**
 * One template, one entry per enabled capability.
 *
 * Both tools speak to the same callback with the same envelope; only the action
 * set, the inputs and the description differ. Generating them from one template
 * keeps the transport, metadata and failure handling identical, which is what
 * the caller depends on.
 */
const createToolEntry = ({ name, description, actions, definitions, parameters }) => String.raw`    ${name}: {
      description: ${JSON.stringify(description)},
      args: {
        action: { type: "string", enum: ${JSON.stringify(actions)}, oneOf: ${JSON.stringify(definitions.map((entry) => ({ const: entry.action, description: entry.description })))}, description: "OpenDeputy action to perform" },
        parameters: { type: "object", properties: ${JSON.stringify(parameters)}, additionalProperties: false, description: "Inputs for the action; use an empty object when none are needed" },
      },
      async execute(input, context) {
        // Models routinely put the inputs next to the action instead of inside
        // the parameters object, and dropping them there produced a
        // "url is required" error for a call that plainly carried a url. Both
        // shapes are accepted; an explicit parameters object wins on a conflict.
        const { action: requestedAction, parameters, ...flattened } = input ?? {}
        const args = { ...flattened, ...(parameters ?? {}), action: requestedAction }
        const actionTitles = ${JSON.stringify(AGENT_TOOL_ACTION_TITLES)}
        const title = Object.hasOwn(actionTitles, args.action) ? actionTitles[args.action] : args.action
        context.metadata({
          title,
          metadata: {
            ${name}: {
              schemaVersion: ${TOOL_SCHEMA_VERSION},
              action: args.action,
              description: title,
            },
          },
        })
        const endpoint = process.env.OPENCHAMBER_AGENT_TOOL_URL
        const token = process.env.OPENCHAMBER_AGENT_TOOL_TOKEN
        const failure = (payload) => ({
          title,
          output: JSON.stringify(payload),
          metadata: { opendeputy: { schemaVersion: ${TOOL_SCHEMA_VERSION}, action: args.action, description: title, ok: false } },
        })
        if (!endpoint || !token) {
          return failure({ schemaVersion: ${TOOL_SCHEMA_VERSION}, ok: false, action: args.action, error: { message: "OpenDeputy managed tool connection is unavailable" } })
        }

        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              authorization: "Bearer " + token,
              "content-type": "application/json",
            },
            body: JSON.stringify({ input: args, contextDirectory: context.directory }),
            signal: context.abort,
          })
          const output = await response.text()
          let result = null
          try { result = JSON.parse(output) } catch {}
          const valid = result?.schemaVersion === ${TOOL_SCHEMA_VERSION} && typeof result?.ok === "boolean" && typeof result?.action === "string"
          context.metadata({
            title,
            metadata: {
              ${name}: {
                schemaVersion: ${TOOL_SCHEMA_VERSION},
                action: args.action,
                description: title,
                ok: valid && result.ok === true,
              },
            },
          })
          if (valid) return { title, output, metadata: { opendeputy: { schemaVersion: ${TOOL_SCHEMA_VERSION}, action: args.action, description: title, ok: result.ok === true } } }
          return failure({ schemaVersion: ${TOOL_SCHEMA_VERSION}, ok: false, action: args.action, error: { message: "OpenDeputy returned an invalid response", kind: "runtime", status: response.status } })
        } catch (error) {
          if (context.abort.aborted) throw error
          return failure({ schemaVersion: ${TOOL_SCHEMA_VERSION}, ok: false, action: args.action, error: { message: error instanceof Error ? error.message : String(error), kind: "runtime" } })
        }
      },
    },
`;

const createPluginSource = ({ includeControl, includeWeb, includeWorkspace }) => {
  const entries = [];
  if (includeControl) {
    entries.push(createToolEntry({
      name: 'opendeputy',
      description: CONTROL_TOOL_DESCRIPTION,
      actions: CONTROL_ACTIONS,
      definitions: CONTROL_ACTION_DEFINITIONS,
      parameters: CONTROL_PARAMETER_PROPERTIES,
    }));
    entries.push(createToolEntry({
      name: 'opendeputy_panel',
      description: PANEL_TOOL_DESCRIPTION,
      actions: PANEL_ACTIONS,
      definitions: PANEL_ACTION_DEFINITIONS,
      parameters: PANEL_PARAMETER_PROPERTIES,
    }));
  }
  if (includeWeb) {
    entries.push(createToolEntry({
      name: 'opendeputy_web',
      description: WEB_TOOL_DESCRIPTION,
      actions: OPENCHAMBER_WEB_ACTIONS,
      definitions: OPENCHAMBER_WEB_ACTION_DEFINITIONS,
      parameters: WEB_PARAMETER_PROPERTIES,
    }));
  }
  if (includeWorkspace) {
    entries.push(createToolEntry({
      name: 'opendeputy_workspace',
      description: WORKSPACE_TOOL_DESCRIPTION,
      actions: WORKSPACE_ACTIONS,
      definitions: WORKSPACE_ACTION_DEFINITIONS,
      parameters: WORKSPACE_PARAMETER_PROPERTIES,
    }));
  }

  return `const IN_APP_ROUTING_GUIDANCE = ${JSON.stringify(IN_APP_ROUTING_GUIDANCE)}
const INTERNAL_BROWSER_MARKERS = ${JSON.stringify(INTERNAL_BROWSER_MARKERS)}
const EXTERNAL_BROWSER_MARKERS = ${JSON.stringify(EXTERNAL_BROWSER_MARKERS)}
const GENERIC_BROWSER_MARKERS = ${JSON.stringify(GENERIC_BROWSER_MARKERS)}
const EXTERNAL_BROWSER_TOOL_NAMESPACES = ${JSON.stringify(EXTERNAL_BROWSER_TOOL_NAMESPACES)}
const DESKTOP_TOOL_NAMESPACES = ${JSON.stringify(DESKTOP_TOOL_NAMESPACES)}
const BROWSER_APP_MARKERS = ${JSON.stringify(BROWSER_APP_MARKERS)}
const PANEL_SURFACE_PATTERNS = ${JSON.stringify(PANEL_SURFACE_PATTERNS)}
const PANEL_INTENT_MARKERS = ${JSON.stringify(PANEL_INTENT_MARKERS)}
const STRONG_PANEL_MARKERS = ${JSON.stringify(STRONG_PANEL_MARKERS)}
const EXTERNAL_APP_MARKERS = ${JSON.stringify(EXTERNAL_APP_MARKERS)}
const browserRouteBySession = new Map()

const normalizeText = (value) => typeof value === "string" ? value.toLocaleLowerCase() : ""
const containsAny = (text, markers) => markers.some((marker) => text.includes(marker))
const matchesAny = (text, patterns) => patterns.some((pattern) => new RegExp(pattern, "iu").test(text))
const isNamespacedTool = (tool, namespace) => tool.startsWith(namespace + "_") || tool.startsWith("mcp__" + namespace + "__")
const messageText = (output) => (output?.parts ?? [])
  .filter((part) => part?.type === "text" && typeof part.text === "string")
  .map((part) => part.text)
  .join("\\n")

const updateBrowserRoute = (sessionID, rawText) => {
  const text = normalizeText(rawText)
  const previous = browserRouteBySession.get(sessionID) ?? { route: "internal", browserTurn: false, surfaceTurn: false, externalAppTurn: false }
  const explicitlyInternal = containsAny(text, INTERNAL_BROWSER_MARKERS)
  const explicitlyExternal = !explicitlyInternal && containsAny(text, EXTERNAL_BROWSER_MARKERS)
  const browserTurn = explicitlyInternal || explicitlyExternal || containsAny(text, GENERIC_BROWSER_MARKERS) || /https?:\\/\\/|www\\./i.test(text)
  const surfaceMention = matchesAny(text, PANEL_SURFACE_PATTERNS)
  const surfaceTurn = containsAny(text, STRONG_PANEL_MARKERS) || (surfaceMention && containsAny(text, PANEL_INTENT_MARKERS))
  const externalAppTurn = explicitlyExternal || containsAny(text, EXTERNAL_APP_MARKERS)
  const route = explicitlyInternal ? "internal" : explicitlyExternal ? "external" : previous.route
  browserRouteBySession.set(sessionID, { route, browserTurn, surfaceTurn, externalAppTurn })
}

const browserRoutingError = () => new Error(
  "OpenDeputy browser routing blocked an external-browser fallback. This request defaults to the in-app Browser. "
  + "Use opendeputy_panel with panel.list for tabs or opendeputy_web with browser.* for the page. "
  + "External browser tools require the user to explicitly request an external/system/desktop browser or name Chrome, Firefox, Edge, Safari, Brave, Opera, Playwright, a browser profile or extension, or CDP."
)

const panelRoutingError = () => new Error(
  "OpenDeputy right-panel routing blocked desktop control of a built-in surface. "
  + "Use opendeputy_panel with panel.open or panel.list, do the underlying work with native file/edit, shell/Git/GitHub, plan, or session tools, and then show the matching surface. "
  + "Desktop control remains available when the user explicitly names an external/system/desktop app or requests something with no OpenDeputy surface or direct tool."
)

export const OpenDeputyPlugin = async () => ({
  tool: {
${entries.join('')}  },
  "chat.message": async (input, output) => {
    if (!input?.sessionID || (output?.message?.role && output.message.role !== "user")) return
    const text = messageText(output)
    if (text.trim()) updateBrowserRoute(input.sessionID, text)
  },
  event: async ({ event }) => {
    if (event?.type === "session.deleted") browserRouteBySession.delete(event.properties?.info?.id)
  },
  "experimental.chat.system.transform": async (_input, output) => {
    if (!Array.isArray(output?.system) || output.system.includes(IN_APP_ROUTING_GUIDANCE)) return
    output.system.push(IN_APP_ROUTING_GUIDANCE)
  },
  "tool.execute.before": async (input, output) => {
    if (!input?.sessionID || typeof input.tool !== "string") return
    const state = browserRouteBySession.get(input.sessionID) ?? { route: "internal", browserTurn: false, surfaceTurn: false, externalAppTurn: false }
    const externalBrowserTool = EXTERNAL_BROWSER_TOOL_NAMESPACES.some((namespace) => isNamespacedTool(input.tool, namespace))
    if (externalBrowserTool && state.route !== "external") throw browserRoutingError()

    const desktopTool = DESKTOP_TOOL_NAMESPACES.some((namespace) => isNamespacedTool(input.tool, namespace))
    const argsText = normalizeText(JSON.stringify(output?.args ?? {}))
    const targetsBrowser = containsAny(argsText, BROWSER_APP_MARKERS)
    if (desktopTool && state.route !== "external" && (state.browserTurn || targetsBrowser)) throw browserRoutingError()
    if (desktopTool && state.surfaceTurn && !state.externalAppTurn) throw panelRoutingError()
  },
})
export const OpenChamberPlugin = OpenDeputyPlugin
`;
};

const createManagedMcpDefaults = ({
  path,
  dataDir,
  env,
  computerUseBinary,
  touchpointPython,
  agentKitRoot,
  nodeBinary,
  openCodeBinary,
}) => {
  const defaults = {};
  if (asNonEmptyString(computerUseBinary)) {
    defaults.open_computer_use = {
      type: 'local',
      command: [computerUseBinary, 'mcp'],
      enabled: true,
      timeout: 30_000,
    };
  }
  if (!asNonEmptyString(agentKitRoot) || !asNonEmptyString(nodeBinary)) return defaults;

  const server = (...segments) => path.join(agentKitRoot, ...segments);
  const nodeEnvironment = {
    ELECTRON_RUN_AS_NODE: '1',
    OPENDEPUTY_AGENT_KIT_DATA_DIR: path.join(dataDir, 'agent-kit'),
    OPENDEPUTY_LEGACY_TOOLS_ROOT: asNonEmptyString(env.OPENDEPUTY_LEGACY_TOOLS_ROOT)
      || path.join(env.LOCALAPPDATA || dataDir, 'OpenChamberTools'),
    ...(asNonEmptyString(openCodeBinary) ? { OPENDEPUTY_OPENCODE_BINARY: openCodeBinary } : {}),
  };
  const nodeServer = (scriptPath, timeout, extra = {}) => ({
    type: 'local',
    command: [nodeBinary, scriptPath],
    enabled: true,
    timeout,
    environment: { ...nodeEnvironment, ...extra },
  });

  return {
    playwright: {
      type: 'local',
      command: [nodeBinary, server('node_modules', '@playwright', 'mcp', 'cli.js'), '--browser', 'chrome'],
      enabled: true,
      environment: nodeEnvironment,
    },
    ...defaults,
    open_browser_use: nodeServer(server('servers', 'open-browser-use.mjs'), 30_000),
    computer_use: nodeServer(
      server('node_modules', '@zavora-ai', 'computer-use-mcp', 'dist', 'server.js'),
      30_000,
      {
        COMPUTER_USE_AUDIT_LOG: 'true',
        COMPUTER_USE_FS_ROOTS: env.USERPROFILE || env.HOME || dataDir,
        COMPUTER_USE_LEGACY_FOCUS_TAG: 'true',
      },
    ),
    agent_overlay: nodeServer(server('servers', 'agent-overlay', 'server.mjs'), 30_000),
    ...(asNonEmptyString(touchpointPython) ? {
      touchpoint: {
        type: 'local',
        command: [touchpointPython, '-m', 'touchpoint.mcp.server'],
        enabled: true,
        timeout: 30_000,
        environment: {
          PYTHONNOUSERSITE: '1',
          PYTHONUTF8: '1',
          TOUCHPOINT_CDP_DISCOVER: 'true',
          TOUCHPOINT_FALLBACK_INPUT: 'false',
        },
      },
    } : {}),
    visual_grounding: nodeServer(server('servers', 'visual-grounding', 'server.mjs'), 240_000),
    workspace_tools: nodeServer(server('servers', 'workspace-tools', 'server.mjs'), 120_000),
  };
};

const MANAGED_PERMISSION_DEFAULTS = {
  'open_computer_use_*': 'ask',
  open_computer_use_list_apps: 'allow',
  open_computer_use_get_app_state: 'allow',
  'open_browser_use_*': 'ask',
  open_browser_use_ping: 'allow',
  open_browser_use_info: 'allow',
  open_browser_use_tabs: 'allow',
  open_browser_use_user_tabs: 'allow',
  open_browser_use_wait_load: 'allow',
  open_browser_use_page_info: 'allow',
  open_browser_use_finalize_tabs: 'allow',
  open_browser_use_turn_ended: 'allow',
  'computer_use_*': 'ask',
  computer_use_agent_pointer: 'deny',
  'agent_overlay_*': 'allow',
  'touchpoint_*': 'ask',
  touchpoint_apps: 'allow',
  touchpoint_diagnostics: 'allow',
  touchpoint_windows: 'allow',
  touchpoint_find: 'allow',
  touchpoint_get_element: 'allow',
  touchpoint_snapshot: 'allow',
  touchpoint_screenshot: 'allow',
  touchpoint_read_text: 'allow',
  touchpoint_wait_for: 'allow',
  touchpoint_wait_for_app: 'allow',
  touchpoint_wait_for_window: 'allow',
  'visual_grounding_*': 'ask',
  visual_grounding_status: 'allow',
  visual_grounding_detect_regions: 'allow',
  'workspace_tools_*': 'ask',
  workspace_tools_status: 'allow',
  workspace_tools_memory_search: 'allow',
  workspace_tools_memory_add: 'ask',
  workspace_tools_document_preview: 'allow',
  workspace_tools_document_convert: 'allow',
  workspace_tools_voice_list: 'allow',
  workspace_tools_voice_synthesize: 'allow',
  workspace_tools_history_status: 'allow',
};

const mergeManagedConfig = (rawConfig, pluginUrl, managedDefaults) => {
  const errors = [];
  const parsed = asNonEmptyString(rawConfig) ? parseJsonc(rawConfig, errors, { allowTrailingComma: true }) : {};
  if (errors.length > 0 || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OPENCODE_CONFIG_CONTENT must contain a valid JSON object before OpenDeputy can inject its managed tool');
  }
  if (parsed.plugin !== undefined && !Array.isArray(parsed.plugin)) {
    throw new Error('OPENCODE_CONFIG_CONTENT plugin must be an array before OpenDeputy can inject its managed tool');
  }
  const configured = Array.isArray(parsed.plugin) ? parsed.plugin : [];
  parsed.plugin = [
    ...configured.filter((value) => value !== pluginUrl && (!Array.isArray(value) || value[0] !== pluginUrl)),
    pluginUrl,
  ];
  const mcpDefaults = createManagedMcpDefaults(managedDefaults);
  if (Object.keys(mcpDefaults).length > 0) {
    if (parsed.mcp !== undefined && (!parsed.mcp || typeof parsed.mcp !== 'object' || Array.isArray(parsed.mcp))) {
      throw new Error('OPENCODE_CONFIG_CONTENT mcp must be an object before OpenDeputy can inject its bundled MCP defaults');
    }
    parsed.mcp = {
      ...mcpDefaults,
      ...(parsed.mcp || {}),
    };
    if (parsed.permission !== undefined && (!parsed.permission || typeof parsed.permission !== 'object' || Array.isArray(parsed.permission))) {
      throw new Error('OPENCODE_CONFIG_CONTENT permission must be an object before OpenDeputy can protect its bundled MCP defaults');
    }
    parsed.permission = {
      ...MANAGED_PERMISSION_DEFAULTS,
      ...(parsed.permission || {}),
    };
  }
  if (asNonEmptyString(managedDefaults.agentKitRoot)) {
    if (parsed.skills !== undefined && (!parsed.skills || typeof parsed.skills !== 'object' || Array.isArray(parsed.skills))) {
      throw new Error('OPENCODE_CONFIG_CONTENT skills must be an object before OpenDeputy can inject its bundled skills');
    }
    if (parsed.skills?.paths !== undefined && !Array.isArray(parsed.skills.paths)) {
      throw new Error('OPENCODE_CONFIG_CONTENT skills.paths must be an array before OpenDeputy can inject its bundled skills');
    }
    const bundledSkillPaths = [
      'computer-control',
      'desktop-workspace',
      'open-browser-use',
      'open-computer-use',
    ].map((name) => managedDefaults.path.join(managedDefaults.agentKitRoot, 'skills', name));
    parsed.skills = {
      ...(parsed.skills || {}),
      paths: [...new Set([...(parsed.skills?.paths || []), ...bundledSkillPaths])],
    };
  }
  return JSON.stringify(parsed);
};

export const createAgentToolRuntime = (dependencies) => {
  const {
    crypto,
    fsPromises,
    path,
    dataDir,
    getActivePort,
    executeAction,
    env = process.env,
  } = dependencies;
  const pluginDirectory = path.join(dataDir, 'agent-tool');
  const pluginPath = path.join(pluginDirectory, 'opendeputy-plugin.js');
  let activeToken = null;

  const prepareManagedOpenCodeEnv = async ({ includeControl = true, includeWeb = true, includeWorkspace = true } = {}) => {
    const port = getActivePort();
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('OpenDeputy listener port is unavailable for managed tool injection');
    }
    if (!includeControl && !includeWeb && !includeWorkspace) {
      throw new Error('At least one OpenDeputy managed tool must be enabled to inject the plugin');
    }
    await fsPromises.mkdir(pluginDirectory, { recursive: true });
    await fsPromises.writeFile(pluginPath, createPluginSource({ includeControl, includeWeb, includeWorkspace }), { mode: 0o600 });
    activeToken = crypto.randomBytes(32).toString('base64url');
    const pluginUrl = pathToFileURL(pluginPath).href;
    return {
      OPENCODE_CONFIG_CONTENT: mergeManagedConfig(env.OPENCODE_CONFIG_CONTENT, pluginUrl, {
        path,
        dataDir,
        env,
        computerUseBinary: env.OPENDEPUTY_COMPUTER_USE_BINARY,
        touchpointPython: env.OPENDEPUTY_TOUCHPOINT_PYTHON,
        agentKitRoot: env.OPENDEPUTY_AGENT_KIT_ROOT,
        nodeBinary: env.OPENDEPUTY_NODE_BINARY,
        openCodeBinary: env.OPENDEPUTY_OPENCODE_BINARY,
      }),
      OPENCHAMBER_AGENT_TOOL_URL: `http://127.0.0.1:${port}/api/openchamber/agent-tool`,
      OPENCHAMBER_AGENT_TOOL_TOKEN: activeToken,
    };
  };

  const authorize = (req) => {
    if (!activeToken || !isLoopbackAddress(req.socket?.remoteAddress)) return false;
    const header = asNonEmptyString(req.headers?.authorization);
    if (!header?.startsWith('Bearer ')) return false;
    const provided = Buffer.from(header.slice(7));
    const expected = Buffer.from(activeToken);
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  };

  const execute = async (payload = {}, options = {}) => {
    const action = asNonEmptyString(payload.input?.action);
    if (!action || !ACTIONS.has(action)) {
      return createResult({ ok: false, action, error: { message: `Unsupported OpenDeputy action: ${action || 'missing'}`, kind: 'usage' } });
    }
    if (typeof executeAction !== 'function') {
      return createResult({ ok: false, action, error: { message: 'OpenDeputy control service is unavailable', kind: 'runtime' } });
    }
    try {
      const data = await executeAction(action, payload.input, payload.contextDirectory, options);
      return createResult({ ok: true, action, data });
    } catch (error) {
      return createResult({
        ok: false,
        action,
        ...(error?.partial === true ? { data: {
          partial: true,
          partialAction: error.partialAction,
          sessionId: error.sessionId,
          directory: error.directory,
        } } : {}),
        error: {
          message: error instanceof Error ? error.message : String(error),
          kind: Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 499 ? 'usage' : 'runtime',
        },
      });
    }
  };

  const registerRoutes = (app, express) => {
    app.post('/api/openchamber/agent-tool', express.json({ limit: '1mb' }), async (req, res) => {
      if (!authorize(req)) return res.status(401).json({ error: 'Unauthorized' });
      const controller = new AbortController();
      const abortOnDisconnect = () => {
        if (!res.writableEnded) controller.abort();
      };
      req.once('aborted', abortOnDisconnect);
      res.once('close', abortOnDisconnect);
      try {
        return res.json(await execute(req.body, { signal: controller.signal }));
      } catch (error) {
        return res.json(createResult({
          ok: false,
          action: req.body?.input?.action,
          error: { message: error instanceof Error ? error.message : String(error), kind: 'runtime' },
        }));
      } finally {
        req.off('aborted', abortOnDisconnect);
        res.off('close', abortOnDisconnect);
      }
    });
  };

  return {
    prepareManagedOpenCodeEnv,
    registerRoutes,
    execute,
  };
};
