import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCAL_STT_MODEL,
  LOCAL_STT_MODEL_CATALOG,
  LOCAL_TTS_MODEL_CATALOG,
} from './model-catalog.js';

describe('local speech model catalog transparency', () => {
  it('defaults to the balanced multilingual model', () => {
    expect(DEFAULT_LOCAL_STT_MODEL).toBe('whisper-base-int8');
  });

  it('pins provenance, publisher license metadata, byte size, and SHA-256 for every archive', () => {
    const entries = [
      ...Object.entries(LOCAL_STT_MODEL_CATALOG),
      ...Object.entries(LOCAL_TTS_MODEL_CATALOG),
    ];

    expect(entries).toHaveLength(5);
    expect(new Set(entries.map(([, spec]) => spec.archiveUrl)).size).toBe(entries.length);

    for (const [modelId, spec] of entries) {
      expect(spec.archiveUrl, `${modelId} archive URL`).toMatch(
        /^https:\/\/github\.com\/k2-fsa\/sherpa-onnx\/releases\/download\//,
      );
      expect(spec.archiveIntegrity?.algorithm, `${modelId} integrity algorithm`).toBe('sha256');
      expect(spec.archiveIntegrity?.sha256, `${modelId} archive SHA-256`).toMatch(/^[a-f0-9]{64}$/);
      expect(spec.archiveIntegrity?.bytes, `${modelId} archive bytes`).toBeGreaterThan(0);
      expect(spec.archiveIntegrity?.provenance, `${modelId} integrity provenance`).toBeTruthy();
      expect(spec.archiveIntegrity?.source, `${modelId} integrity source`).toMatch(/^https:\/\//);
      expect(spec.modelSource?.name, `${modelId} model source name`).toBeTruthy();
      expect(spec.modelSource?.url, `${modelId} model source URL`).toMatch(/^https:\/\//);
      expect(spec.modelLicense?.spdx, `${modelId} model license`).toBeTruthy();
      expect(spec.modelLicense?.url, `${modelId} model license URL`).toMatch(/^https:\/\//);
    }
  });
});
