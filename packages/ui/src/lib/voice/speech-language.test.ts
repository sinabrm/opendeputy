import { describe, expect, test } from 'bun:test';

import {
    detectSpeechLanguage,
    selectLocalSpeechModel,
} from './speech-language';

describe('speech language routing', () => {
    test('routes Persian text to the compact local Piper model', () => {
        const language = detectSpeechLanguage('سلام، چطور می‌توانم کمک کنم؟');
        expect(language).toBe('fa-IR');
        expect(selectLocalSpeechModel(language)).toBe('vits-piper-fa-en-medium');
    });

    test('routes English text to local Kokoro', () => {
        const language = detectSpeechLanguage('This is the answer that you asked for.');
        expect(language).toBe('en-US');
        expect(selectLocalSpeechModel(language)).toBe('kokoro-en-v0_19');
    });

    test('keeps other supported languages on the device voice path', () => {
        const language = detectSpeechLanguage('Esta es una respuesta para tu pregunta.');
        expect(language).toBe('es-ES');
        expect(selectLocalSpeechModel(language)).toBe(null);
    });
});
