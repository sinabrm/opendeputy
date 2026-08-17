import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import sharp from "sharp";
import { z } from "zod";
import { loadNative } from "../../node_modules/@zavora-ai/computer-use-mcp/dist/native.js";

const root = dirname(fileURLToPath(import.meta.url));
const stateRoot = resolve(process.env.OPENDEPUTY_AGENT_KIT_DATA_DIR || root, "visual-grounding");
const captureRoot = resolve(stateRoot, "captures");
const legacyToolsRoot = resolve(
  process.env.OPENDEPUTY_LEGACY_TOOLS_ROOT
    || resolve(process.env.LOCALAPPDATA || root, "OpenChamberTools"),
);
const packagedPythonPath = resolve(root, ".venv", "Scripts", "python.exe");
const legacyPythonPath = resolve(legacyToolsRoot, "visual-grounding", ".venv", "Scripts", "python.exe");
const pythonPath = existsSync(packagedPythonPath) ? packagedPythonPath : legacyPythonPath;
const packagedWorkerPath = resolve(root, "detector_worker.py");
const legacyWorkerPath = resolve(legacyToolsRoot, "visual-grounding", "detector_worker.py");
const workerPath = existsSync(legacyPythonPath) && existsSync(legacyWorkerPath)
  ? legacyWorkerPath
  : packagedWorkerPath;
const openCodePath = process.env.OPENDEPUTY_OPENCODE_BINARY || "opencode";
const native = loadNative();

mkdirSync(captureRoot, { recursive: true });

let worker = null;
let workerLines = null;
let pendingWorkerRequests = [];

function ensureWorker() {
  if (worker && !worker.killed) return;
  if (!existsSync(pythonPath) || !existsSync(workerPath)) {
    throw new Error("The optional local visual detector is not installed.");
  }
  worker = spawn(pythonPath, [workerPath], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  workerLines = createInterface({ input: worker.stdout });
  workerLines.on("line", (line) => {
    const pending = pendingWorkerRequests.shift();
    if (!pending) return;
    try {
      pending.resolve(JSON.parse(line));
    } catch (error) {
      pending.reject(new Error(`Invalid detector response: ${line}`));
    }
  });
  let stderr = "";
  worker.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8000); });
  worker.on("exit", (code) => {
    const error = new Error(`Detector worker exited (${code}). ${stderr}`);
    for (const pending of pendingWorkerRequests.splice(0)) pending.reject(error);
    worker = null;
    workerLines = null;
  });
}

function workerRequest(payload, timeoutMs = 180000) {
  ensureWorker();
  return new Promise((resolvePromise, rejectPromise) => {
    const timeout = setTimeout(() => {
      const index = pendingWorkerRequests.findIndex((entry) => entry.resolve === resolveWithCleanup);
      if (index >= 0) pendingWorkerRequests.splice(index, 1);
      rejectPromise(new Error("Local visual detector timed out."));
    }, timeoutMs);
    const resolveWithCleanup = (value) => {
      clearTimeout(timeout);
      resolvePromise(value);
    };
    const rejectWithCleanup = (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    };
    pendingWorkerRequests.push({ resolve: resolveWithCleanup, reject: rejectWithCleanup });
    worker.stdin.write(`${JSON.stringify(payload)}\n`);
  });
}

function targetBounds({ targetApp, windowId }) {
  let target = windowId ? native.getWindow(windowId) : null;
  if (!target && targetApp) {
    const normalized = targetApp.toLowerCase();
    const matches = native.listWindows().filter((window) =>
      `${window.displayName} ${window.title ?? ""}`.toLowerCase().includes(normalized)
    );
    target = matches.find((window) => window.isOnScreen) ?? matches[0] ?? null;
  }
  if (target?.bounds) return { bounds: target.bounds, target };
  if (windowId || targetApp) throw new Error(`Target window was not found: ${targetApp || windowId}`);
  const display = native.getDisplaySize();
  return { bounds: { x: 0, y: 0, width: display.width, height: display.height }, target: null };
}

