import { describe, expect, it } from 'vitest';

import { normalizeWhisperLanguage } from './sherpa-recognizer.js';

describe('Whisper language normalization', () => {
  it('passes primary language codes from BCP-47 tags', () => {
    expect(normalizeWhisperLanguage('fa-IR')).toBe('fa');
    expect(normalizeWhisperLanguage('pt_BR')).toBe('pt');
    expect(normalizeWhisperLanguage('YUE-Hant-HK')).toBe('yue');
  });

  it('uses automatic detection for empty, auto, or invalid values', () => {
    expect(normalizeWhisperLanguage('')).toBe('');
    expect(normalizeWhisperLanguage(' auto ')).toBe('');
    expect(normalizeWhisperLanguage('not a language')).toBe('');
  });
});
