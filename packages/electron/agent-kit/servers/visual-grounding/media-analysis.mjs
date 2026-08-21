import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";

export const MUSE_SPARK_MODEL = "opencode/muse-spark-1.2-contributor-free";

export function buildOpenCodeSpawnOptions({ workingDirectory, environment }) {
  return {
    cwd: workingDirectory,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...environment,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { "*": "deny" } }),
    },
  };
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
    return resolvedPath;
  });
}

export function buildMediaAnalysisArgs({ question, files, workingDirectory }) {
  const fileList = files.map((filePath) => basename(filePath)).join(", ");
  const prompt = [
    "You are a multimodal media analyst supporting a text-only main agent.",
    "Directly inspect every attached image, screenshot, audio file, video, or PDF and answer the question from its observable content.",
    `Attached files: ${fileList}`,
    `Question: ${question}`,
    "When there are multiple files, identify findings by filename before giving a combined answer.",
    "State clearly when any attached content cannot be accessed or understood.",
  ].join("\n");

  return [
    "run",
    prompt,
    "--pure",
    "--dir",
    workingDirectory,
    "--model",
    MUSE_SPARK_MODEL,
    "--format",
    "json",
    ...files.flatMap((filePath) => ["--file", filePath]),
  ];
}
