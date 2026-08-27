/**
 * Catalog of local sherpa-onnx STT models available for dictation.
 * Models are downloaded on demand from the k2-fsa GitHub releases and
 * extracted under the OpenChamber speech-models directory.
 *
 * `type` selects the recognizer construction path in the worker:
 * - 'nemo_transducer': encoder/decoder/joiner transducer (Parakeet)
 * - 'whisper': encoder/decoder Whisper export
 * `files` maps logical roles to file names inside the extracted directory.
 */

import path from 'path';

export const LOCAL_STT_MODEL_CATALOG = {
  'parakeet-tdt-0.6b-v2-int8': {
    type: 'nemo_transducer',
    archiveUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2',
    archiveIntegrity: {
      algorithm: 'sha256',
      sha256: '157c157bc51155e03e37d2466522a3a737dd9c72bb25f36eb18912964161e1ad',
      bytes: 482468385,
      provenance: 'github-release-api',
      source: 'https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/asr-models',
    },
    modelSource: {
      name: 'NVIDIA Parakeet TDT 0.6B v2',
      url: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2',
    },
    modelLicense: {
      spdx: 'CC-BY-4.0',
      url: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2#license-terms-of-use',
    },
    extractedDir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
    files: {
      encoder: 'encoder.int8.onnx',
      decoder: 'decoder.int8.onnx',
      joiner: 'joiner.int8.onnx',
      tokens: 'tokens.txt',
    },
    description: 'NVIDIA Parakeet TDT v2 (English)',
  },
  'parakeet-tdt-0.6b-v3-int8': {
    type: 'nemo_transducer',
    archiveUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2',
    archiveIntegrity: {
      algorithm: 'sha256',
      sha256: '5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf',
      bytes: 487170055,
      provenance: 'github-release-api',
      source: 'https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/asr-models',
    },
    modelSource: {
      name: 'NVIDIA Parakeet TDT 0.6B v3',
      url: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3',
    },
    modelLicense: {
      spdx: 'CC-BY-4.0',
      url: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3#license-terms-of-use',
    },
    extractedDir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
    files: {
      encoder: 'encoder.int8.onnx',
      decoder: 'decoder.int8.onnx',
      joiner: 'joiner.int8.onnx',
      tokens: 'tokens.txt',
    },
    description: 'NVIDIA Parakeet TDT v3 (25 European languages, auto-detected)',
  },
  'whisper-base-int8': {
    type: 'whisper',
    archiveUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2',
    archiveIntegrity: {
      algorithm: 'sha256',
      sha256: '911b2083efd7c0dca2ac3b358b75222660dc09fb716d64fbfc417ba6c99ff3de',
      bytes: 207557382,
      provenance: 'maintainer-verified',
      verifiedAt: '2026-08-16',
      source:
        'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2',
      note: 'GitHub does not publish a digest for this older release asset; the exact upstream asset was downloaded and hashed by an OpenDeputy maintainer.',
    },
    modelSource: {
      name: 'OpenAI Whisper base',
      url: 'https://github.com/openai/whisper',
    },
    modelLicense: {
      spdx: 'MIT',
      url: 'https://github.com/openai/whisper#license',
    },
    extractedDir: 'sherpa-onnx-whisper-base',
    files: {
      encoder: 'base-encoder.int8.onnx',
      decoder: 'base-decoder.int8.onnx',
      tokens: 'base-tokens.txt',
    },
    description: 'OpenAI Whisper base (multilingual, smaller and lighter)',
  },
  'whisper-tiny-int8': {
    type: 'whisper',
    archiveUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2',
    archiveIntegrity: {
      algorithm: 'sha256',
      sha256: 'c46116994e539aa165266d96b325252728429c12535eb9d8b6a2b10f129e66b1',
      bytes: 116204861,
      provenance: 'maintainer-verified',
      verifiedAt: '2026-08-16',
      source:
        'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2',
      note: 'GitHub does not publish a digest for this older release asset; the exact upstream asset was downloaded and hashed by an OpenDeputy maintainer.',
    },
    modelSource: {
      name: 'OpenAI Whisper tiny',
      url: 'https://github.com/openai/whisper',
    },
    modelLicense: {
      spdx: 'MIT',
      url: 'https://github.com/openai/whisper#license',
    },
    extractedDir: 'sherpa-onnx-whisper-tiny',
    files: {
      encoder: 'tiny-encoder.int8.onnx',
      decoder: 'tiny-decoder.int8.onnx',
      tokens: 'tiny-tokens.txt',
    },
    description: 'OpenAI Whisper tiny (multilingual, fastest and lightest)',
  },
};

