import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  analyzeMediaWithNemotron,
  buildNemotronContent,
  loadNvidiaApiKey,
  NEMOTRON_OMNI_API_MODEL,
  NEMOTRON_OMNI_MODEL,
  NVIDIA_API_URL,
  resolveMediaFiles,
} from "./agent-kit/servers/visual-grounding/media-analysis.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const mediaFixture = (name, contents = "fixture") => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opendeputy-media-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, name);
  fs.writeFileSync(filePath, contents);
  return { directory, filePath };
};

describe("Nemotron Omni multimodal analysis", () => {
  it("validates supported media and rejects raw PDFs", () => {
    const { filePath } = mediaFixture("sample image.png");

    assert.deepEqual(resolveMediaFiles([filePath]), [path.resolve(filePath)]);
    assert.throws(() => resolveMediaFiles(["relative.png"]), /must be absolute/);
    assert.throws(() => resolveMediaFiles([path.join(path.dirname(filePath), "missing.png")]), /was not found/);
    const pdfPath = path.join(path.dirname(filePath), "document.pdf");
    fs.writeFileSync(pdfPath, "fixture");
    assert.throws(() => resolveMediaFiles([pdfPath]), /requires PDF pages rendered as PNG or JPEG/);
  });

  it("loads NVIDIA credentials from the environment or OpenCode auth store", () => {
    assert.equal(loadNvidiaApiKey({ environment: { NVIDIA_API_KEY: " environment-key " } }), "environment-key");

    const { filePath: authPath } = mediaFixture("auth.json", JSON.stringify({
      nvidia: { type: "api", key: "stored-key" },
    }));
    assert.equal(loadNvidiaApiKey({ environment: {}, authPath }), "stored-key");
    assert.throws(
      () => loadNvidiaApiKey({ environment: {}, authPath: path.join(path.dirname(authPath), "missing.json") }),
      /NVIDIA is not connected in OpenCode/,
    );
  });

  it("encodes image, audio, and video files for NVIDIA's multimodal API", async () => {
    const { directory, filePath: imagePath } = mediaFixture("first.png", "image");
    const audioPath = path.join(directory, "second.wav");
    const videoPath = path.join(directory, "third.mp4");
    fs.writeFileSync(audioPath, "audio");
    fs.writeFileSync(videoPath, "video");

    const content = await buildNemotronContent({
      question: "What can you see and hear?",
      files: [imagePath, audioPath, videoPath],
    });

    assert.match(content[0].image_url.url, /^data:image\/png;base64,/);
    assert.match(content[1].audio_url.url, /^data:audio\/wav;base64,/);
    assert.match(content[2].video_url.url, /^data:video\/mp4;base64,/);
    assert.match(content[3].text, /first\.png, second\.wav, third\.mp4/);
    assert.match(content[3].text, /What can you see and hear\?/);
  });

  it("sends media directly to the hosted Nemotron endpoint and returns text", async () => {
    const { filePath } = mediaFixture("sample.png");
    let request;
    const result = await analyzeMediaWithNemotron({
      question: "Describe it",
      files: [filePath],
      apiKey: "test-key",
      fetchImpl: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          status: 200,
          async json() {
            return { choices: [{ message: { content: "Visible test result" } }] };
          },
        };
      },
    });

    assert.equal(request.url, NVIDIA_API_URL);
    assert.equal(request.options.headers.Authorization, "Bearer test-key");
    assert.equal(JSON.parse(request.options.body).model, NEMOTRON_OMNI_API_MODEL);
    assert.deepEqual(result, {
      model: NEMOTRON_OMNI_MODEL,
      files: [path.resolve(filePath)],
      analysis: "Visible test result",
    });
  });

  it("reports hosted API failures without exposing the credential", async () => {
    const { filePath } = mediaFixture("sample.png");
    await assert.rejects(
      analyzeMediaWithNemotron({
        question: "Describe it",
        files: [filePath],
        apiKey: "secret-test-key",
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          async text() { return "Rate limit exceeded"; },
        }),
      }),
      (error) => {
        assert.match(error.message, /Nemotron Omni request failed \(429\): Rate limit exceeded/);
        assert.doesNotMatch(error.message, /secret-test-key/);
        return true;
      },
    );
  });
});