async function capture(options) {
  let { bounds, target } = targetBounds(options);
  const display = native.getDisplaySize();
  if (target) {
    native.activateWindow(target.windowId, 3000);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 350));
    const refreshed = native.getWindow(target.windowId) ?? native.listWindows().find((window) => window.windowId === target.windowId);
    if (refreshed?.bounds) {
      target = refreshed;
      bounds = refreshed.bounds;
    }
    if (bounds.x < -1000 || bounds.y < -1000 || bounds.width < 100 || bounds.height < 100) {
      throw new Error(`Target window could not be restored for capture: ${target.displayName || options.targetApp}`);
    }
  }
  let shot = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fullShot = native.takeScreenshot(display.width, undefined, 88, undefined, undefined);
    if (!fullShot.base64) throw new Error("The screenshot capture returned no image data.");
    if (!target) {
      shot = fullShot;
      break;
    }
    const scaleX = fullShot.width / display.width;
    const scaleY = fullShot.height / display.height;
    const left = Math.max(0, Math.round(bounds.x * scaleX));
    const top = Math.max(0, Math.round(bounds.y * scaleY));
    const right = Math.min(fullShot.width, Math.round((bounds.x + bounds.width) * scaleX));
    const bottom = Math.min(fullShot.height, Math.round((bounds.y + bounds.height) * scaleY));
    const buffer = await sharp(Buffer.from(fullShot.base64, "base64"))
      .extract({ left, top, width: right - left, height: bottom - top })
      .jpeg({ quality: 88 })
      .toBuffer();
    const metadata = await sharp(buffer).metadata();
    const statistics = await sharp(buffer).stats();
    shot = {
      base64: buffer.toString("base64"),
      width: metadata.width,
      height: metadata.height,
      entropy: statistics.entropy,
    };
    if (statistics.entropy > 0.05) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  }
  if (!shot.base64) throw new Error("The target-window crop returned no image data.");
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const imagePath = resolve(captureRoot, `${stamp}.jpg`);
  writeFileSync(imagePath, Buffer.from(shot.base64, "base64"));
  return { ...shot, imagePath, stamp, bounds };
}

function addScreenCoordinates(items, bounds, shot) {
  return items.map((item) => ({
    ...item,
    screen_center: [
      Math.round(bounds.x + (item.center[0] / shot.width) * bounds.width),
      Math.round(bounds.y + (item.center[1] / shot.height) * bounds.height),
    ],
  }));
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9+=×÷*/.-]+/g, " ").trim();
}

