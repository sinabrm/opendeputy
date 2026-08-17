import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const root = dirname(fileURLToPath(import.meta.url));
const stateRoot = resolve(process.env.OPENDEPUTY_AGENT_KIT_DATA_DIR || root, "workspace-tools");
const legacyToolsRoot = resolve(
  process.env.OPENDEPUTY_LEGACY_TOOLS_ROOT
    || join(process.env.LOCALAPPDATA ?? "", "OpenChamberTools"),
);
const dataDir = join(stateRoot, "data");
const previewDir = join(stateRoot, "previews");
const speechDir = join(stateRoot, "speech");
const voicesDir = process.env.OPENDEPUTY_PIPER_VOICES_DIR
  || process.env.OPENCHAMBER_PIPER_VOICES_DIR
  || join(stateRoot, "voices");
for (const directory of [dataDir, previewDir, speechDir, voicesDir]) mkdirSync(directory, { recursive: true });

const db = new DatabaseSync(join(dataDir, "memory.sqlite"));
db.exec(`
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

const libreOfficeCandidates = [
  process.env.OPENDEPUTY_LIBREOFFICE_BINARY,
  process.env.OPENCHAMBER_LIBREOFFICE_BINARY,
  join(legacyToolsRoot, "libreoffice", "program", "soffice.com"),
  "C:\\Program Files\\LibreOffice\\program\\soffice.com",
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
];
const activityWatchCandidates = [
  process.env.OPENDEPUTY_ACTIVITYWATCH_BINARY,
  process.env.OPENCHAMBER_ACTIVITYWATCH_BINARY,
  join(legacyToolsRoot, "activitywatch", "aw-qt.exe"),
  join(process.env.LOCALAPPDATA ?? "", "Programs", "ActivityWatch", "aw-qt.exe"),
  join(process.env.LOCALAPPDATA ?? "", "activitywatch", "aw-qt.exe"),
  "C:\\Program Files\\ActivityWatch\\aw-qt.exe",
];
const piperCandidates = [
  process.env.OPENDEPUTY_PIPER_BINARY,
  process.env.OPENCHAMBER_PIPER_BINARY,
  join(legacyToolsRoot, "workspace-tools", ".venv", "Scripts", "piper.exe"),
  join(legacyToolsRoot, "workspace-tools", ".venv", "Scripts", "piper-tts.exe"),
];

function firstExisting(paths) {
  return paths.find((candidate) => candidate && existsSync(candidate));
}

function toolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function safeFilename(value) {
  return value.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "output";
}

function isoNow() {
  return new Date().toISOString();
}

function locateVoice(voice) {
  const matches = existsSync(voicesDir)
    ? readdirSync(voicesDir).filter((name) => name.endsWith(".onnx") && name.startsWith(voice))
    : [];
  return matches.length ? join(voicesDir, matches[0]) : undefined;
}

function convertDocument(inputPath, format, requestedOutputDir, overwrite = false) {
  const office = firstExisting(libreOfficeCandidates);
  if (!office) throw new Error("LibreOffice is not installed or soffice could not be found.");
  const input = resolve(inputPath);
  if (!existsSync(input)) throw new Error(`Input file does not exist: ${input}`);
  const outputDirectory = resolve(requestedOutputDir || previewDir);
  mkdirSync(outputDirectory, { recursive: true });
  const expected = join(outputDirectory, `${basename(input, extname(input))}.${format}`);
  if (existsSync(expected) && !overwrite) {
    throw new Error(`Output already exists: ${expected}. Ask the user before retrying with overwrite=true.`);
  }
  const profilePath = join(dataDir, "libreoffice-profile").replace(/\\/g, "/");
  const filter = {
    docx: "docx:Office Open XML Text",
    xlsx: "xlsx:Calc MS Excel 2007 XML",
    pptx: "pptx:Impress MS PowerPoint 2007 XML",
  }[format] ?? format;
  const result = spawnSync(office, [
    `-env:UserInstallation=file:///${profilePath}`,
    "--headless",
    "--nologo",
    "--nodefault",
    "--nolockcheck",
    "--nofirststartwizard",
    "--convert-to",
    filter,
    "--outdir",
    outputDirectory,
    input,
  ], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`LibreOffice conversion failed (${result.status}): ${result.stderr || result.stdout}`);
  if (!existsSync(expected)) throw new Error(`LibreOffice did not create the expected output: ${expected}. Output: ${result.stdout || result.stderr}`);
  return { input, output: expected, format, message: (result.stdout || result.stderr || "").trim() };
}

