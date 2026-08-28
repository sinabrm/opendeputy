export const LOCAL_ENGLISH_TTS_MODEL = 'kokoro-en-v0_19' as const;
export const LOCAL_PERSIAN_TTS_MODEL = 'vits-piper-fa-en-medium' as const;

const LATIN_LANGUAGE_HINTS: ReadonlyArray<[string, readonly string[]]> = [
    ['en-US', ['the', 'and', 'you', 'that', 'this', 'with', 'for', 'your', 'is', 'are']],
    ['es-ES', ['que', 'para', 'con', 'una', 'por', 'como', 'pero', 'esta', 'los', 'las']],
    ['fr-FR', ['que', 'pour', 'avec', 'une', 'dans', 'est', 'les', 'des', 'pas', 'vous']],
    ['de-DE', ['und', 'die', 'der', 'das', 'ist', 'mit', 'für', 'nicht', 'ein', 'eine']],
    ['pt-BR', ['que', 'para', 'com', 'uma', 'por', 'não', 'está', 'você', 'os', 'as']],
    ['it-IT', ['che', 'per', 'con', 'una', 'non', 'sono', 'come', 'del', 'gli', 'questa']],
    ['tr-TR', ['ve', 'bir', 'bu', 'için', 'ile', 'değil', 'olarak', 'olan', 'daha', 'çok']],
    ['pl-PL', ['i', 'że', 'dla', 'nie', 'jest', 'się', 'jak', 'to', 'na', 'z']],
];

const normalizeFallback = (fallback: string): string => {
    const value = fallback.trim();
    return /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(value) ? value : 'en-US';
};

export function detectSpeechLanguage(text: string, fallback = 'en-US'): string {
    const value = text.trim();
    if (!value) return normalizeFallback(fallback);

    if (/[پچژگکی]/u.test(value)) return 'fa-IR';
    if (/[\u0600-\u06ff]/u.test(value)) return 'ar-SA';
    if (/[\u3040-\u30ff]/u.test(value)) return 'ja-JP';
    if (/[\uac00-\ud7af]/u.test(value)) return 'ko-KR';
    if (/[\u4e00-\u9fff]/u.test(value)) return 'zh-CN';
    if (/[\u0590-\u05ff]/u.test(value)) return 'he-IL';
    if (/[\u0900-\u097f]/u.test(value)) return 'hi-IN';
    if (/[\u0e00-\u0e7f]/u.test(value)) return 'th-TH';
    if (/[\u0370-\u03ff]/u.test(value)) return 'el-GR';
    if (/[\u0400-\u04ff]/u.test(value)) {
        return /[іїєґ]/iu.test(value) ? 'uk-UA' : 'ru-RU';
    }

    const words = value.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? [];
    let best: { language: string; score: number } | null = null;
    for (const [language, hints] of LATIN_LANGUAGE_HINTS) {
        const score = words.reduce((total, word) => total + (hints.includes(word) ? 1 : 0), 0);
        if (!best || score > best.score) best = { language, score };
    }
    return best && best.score >= 2 ? best.language : normalizeFallback(fallback);
}

export function selectLocalSpeechModel(language: string):
    | typeof LOCAL_ENGLISH_TTS_MODEL
    | typeof LOCAL_PERSIAN_TTS_MODEL
    | null {
    const base = language.toLocaleLowerCase().split('-')[0];
    if (base === 'fa') return LOCAL_PERSIAN_TTS_MODEL;
    if (base === 'en') return LOCAL_ENGLISH_TTS_MODEL;
    return null;
}

export interface StreamingSpeechChunk {
    text: string;
    end: number;
}

const STREAMING_SENTENCE_END = /[.!?\u2026\u3002\uff01\uff1f\u061f]+(?:["'\u201d\u2019\u00bb\uff09)\]]*)?(?=\s|$)/gu;

/**
 * Returns the next stable sentence from a streaming assistant response.
 * An unfinished tail is held until the message is authoritatively complete,
 * preventing the voice from reading words that the model may still change.
 */
export function getNextStreamingSpeechChunk(
    text: string,
    spokenCharacters: number,
    responseComplete: boolean,
): StreamingSpeechChunk | null {
    const start = Math.max(0, spokenCharacters);
    if (start >= text.length) {
        return null;
    }

    const remaining = text.slice(start);
    STREAMING_SENTENCE_END.lastIndex = 0;
    const sentenceEnd = STREAMING_SENTENCE_END.exec(remaining);
    const end = sentenceEnd
        ? start + sentenceEnd.index + sentenceEnd[0].length
        : responseComplete
            ? text.length
            : null;
    if (end === null) {
        return null;
    }

    return {
        text: text.slice(start, end).trim(),
        end,
    };
}
