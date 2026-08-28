import { describe, expect, test } from 'bun:test';

import {
    detectSpeechLanguage,
    getNextStreamingSpeechChunk,
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

describe('streaming speech chunks', () => {
    test('speaks the first complete sentence without waiting for the full response', () => {
        expect(getNextStreamingSpeechChunk('First answer. Second is still', 0, false)).toEqual({
            text: 'First answer.',
            end: 13,
        });
    });

    test('waits for a stable boundary while a sentence is streaming', () => {
        expect(getNextStreamingSpeechChunk('This answer is still being generated', 0, false)).toBeNull();
    });

    test('speaks an unfinished final tail after the response completes', () => {
        expect(getNextStreamingSpeechChunk('A final answer without punctuation', 0, true)).toEqual({
            text: 'A final answer without punctuation',
            end: 34,
        });
    });

    test('recognizes Persian sentence punctuation and resumes after spoken text', () => {
        const text = 'جواب اول؟ جواب دوم.';
        const first = getNextStreamingSpeechChunk(text, 0, false);
        expect(first?.text).toBe('جواب اول؟');
        expect(getNextStreamingSpeechChunk(text, first?.end ?? 0, false)?.text).toBe('جواب دوم.');
    });
});
