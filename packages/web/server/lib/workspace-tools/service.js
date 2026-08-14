import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const WORKSPACE_ACTION_DEFINITIONS = [
  { action: 'workspace.status', title: 'Check workspace tools', description: 'Report availability of local memory, document conversion, offline speech, and optional activity history' },
  { action: 'memory.add', title: 'Remember an approved fact', description: 'Save a durable fact only when the user explicitly asks to remember it; never save secrets' },
  { action: 'memory.search', title: 'Search local memory', description: 'Search user-approved facts stored locally on this computer' },
  { action: 'memory.delete', title: 'Delete a memory', description: 'Delete one memory by id only after user approval' },
  { action: 'document.convert', title: 'Convert a document', description: 'Create a converted copy of a document without changing the source; inputPath is required' },
  { action: 'document.preview', title: 'Preview a document', description: 'Create a PDF or HTML preview copy without changing the source; inputPath is required' },
  { action: 'voice.list', title: 'List offline voices', description: 'List locally installed Piper voices' },
  { action: 'voice.synthesize', title: 'Create spoken audio', description: 'Create a local WAV file from text with an installed Piper voice; text and voice are required' },
  { action: 'history.status', title: 'Check activity history', description: 'Check whether optional local ActivityWatch history is installed and running' },
  { action: 'history.start', title: 'Start activity history', description: 'Start optional local ActivityWatch only after the user explicitly asks' },
  { action: 'history.recent', title: 'Read recent activity history', description: 'Read recent local ActivityWatch window events only when the user asks to use their history' },
  { action: 'history.stop', title: 'Stop activity history', description: 'Stop local ActivityWatch after user approval; existing history is not deleted' },
];

export const WORKSPACE_ACTIONS = WORKSPACE_ACTION_DEFINITIONS.map(({ action }) => action);

export class WorkspaceToolError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'WorkspaceToolError';
    this.statusCode = statusCode;
  }
}

const asString = (value) => typeof value === 'string' ? value.trim() : '';

const asInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
};

