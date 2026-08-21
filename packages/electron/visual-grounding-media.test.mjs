import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  buildMediaAnalysisArgs,
  buildOpenCodeSpawnOptions,
  MUSE_SPARK_MODEL,
  resolveMediaFiles,
} from "./agent-kit/servers/visual-grounding/media-analysis.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const mediaFixture = (name) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opendeputy-media-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, "fixture");
  return { directory, filePath };
};

describe("Muse Spark multimodal analysis", () => {
  it("validates and resolves local media files", () => {
    const { filePath } = mediaFixture("sample image.png");

    assert.deepEqual(resolveMediaFiles([filePath]), [path.resolve(filePath)]);
    assert.throws(() => resolveMediaFiles(["relative.png"]), /must be absolute/);
    assert.throws(() => resolveMediaFiles([path.join(path.dirname(filePath), "missing.png")]), /was not found/);
  });

  it("passes every requested file to the Muse Spark subprocess", () => {
    const { directory, filePath: imagePath } = mediaFixture("first.png");
    const audioPath = path.join(directory, "second.wav");
    const videoPath = path.join(directory, "third.mp4");
    const pdfPath = path.join(directory, "fourth.pdf");
    fs.writeFileSync(audioPath, "fixture");
    fs.writeFileSync(videoPath, "fixture");
    fs.writeFileSync(pdfPath, "fixture");

    const args = buildMediaAnalysisArgs({
      question: "What can you see and hear?",
      files: [imagePath, audioPath, videoPath, pdfPath],
      workingDirectory: directory,
    });

    assert.equal(args[0], "run");
    assert.equal(args[args.indexOf("--model") + 1], MUSE_SPARK_MODEL);
    assert.equal(args[args.indexOf("--dir") + 1], directory);
    assert.deepEqual(
      args.flatMap((value, index) => value === "--file" ? [args[index + 1]] : []),
      [imagePath, audioPath, videoPath, pdfPath],
    );
    assert.match(args[1], /first\.png, second\.wav, third\.mp4, fourth\.pdf/);
    assert.match(args[1], /What can you see and hear\?/);
  });

  it("closes subprocess stdin so non-interactive Muse Spark runs can finish", () => {
    const options = buildOpenCodeSpawnOptions({
      workingDirectory: "C:\\media",
      environment: { EXISTING: "value", OPENCODE_CONFIG_CONTENT: "managed-config" },
    });

    assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
    assert.equal(options.windowsHide, true);
    assert.equal(options.env.EXISTING, "value");
    assert.deepEqual(JSON.parse(options.env.OPENCODE_CONFIG_CONTENT), {
      permission: { "*": "deny" },
    });
  });
});
