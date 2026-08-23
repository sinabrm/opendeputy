import { existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, resolve } from "node:path";

export const NEMOTRON_OMNI_API_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
export const NEMOTRON_OMNI_MODEL = `nvidia/${NEMOTRON_OMNI_API_MODEL}`;
export const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const MEDIA_FORMATS = new Map([
  [".jpeg", { type: "image_url", field: "image_url", mimeType: "image/jpeg" }],
  [".jpg", { type: "image_url", field: "image_url", mimeType: "image/jpeg" }],
  [".png", { type: "image_url", field: "image_url", mimeType: "image/png" }],
  [".mp3", { type: "audio_url", field: "audio_url", mimeType: "audio/mpeg" }],
  [".wav", { type: "audio_url", field: "audio_url", mimeType: "audio/wav" }],
  [".mp4", { type: "video_url", field: "video_url", mimeType: "video/mp4" }],
]);

function defaultOpenCodeAuthPath(environment) {
  const dataRoot = environment.XDG_DATA_HOME?.trim()
    || resolve(homedir(), ".local", "share");
  return resolve(dataRoot, "opencode", "auth.json");
}

export function loadNvidiaApiKey({ environment = process.env, authPath } = {}) {
  const environmentKey = environment.NVIDIA_API_KEY?.trim();
  if (environmentKey) return environmentKey;

  const resolvedAuthPath = authPath || defaultOpenCodeAuthPath(environment);
  if (!existsSync(resolvedAuthPath)) {
    throw new Error("NVIDIA is not connected in OpenCode. Connect NVIDIA or set NVIDIA_API_KEY.");
  }

  let auth;
  try {
    auth = JSON.parse(readFileSync(resolvedAuthPath, "utf8"));
  } catch {
    throw new Error("OpenCode's NVIDIA credential store could not be read.");
  }
  const key = auth?.nvidia?.type === "api" ? auth.nvidia.key?.trim() : "";
  if (!key) {
    throw new Error("NVIDIA is not connected in OpenCode. Connect NVIDIA or set NVIDIA_API_KEY.");
  }
  return key;
}

export function hasNvidiaApiKey(options) {
  try {
    loadNvidiaApiKey(options);
    return true;
  } catch {
    return false;
  }
}

export function resolveMediaFiles(files) {
  return files.map((filePath) => {
    if (!isAbsolute(filePath)) {
      throw new Error(`Media paths must be absolute: ${filePath}`);
    }
    const resolvedPath = resolve(filePath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Media file was not found: ${resolvedPath}`);
    }
    if (!statSync(resolvedPath).isFile()) {
      throw new Error(`Media path is not a file: ${resolvedPath}`);
    }
    const extension = extname(resolvedPath).toLowerCase();
    if (!MEDIA_FORMATS.has(extension)) {
      const detail = extension === ".pdf"
        ? "Nemotron Omni requires PDF pages rendered as PNG or JPEG images; raw PDF files are not accepted."
        : `Nemotron Omni does not accept this attachment format: ${extension || "unknown"}`;
      throw new Error(detail);
    }
    return resolvedPath;
  });
}

export async function buildNemotronContent({ question, files, fileReader = readFile }) {
  const parts = [];
  for (const filePath of files) {
    const format = MEDIA_FORMATS.get(extname(filePath).toLowerCase());
    if (!format) throw new Error(`Unsupported Nemotron Omni attachment: ${filePath}`);
    const encoded = Buffer.from(await fileReader(filePath)).toString("base64");
    parts.push({
      type: format.type,
      [format.field]: { url: `data:${format.mimeType};base64,${encoded}` },
    });
  }
  const fileList = files.map((filePath) => basename(filePath)).join(", ");
  parts.push({
    type: "text",
    text: [
      "Directly inspect every attached image, screenshot, audio file, or video and answer from its observable content.",
      `Attached files: ${fileList}`,
      `Question: ${question}`,
      "Identify findings by filename when there are multiple files. State clearly when content cannot be understood.",
    ].join("\n"),
  });
  return parts;
}

function responseText(messageContent) {
  if (typeof messageContent === "string") return messageContent.trim();
  if (!Array.isArray(messageContent)) return "";
  return messageContent
    .map((part) => typeof part === "string" ? part : part?.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function analyzeMediaWithNemotron({
  question,
  files,
  apiKey = loadNvidiaApiKey(),
  fetchImpl = fetch,
  timeoutMs = 240_000,
}) {
  const resolvedFiles = resolveMediaFiles(files);
  const content = await buildNemotronContent({ question, files: resolvedFiles });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: NEMOTRON_OMNI_API_MODEL,
        messages: [{ role: "user", content }],
        max_tokens: 4096,
        temperature: 0.2,
        top_p: 0.95,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Nemotron Omni timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 4000);
    throw new Error(`Nemotron Omni request failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  const payload = await response.json();
  const analysis = responseText(payload?.choices?.[0]?.message?.content);
  if (!analysis) throw new Error("Nemotron Omni returned no media analysis.");
  return { model: NEMOTRON_OMNI_MODEL, files: resolvedFiles, analysis };
}