const safeFilename = (value) => String(value || '')
  .replace(/[^\p{L}\p{N}._-]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'output';

const firstExisting = (fsModule, candidates) => candidates.find((candidate) => candidate && fsModule.existsSync(candidate)) || null;

const resolveInputPath = (pathModule, value, contextDirectory) => {
  const requested = asString(value);
  if (!requested) throw new WorkspaceToolError('inputPath is required');
  return pathModule.resolve(contextDirectory || process.cwd(), requested);
};

const normalizeTags = (value) => Array.isArray(value)
  ? value.map(asString).filter(Boolean).slice(0, 20)
  : [];

export const createWorkspaceToolsService = (dependencies = {}) => {
  const fsModule = dependencies.fs || fs;
  const osModule = dependencies.os || os;
  const pathModule = dependencies.path || path;
  const spawnProcess = dependencies.spawn || spawn;
  const spawnProcessSync = dependencies.spawnSync || spawnSync;
  const Database = dependencies.DatabaseSync || DatabaseSync;
  const fetchImpl = dependencies.fetch || globalThis.fetch;
  const env = dependencies.env || process.env;
  const dataRoot = pathModule.join(dependencies.dataDir || pathModule.join(osModule.homedir(), '.open-deputy'), 'workspace-tools');
  const memoryDir = pathModule.join(dataRoot, 'memory');
  const previewDir = pathModule.join(dataRoot, 'previews');
  const speechDir = pathModule.join(dataRoot, 'speech');
  const bundledVoicesDir = pathModule.join(dataRoot, 'voices');
  for (const directory of [memoryDir, previewDir, speechDir, bundledVoicesDir]) {
    fsModule.mkdirSync(directory, { recursive: true });
  }

  const localAppData = env.LOCALAPPDATA || pathModule.join(osModule.homedir(), 'AppData', 'Local');
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const legacyToolsRoot = pathModule.join(localAppData, 'OpenChamberTools');
  const voiceDirectories = [
    asString(env.OPENDEPUTY_PIPER_VOICES_DIR),
    asString(env.OPENCHAMBER_PIPER_VOICES_DIR),
    bundledVoicesDir,
    pathModule.join(legacyToolsRoot, 'workspace-tools', 'voices'),
  ].filter(Boolean);
  const libreOfficeCandidates = [
    asString(env.OPENDEPUTY_LIBREOFFICE_BINARY),
    asString(env.OPENCHAMBER_LIBREOFFICE_BINARY),
    pathModule.join(dataRoot, 'libreoffice', 'program', 'soffice.com'),
    pathModule.join(legacyToolsRoot, 'libreoffice', 'program', 'soffice.com'),
    pathModule.join(programFiles, 'LibreOffice', 'program', 'soffice.com'),
    pathModule.join(programFiles, 'LibreOffice', 'program', 'soffice.exe'),
    pathModule.join(programFilesX86, 'LibreOffice', 'program', 'soffice.com'),
    'libreoffice',
  ].filter(Boolean);
  const piperCandidates = [
    asString(env.OPENDEPUTY_PIPER_BINARY),
    asString(env.OPENCHAMBER_PIPER_BINARY),
    pathModule.join(dataRoot, '.venv', 'Scripts', 'piper.exe'),
    pathModule.join(legacyToolsRoot, 'workspace-tools', '.venv', 'Scripts', 'piper.exe'),
    'piper',
  ].filter(Boolean);
  const activityWatchCandidates = [
    asString(env.OPENDEPUTY_ACTIVITYWATCH_BINARY),
    asString(env.OPENCHAMBER_ACTIVITYWATCH_BINARY),
    pathModule.join(dataRoot, 'activitywatch', 'aw-qt.exe'),
    pathModule.join(legacyToolsRoot, 'activitywatch', 'aw-qt.exe'),
    pathModule.join(localAppData, 'Programs', 'ActivityWatch', 'aw-qt.exe'),
    pathModule.join(localAppData, 'activitywatch', 'aw-qt.exe'),
    pathModule.join(programFiles, 'ActivityWatch', 'aw-qt.exe'),
  ].filter(Boolean);

  let database = null;
  const getDatabase = () => {
    if (database) return database;
    database = new Database(pathModule.join(memoryDir, 'memory.sqlite'));
    database.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL DEFAULT 'note',
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memories_updated_at ON memories(updated_at DESC);
    `);
    return database;
  };

  const locateVoice = (voice) => {
    const requested = asString(voice);
    if (!requested) throw new WorkspaceToolError('voice is required');
    for (const directory of voiceDirectories) {
      if (!fsModule.existsSync(directory)) continue;
      const match = fsModule.readdirSync(directory).find((name) => name.endsWith('.onnx') && name.startsWith(requested));
      if (match) return pathModule.join(directory, match);
    }
    return null;
  };

  const listVoices = () => {
    const names = new Set();
    for (const directory of voiceDirectories) {
      if (!fsModule.existsSync(directory)) continue;
      for (const name of fsModule.readdirSync(directory)) {
        if (name.endsWith('.onnx')) names.add(name.slice(0, -5));
      }
    }
    return [...names].sort();
  };

  const convertDocument = (parameters, contextDirectory, preview = false) => {
    const office = firstExisting(fsModule, libreOfficeCandidates);
    if (!office) throw new WorkspaceToolError('LibreOffice is not installed or could not be found', 503);
    const input = resolveInputPath(pathModule, parameters.inputPath, contextDirectory);
    if (!fsModule.existsSync(input)) throw new WorkspaceToolError(`Input file does not exist: ${input}`, 404);
    const allowed = preview ? ['pdf', 'html'] : ['pdf', 'html', 'docx', 'xlsx', 'pptx'];
    const requestedFormat = asString(preview ? parameters.previewFormat : parameters.outputFormat).toLowerCase() || 'pdf';
    if (!allowed.includes(requestedFormat)) throw new WorkspaceToolError(`Unsupported output format: ${requestedFormat}`);
    const outputDirectory = preview
      ? previewDir
      : pathModule.resolve(contextDirectory || process.cwd(), asString(parameters.outputDirectory) || previewDir);
    fsModule.mkdirSync(outputDirectory, { recursive: true });
    const output = pathModule.join(outputDirectory, `${pathModule.basename(input, pathModule.extname(input))}.${requestedFormat}`);
    if (fsModule.existsSync(output) && parameters.overwrite !== true) {
      throw new WorkspaceToolError(`Output already exists: ${output}. Ask the user before retrying with overwrite=true`, 409);
    }
    const profileDir = pathModule.join(dataRoot, 'libreoffice-profile');
    fsModule.mkdirSync(profileDir, { recursive: true });
    const filter = {
      docx: 'docx:Office Open XML Text',
      xlsx: 'xlsx:Calc MS Excel 2007 XML',
      pptx: 'pptx:Impress MS PowerPoint 2007 XML',
    }[requestedFormat] || requestedFormat;
    const result = spawnProcessSync(office, [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      '--headless', '--nologo', '--nodefault', '--nolockcheck', '--nofirststartwizard',
      '--convert-to', filter, '--outdir', outputDirectory, input,
    ], { encoding: 'utf8', windowsHide: true, timeout: 120_000 });
    if (result.error) throw new WorkspaceToolError(result.error.message, 500);
    if (result.status !== 0) throw new WorkspaceToolError(`LibreOffice conversion failed (${result.status}): ${result.stderr || result.stdout}`, 500);
    if (!fsModule.existsSync(output)) throw new WorkspaceToolError(`LibreOffice did not create the expected output: ${output}`, 500);
    return { input, output, format: requestedFormat, sourcePreserved: true };
  };

  const activityWatchRequest = async (pathname) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetchImpl(`http://127.0.0.1:5600${pathname}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`ActivityWatch returned HTTP ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const execute = async (action, parameters = {}, contextDirectory) => {
    if (!WORKSPACE_ACTIONS.includes(action)) throw new WorkspaceToolError(`Unsupported workspace action: ${action}`);
    if (action === 'workspace.status') {
      let historyRunning = false;
      try { await activityWatchRequest('/api/0/info'); historyRunning = true; } catch {}
      return {
        memoryDatabase: pathModule.join(memoryDir, 'memory.sqlite'),
        libreOffice: firstExisting(fsModule, libreOfficeCandidates),
        piper: firstExisting(fsModule, piperCandidates),
        voices: listVoices(),
        activityWatch: firstExisting(fsModule, activityWatchCandidates),
        historyRunning,
        historyOptional: true,
      };
    }
    if (action === 'memory.add') {
      const content = asString(parameters.content);
      if (!content) throw new WorkspaceToolError('content is required');
      if (content.length > 10_000) throw new WorkspaceToolError('content must be at most 10000 characters');
      const kind = asString(parameters.kind) || 'note';
      const tags = normalizeTags(parameters.tags);
      const now = new Date().toISOString();
      const result = getDatabase().prepare('INSERT INTO memories (kind, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(kind.slice(0, 40), content, tags.join(','), now, now);
      return { saved: true, id: Number(result.lastInsertRowid), kind: kind.slice(0, 40), tags, createdAt: now };
    }
    if (action === 'memory.search') {
      const query = asString(parameters.query).slice(0, 500);
      const limit = asInteger(parameters.limit, 20, 1, 100);
      const pattern = `%${query}%`;
      const rows = getDatabase().prepare(`SELECT id, kind, content, tags, created_at, updated_at FROM memories
        WHERE ? = '' OR content LIKE ? OR tags LIKE ? OR kind LIKE ? ORDER BY updated_at DESC LIMIT ?`)
        .all(query, pattern, pattern, pattern, limit);
      return { query, count: rows.length, memories: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        content: row.content,
        tags: row.tags ? row.tags.split(',') : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })) };
    }
    if (action === 'memory.delete') {
      const id = Number(parameters.id);
      if (!Number.isInteger(id) || id <= 0) throw new WorkspaceToolError('A positive memory id is required');
      const result = getDatabase().prepare('DELETE FROM memories WHERE id = ?').run(id);
      return { deleted: result.changes > 0, id };
    }
    if (action === 'document.convert') return convertDocument(parameters, contextDirectory, false);
    if (action === 'document.preview') return convertDocument(parameters, contextDirectory, true);
    if (action === 'voice.list') return { piper: firstExisting(fsModule, piperCandidates), voices: listVoices() };
    if (action === 'voice.synthesize') {
      const piper = firstExisting(fsModule, piperCandidates);
      if (!piper) throw new WorkspaceToolError('Piper is not installed', 503);
      const text = asString(parameters.text);
      if (!text) throw new WorkspaceToolError('text is required');
      if (text.length > 5_000) throw new WorkspaceToolError('text must be at most 5000 characters');
      const model = locateVoice(parameters.voice);
      if (!model) throw new WorkspaceToolError(`Voice is not installed: ${asString(parameters.voice)}`, 404);
      const output = pathModule.join(speechDir, `${safeFilename(parameters.outputName || `${pathModule.basename(model, '.onnx')}-${Date.now()}`)}.wav`);
      const result = spawnProcessSync(piper, ['--model', model, '--output_file', output], {
        input: `${text}\n`, encoding: 'utf8', windowsHide: true, timeout: 120_000,
        env: { ...env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      });
      if (result.error) throw new WorkspaceToolError(result.error.message, 500);
      if (result.status !== 0 || !fsModule.existsSync(output)) throw new WorkspaceToolError(`Piper synthesis failed (${result.status}): ${result.stderr || result.stdout}`, 500);
      return { created: true, voice: asString(parameters.voice), output };
    }
    if (action === 'history.status') {
      let info = null;
      try { info = await activityWatchRequest('/api/0/info'); } catch {}
      return { installed: firstExisting(fsModule, activityWatchCandidates), running: Boolean(info), info };
    }
    if (action === 'history.start') {
      const executable = firstExisting(fsModule, activityWatchCandidates);
      if (!executable) throw new WorkspaceToolError('ActivityWatch is not installed', 503);
      const child = spawnProcess(executable, [], { detached: true, windowsHide: true, stdio: 'ignore' });
      child.unref();
      return { started: true, localUrl: 'http://127.0.0.1:5600' };
    }
    if (action === 'history.recent') {
      const limit = asInteger(parameters.limit, 50, 1, 500);
      const buckets = await activityWatchRequest('/api/0/buckets');
      const bucket = Object.keys(buckets).find((id) => id.startsWith('aw-watcher-window_')) || null;
      if (!bucket) return { bucket: null, events: [] };
      const events = await activityWatchRequest(`/api/0/buckets/${encodeURIComponent(bucket)}/events?limit=${limit}`);
      return { bucket, events };
    }
    if (action === 'history.stop') {
      if (process.platform !== 'win32') throw new WorkspaceToolError('Stopping ActivityWatch is currently supported on Windows only', 501);
      const stopped = [];
      for (const image of ['aw-qt.exe', 'aw-server.exe', 'aw-watcher-window.exe', 'aw-watcher-afk.exe']) {
        const result = spawnProcessSync('taskkill.exe', ['/IM', image, '/T', '/F'], { encoding: 'utf8', windowsHide: true });
        if (result.status === 0) stopped.push(image);
      }
      return { stopped, historyDeleted: false };
    }
    throw new WorkspaceToolError(`Unsupported workspace action: ${action}`);
  };

  const close = () => {
    database?.close();
    database = null;
  };

  return { execute, close, dataRoot };
};