/**
 * Local text-to-speech models (sherpa-onnx OfflineTts). Downloaded and
 * managed through the same pipeline as the STT models.
 */
export const LOCAL_TTS_MODEL_CATALOG = {
  'kokoro-en-v0_19': {
    type: 'kokoro',
    archiveUrl:
      'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2',
    archiveIntegrity: {
      algorithm: 'sha256',
      sha256: '912804855a04745fa77a30be545b3f9a5d15c4d66db00b88cbcd4921df605ac7',
      bytes: 319625534,
      provenance: 'github-release-api',
      source: 'https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/tts-models',
    },
    modelSource: {
      name: 'Kokoro-82M v0.19',
      url: 'https://huggingface.co/hexgrad/Kokoro-82M/tree/e6a2633a608163a6383195168a1abf0c4b8aeaa7',
    },
    modelLicense: {
      spdx: 'Apache-2.0',
      url: 'https://huggingface.co/hexgrad/Kokoro-82M',
    },
    extractedDir: 'kokoro-en-v0_19',
    files: {
      model: 'model.onnx',
      voices: 'voices.bin',
      tokens: 'tokens.txt',
      espeakData: 'espeak-ng-data',
    },
    description: 'Kokoro TTS (English, natural voices)',
  },
};

export const DEFAULT_LOCAL_STT_MODEL = 'whisper-base-int8';
export const DEFAULT_LOCAL_TTS_MODEL = 'kokoro-en-v0_19';

export const LOCAL_STT_MODEL_IDS = Object.keys(LOCAL_STT_MODEL_CATALOG);
export const LOCAL_TTS_MODEL_IDS = Object.keys(LOCAL_TTS_MODEL_CATALOG);

/**
 * @param {string} modelId
 * @returns {boolean}
 */
export function isLocalSttModelId(modelId) {
  return typeof modelId === 'string' && Object.hasOwn(LOCAL_STT_MODEL_CATALOG, modelId);
}

/**
 * @param {string} modelId
 * @returns {boolean}
 */
export function isLocalTtsModelId(modelId) {
  return typeof modelId === 'string' && Object.hasOwn(LOCAL_TTS_MODEL_CATALOG, modelId);
}

/**
 * Any managed local model (STT or TTS).
 * @param {string} modelId
 * @returns {boolean}
 */
export function isLocalModelId(modelId) {
  return isLocalSttModelId(modelId) || isLocalTtsModelId(modelId);
}

/**
 * Spec lookup across both catalogs (STT and TTS).
 * @param {string} modelId
 */
export function getLocalSttModelSpec(modelId) {
  const spec = LOCAL_STT_MODEL_CATALOG[modelId] ?? LOCAL_TTS_MODEL_CATALOG[modelId];
  if (!spec) {
    throw new Error(`Unknown local speech model id: ${modelId}`);
  }
  return {
    id: modelId,
    ...spec,
    requiredFiles: Object.values(spec.files),
  };
}

/**
 * @param {string} modelsDir
 * @param {string} modelId
 * @returns {string}
 */
export function getLocalSttModelDir(modelsDir, modelId) {
  return path.join(modelsDir, getLocalSttModelSpec(modelId).extractedDir);
}