function chooseLocalTextTarget(goal, elements) {
  const normalizedGoal = normalizeText(goal);
  if (/\b(address bar|url bar|omnibox)\b/.test(normalizedGoal)
      && !/\b(reload|refresh|back|forward|star|bookmark|menu|icon|button|beside|next to)\b/.test(normalizedGoal)) {
    const obviousUrls = elements
      .filter((element) => /^(https?:\/\/|www\.)/i.test(String(element.text ?? "").trim()))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    if (obviousUrls.length) return obviousUrls[0];
    const bottom = Math.max(...elements.map((element) => Number(element.box?.[3] ?? 0)), 1);
    const domainCandidates = elements
      .filter((element) => Number(element.center?.[1] ?? bottom) < bottom * 0.2)
      .filter((element) => /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/:?#].*)?$/i.test(String(element.text ?? "").trim()))
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    if (domainCandidates.length) return domainCandidates[0];
  }
  const aliases = new Map([
    ["plus", "+"], ["add", "+"], ["minus", "-"], ["subtract", "-"],
    ["times", "×"], ["multiply", "×"], ["division", "÷"], ["divide", "÷"],
    ["equals", "="], ["equal", "="], ["decimal", "."],
  ]);
  const goalTerms = new Set(normalizedGoal.split(/\s+/).filter(Boolean));
  for (const [word, symbol] of aliases) if (goalTerms.has(word)) goalTerms.add(symbol);
  const ranked = elements
    .map((element) => {
      const text = normalizeText(element.text);
      let score = 0;
      if (text && goalTerms.has(text)) score += 100;
      if (text.length >= 2 && normalizedGoal.includes(text)) score += 60;
      score += Math.round((element.confidence ?? 0) * 10);
      return { element, score };
    })
    .filter((entry) => entry.score >= 100)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
  return ranked[0].element;
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: captureRoot,
      windowsHide: true,
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { "*": "deny" } }),
      },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      rejectPromise(new Error(`Vision model timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!settled && stdout.includes('"type":"text"') && stdout.includes('"type":"step_finish"')) {
        settled = true;
        clearTimeout(timeout);
        spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        resolvePromise({ stdout, stderr });
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) rejectPromise(new Error(`Vision model failed (${code}): ${stderr || stdout}`));
      else resolvePromise({ stdout, stderr });
    });
  });
}

function extractTextEvents(output) {
  const parts = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "text" && event.part?.text) parts.push(event.part.text);
    } catch {}
  }
  return parts.join("\n").trim();
}

async function detectRegions(options) {
  const shot = await capture(options);
  const bounds = shot.bounds;
  if (!existsSync(pythonPath) || !existsSync(workerPath)) {
    return {
      shot,
      bounds,
      detection: {
        installed: false,
        annotated_path: null,
        regions: [],
        text_elements: [],
        load_seconds: 0,
        detect_seconds: 0,
      },
    };
  }
  const annotatedPath = resolve(captureRoot, `${shot.stamp}-annotated.png`);
  const detection = await workerRequest({
    operation: "detect",
    image_path: shot.imagePath,
    output_path: annotatedPath,
    confidence: options.confidence ?? 0.08,
    image_size: 640,
    max_regions: options.maxRegions ?? 80,
  });
  if (!detection.ok) throw new Error(detection.error);
  detection.regions = addScreenCoordinates(detection.regions, bounds, shot);
  detection.text_elements = addScreenCoordinates(detection.text_elements ?? [], bounds, shot);
  return { shot, bounds, detection };
}

async function locateTarget(options) {
  const { shot, bounds, detection } = await detectRegions(options);
  const localTarget = chooseLocalTextTarget(options.goal, detection.text_elements);
  if (localTarget) {
    return {
      goal: options.goal,
      method: "local-ocr",
      target_app: options.targetApp || null,
      window_id: options.windowId || null,
      window_bounds: bounds,
      screenshot: { path: shot.imagePath, width: shot.width, height: shot.height },
      annotated_screenshot: detection.annotated_path,
      detector: {
        region_count: detection.regions.length,
        text_count: detection.text_elements.length,
        load_seconds: detection.load_seconds,
        detect_seconds: detection.detect_seconds,
      },
      visible_text: detection.text_elements,
      target_text: localTarget,
      target_region: null,
      instruction: `Verify visible text ${JSON.stringify(localTarget.text)} at screen coordinate (${localTarget.screen_center[0]}, ${localTarget.screen_center[1]}) before clicking.`,
    };
  }
  const prompt = [
    "You are a visual grounding helper, not the main agent.",
    detection.installed === false
      ? "The attached screenshot is an unannotated capture. Return the best target center in screenshot pixel coordinates."
      : "The attached screenshot has red numbered boxes around locally detected interactive regions.",
    `User goal: ${options.goal}`,
    detection.installed === false
      ? `The screenshot is ${shot.width} by ${shot.height} pixels. Identify the single safest point to interact with next.`
      : "Identify the single best region to interact with next.",
    "Return ONLY compact JSON with this schema:",
    detection.installed === false
      ? '{"summary":"short screen description","x":number|null,"y":number|null,"label":"what it is","confidence":0.0,"reason":"short reason"}'
      : '{"summary":"short screen description","target_id":number|null,"label":"what it is","confidence":0.0,"reason":"short reason","alternatives":[number]}',
    detection.installed === false
      ? "Use null coordinates when no safe match exists."
      : "Use a visible red region number exactly. Use null when no safe match exists.",
  ].join("\n");
  let visionText = "";
  let visionError = null;
  try {
    const result = await runCommand(
      openCodePath,
      [
        "run",
        prompt,
        "--pure",
        "--dir",
        captureRoot,
        "--model",
        "opencode/mimo-v2.5-free",
        "--format",
        "json",
        "--file",
        detection.annotated_path || shot.imagePath,
      ],
      180000,
    );
    visionText = extractTextEvents(result.stdout);
  } catch (error) {
    visionError = error.message;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(visionText.replace(/^```json\s*|\s*```$/g, ""));
  } catch {}
  const parsedTargetId = parsed?.target_id === null ? null : Number(parsed?.target_id);
  const target = Number.isInteger(parsedTargetId)
    ? detection.regions.find((region) => region.id === parsedTargetId) ?? null
    : null;
  const directX = Number(parsed?.x);
  const directY = Number(parsed?.y);
  const directTarget = detection.installed === false
    && parsed?.x !== null
    && parsed?.y !== null
    && Number.isFinite(directX)
    && Number.isFinite(directY)
    && directX >= 0
    && directY >= 0
    && directX <= shot.width
    && directY <= shot.height
    ? {
      id: null,
      label: parsed?.label || null,
      center: [Math.round(directX), Math.round(directY)],
      screen_center: [
        Math.round(bounds.x + (directX / shot.width) * bounds.width),
        Math.round(bounds.y + (directY / shot.height) * bounds.height),
      ],
    }
    : null;
  const selectedTarget = target || directTarget;
  return {
    goal: options.goal,
    method: directTarget ? "mimo-vision-direct" : parsed ? "mimo-vision" : "local-detection-only",
    target_app: options.targetApp || null,
    window_id: options.windowId || null,
    screenshot: { path: shot.imagePath, width: shot.width, height: shot.height },
    window_bounds: bounds,
    annotated_screenshot: detection.annotated_path,
    detector: {
      region_count: detection.regions.length,
      text_count: detection.text_elements.length,
      load_seconds: detection.load_seconds,
      detect_seconds: detection.detect_seconds,
    },
    vision_model: "opencode/mimo-v2.5-free",
    vision_analysis: parsed ?? (visionText || null),
    vision_error: visionError,
    visible_text: detection.text_elements,
    detected_regions: detection.regions,
    target_region: selectedTarget,
    instruction: selectedTarget
      ? `Inspect ${selectedTarget.id === null ? "the target" : `region ${selectedTarget.id}`} at screen coordinate (${selectedTarget.screen_center[0]}, ${selectedTarget.screen_center[1]}) and verify it still matches before clicking.`
      : "No safe target was identified automatically. Use visible_text if it contains the target; otherwise re-inspect or ask the user.",
  };
}

function toolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export async function startServer() {
  const server = new McpServer({ name: "opendeputy-visual-grounding", version: "1.0.0" });

  server.tool(
    "status",
    "Check whether the local OmniParser region detector and MiMo vision fallback are installed.",
    {},
    async () => toolResult({
      python: existsSync(pythonPath),
      detector_worker: existsSync(workerPath),
      opencode: existsSync(openCodePath),
      detector: existsSync(pythonPath) && existsSync(workerPath)
        ? await workerRequest({ operation: "status" }, 30000)
        : { installed: false },
      vision_model: "opencode/mimo-v2.5-free",
    }),
  );

  server.tool(
    "detect_regions",
    "Capture a window/screen and locally detect clickable visual regions. Use only when Playwright and accessibility-tree inspection cannot identify the target.",
    {
      target_app: z.string().optional(),
      window_id: z.number().int().positive().optional(),
      confidence: z.number().min(0.02).max(0.8).optional(),
      max_regions: z.number().int().min(1).max(150).optional(),
    },
    async ({ target_app, window_id, confidence, max_regions }) => {
      const { shot, bounds, detection } = await detectRegions({ targetApp: target_app, windowId: window_id, confidence, maxRegions: max_regions });
      return toolResult({
        screenshot: { path: shot.imagePath, width: shot.width, height: shot.height },
        window_bounds: bounds,
        annotated_screenshot: detection.annotated_path,
        regions: detection.regions,
        visible_text: detection.text_elements,
        load_seconds: detection.load_seconds,
        detect_seconds: detection.detect_seconds,
      });
    },
  );

  server.tool(
    "locate_target",
    "Use local OmniParser region detection plus MiMo vision to find a target on a visual-only interface and return its exact click center as text for a text-only planner such as DeepSeek.",
    {
      goal: z.string().min(3).max(500),
      target_app: z.string().optional(),
      window_id: z.number().int().positive().optional(),
      confidence: z.number().min(0.02).max(0.8).optional(),
      max_regions: z.number().int().min(1).max(150).optional(),
    },
    async ({ goal, target_app, window_id, confidence, max_regions }) => toolResult(await locateTarget({
      goal,
      targetApp: target_app,
      windowId: window_id,
      confidence,
      maxRegions: max_regions,
    })),
  );

  await server.connect(new StdioServerTransport());
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  process.once("exit", () => {
    try { worker?.kill(); } catch {}
  });
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
