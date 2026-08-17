import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const root = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(root, "overlay.ps1");
const stateRoot = resolve(process.env.OPENDEPUTY_AGENT_KIT_DATA_DIR || root, "agent-overlay");
mkdirSync(stateRoot, { recursive: true });
const pidPath = resolve(stateRoot, "overlay.pid");
let activeChild = null;

function readOverlayPid() {
  if (!existsSync(pidPath)) return null;
  const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function overlayStatus() {
  const pid = readOverlayPid();
  const running = isRunning(pid);
  if (!running && existsSync(pidPath)) {
    try { unlinkSync(pidPath); } catch {}
  }
  return { running, pid: running ? pid : null, style: "dim-border-with-stop-button" };
}

export async function showOverlay(label = "AI CONTROL ACTIVE") {
  const current = overlayStatus();
  if (current.running) return current;

  const child = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-File",
      scriptPath,
      "-StateDirectory",
      stateRoot,
      "-Label",
      label,
    ],
    { cwd: stateRoot, stdio: "ignore", windowsHide: true },
  );
  activeChild = child;
  child.once("exit", () => {
    if (activeChild === child) activeChild = null;
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    const status = overlayStatus();
    if (status.running) return status;
  }
  throw new Error("The Windows agent overlay did not start. Check overlay-error.log.");
}

export async function hideOverlay() {
  const pid = readOverlayPid();
  if (isRunning(pid)) {
    try { process.kill(pid); } catch {}
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    if (!isRunning(pid)) break;
  }
  if (existsSync(pidPath)) {
    try { unlinkSync(pidPath); } catch {}
  }
  activeChild = null;
  return overlayStatus();
}

function result(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export async function startServer() {
  const server = new McpServer({ name: "opendeputy-agent-overlay", version: "1.0.0" });

  server.tool(
    "show",
    "Show a click-through shaded desktop border and a user-clickable STOP AI CONTROL button before operating the computer.",
    { label: z.string().max(80).optional() },
    async ({ label }) => result(await showOverlay(label)),
  );

  server.tool(
    "hide",
    "Hide the desktop computer-control border after the computer task finishes or is interrupted.",
    {},
    async () => result(await hideOverlay()),
  );

  server.tool(
    "status",
    "Report whether the desktop computer-control border is visible.",
    {},
    async () => result(overlayStatus()),
  );

  await server.connect(new StdioServerTransport());
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  process.once("exit", () => {
    try { activeChild?.kill(); } catch {}
  });
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