async function activityWatchRequest(pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`http://127.0.0.1:5600${pathname}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`ActivityWatch returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function startServer() {
  const server = new McpServer({ name: "opendeputy-workspace-tools", version: "1.0.0" });

  server.tool(
    "status",
    "Check installation and availability of memory, LibreOffice document conversion, Piper voice, and optional ActivityWatch history.",
    {},
    async () => {
      let historyOnline = false;
      try { await activityWatchRequest("/api/0/info"); historyOnline = true; } catch {}
      return toolResult({
        memory_database: join(dataDir, "memory.sqlite"),
        libreoffice: firstExisting(libreOfficeCandidates) ?? null,
        piper: firstExisting(piperCandidates) ?? null,
        voices: existsSync(voicesDir) ? readdirSync(voicesDir).filter((name) => name.endsWith(".onnx")) : [],
        activitywatch_installed: firstExisting(activityWatchCandidates) ?? null,
        activitywatch_running: historyOnline,
        history_is_optional: true,
      });
    },
  );

  server.tool(
    "memory_add",
    "Save a user-approved durable fact or note in the local SQLite memory. Never store passwords, API keys, or secrets.",
    {
      content: z.string().min(1).max(10000),
      kind: z.string().min(1).max(40).default("note"),
      tags: z.array(z.string().min(1).max(50)).max(20).optional(),
    },
    async ({ content, kind, tags }) => {
      const now = isoNow();
      const result = db.prepare("INSERT INTO memories (kind, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(kind, content, (tags ?? []).join(","), now, now);
      return toolResult({ saved: true, id: Number(result.lastInsertRowid), kind, tags: tags ?? [], created_at: now });
    },
  );

  server.tool(
    "memory_search",
    "Search the local SQLite memory for user-approved facts and notes.",
    {
      query: z.string().max(500).default(""),
      limit: z.number().int().min(1).max(100).default(20),
    },
    async ({ query, limit }) => {
      const pattern = `%${query}%`;
      const rows = db.prepare(`SELECT id, kind, content, tags, created_at, updated_at FROM memories
        WHERE ? = '' OR content LIKE ? OR tags LIKE ? OR kind LIKE ? ORDER BY updated_at DESC LIMIT ?`)
        .all(query, pattern, pattern, pattern, limit);
      return toolResult({ query, count: rows.length, memories: rows.map((row) => ({ ...row, tags: row.tags ? row.tags.split(",") : [] })) });
    },
  );

  server.tool(
    "memory_delete",
    "Delete one local memory by numeric ID. Ask the user before deleting non-test data.",
    { id: z.number().int().positive() },
    async ({ id }) => {
      const result = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
      return toolResult({ deleted: result.changes > 0, id });
    },
  );

  server.tool(
    "document_convert",
    "Convert an Office/document file with LibreOffice without modifying the source. Supports pdf, html, docx, xlsx, and pptx output.",
    {
      input_path: z.string().min(1),
      output_format: z.enum(["pdf", "html", "docx", "xlsx", "pptx"]).default("pdf"),
      output_dir: z.string().min(1).optional(),
      overwrite: z.boolean().default(false),
    },
    async ({ input_path, output_format, output_dir, overwrite }) => toolResult(convertDocument(input_path, output_format, output_dir, overwrite)),
  );

  server.tool(
    "document_preview",
    "Create a PDF or HTML preview copy of a document with LibreOffice. The original file is never changed.",
    {
      input_path: z.string().min(1),
      preview_format: z.enum(["pdf", "html"]).default("pdf"),
      overwrite: z.boolean().default(false),
    },
    async ({ input_path, preview_format, overwrite }) => toolResult(convertDocument(input_path, preview_format, previewDir, overwrite)),
  );

  server.tool(
    "voice_list",
    "List installed Piper voices for offline English and Persian text-to-speech.",
    {},
    async () => toolResult({
      piper: firstExisting(piperCandidates) ?? null,
      voices: existsSync(voicesDir) ? readdirSync(voicesDir).filter((name) => name.endsWith(".onnx")).map((name) => name.slice(0, -5)) : [],
    }),
  );

  server.tool(
    "voice_synthesize",
    "Create a local WAV file from English or Persian text using an installed offline Piper voice. This does not play audio automatically.",
    {
      text: z.string().min(1).max(5000),
      voice: z.string().min(1).max(100),
      output_name: z.string().min(1).max(100).optional(),
    },
    async ({ text, voice, output_name }) => {
      const piper = firstExisting(piperCandidates);
      if (!piper) throw new Error("Piper is not installed.");
      const model = locateVoice(voice);
      if (!model) throw new Error(`Voice is not installed: ${voice}`);
      const output = join(speechDir, `${safeFilename(output_name || `${voice}-${Date.now()}`)}.wav`);
      const result = spawnSync(piper, ["--model", model, "--output_file", output], {
        input: `${text}\n`,
        encoding: "utf8",
        windowsHide: true,
        timeout: 120000,
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      });
      if (result.error) throw result.error;
      if (result.status !== 0 || !existsSync(output)) throw new Error(`Piper synthesis failed (${result.status}): ${result.stderr || result.stdout}`);
      return toolResult({ created: true, voice, output });
    },
  );

  server.tool(
    "history_status",
    "Check whether optional local ActivityWatch history is installed and currently running. History remains off unless the user starts ActivityWatch.",
    {},
    async () => {
      let info = null;
      try { info = await activityWatchRequest("/api/0/info"); } catch {}
      return toolResult({ installed: firstExisting(activityWatchCandidates) ?? null, running: Boolean(info), info });
    },
  );

  server.tool(
    "history_start",
    "Start optional local ActivityWatch tracking after user approval. Data stays on this computer.",
    {},
    async () => {
      const executable = firstExisting(activityWatchCandidates);
      if (!executable) throw new Error("ActivityWatch is not installed.");
      const child = spawn(executable, [], { detached: true, windowsHide: true, stdio: "ignore" });
      child.unref();
      return toolResult({ started: true, executable, local_url: "http://127.0.0.1:5600" });
    },
  );

  server.tool(
    "history_recent",
    "Read recent local ActivityWatch window events. Use only when the user asks to use their activity history.",
    { limit: z.number().int().min(1).max(500).default(50) },
    async ({ limit }) => {
      const buckets = await activityWatchRequest("/api/0/buckets");
      const entries = Object.entries(buckets);
      const windowBucket = entries.find(([id]) => id.startsWith("aw-watcher-window_"));
      if (!windowBucket) return toolResult({ bucket: null, events: [] });
      const [bucketId] = windowBucket;
      const events = await activityWatchRequest(`/api/0/buckets/${encodeURIComponent(bucketId)}/events?limit=${limit}`);
      return toolResult({ bucket: bucketId, events });
    },
  );

  server.tool(
    "history_stop",
    "Stop the local ActivityWatch processes after user approval. Existing local history is not deleted.",
    {},
    async () => {
      const stopped = [];
      for (const image of ["aw-qt.exe", "aw-server.exe", "aw-watcher-window.exe", "aw-watcher-afk.exe"]) {
        const result = spawnSync("taskkill.exe", ["/IM", image, "/T", "/F"], { encoding: "utf8", windowsHide: true });
        if (result.status === 0) stopped.push(image);
      }
      return toolResult({ stopped, history_deleted: false });
    },
  );

  await server.connect(new StdioServerTransport());
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
