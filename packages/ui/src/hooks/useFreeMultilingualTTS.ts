import { useCallback, useRef, useState } from 'react';

import { browserVoiceService } from '@/lib/voice/browserVoiceService';
import { detectSpeechLanguage, selectLocalSpeechModel } from '@/lib/voice/speech-language';
import { sanitizeForTTS } from '@/lib/voice/summarize';
import { useConfigStore } from '@/stores/useConfigStore';
import { useLocalTTS } from './useLocalTTS';

export function useFreeMultilingualTTS() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const generationRef = useRef(0);
    const speechRate = useConfigStore((state) => state.speechRate);
    const speechPitch = useConfigStore((state) => state.speechPitch);
    const speechVolume = useConfigStore((state) => state.speechVolume);
    const localTtsVoiceId = useConfigStore((state) => state.localTtsVoiceId);
    const {
        speak: speakLocal,
        stop: stopLocal,
        unlockAudio: unlockLocalAudio,
    } = useLocalTTS();

    const stop = useCallback(() => {
        generationRef.current += 1;
        stopLocal();
        browserVoiceService.cancelSpeech();
        setIsPlaying(false);
    }, [stopLocal]);

    const unlockAudio = useCallback(async () => {
        await Promise.allSettled([unlockLocalAudio(), browserVoiceService.unlockAudio()]);
    }, [unlockLocalAudio]);

    const speak = useCallback(async (sourceText: string): Promise<void> => {
        const text = sanitizeForTTS(sourceText);
        if (!text) return;

        stop();
        const generation = generationRef.current;
        const language = detectSpeechLanguage(text, navigator.language || 'en-US');
        const localModel = selectLocalSpeechModel(language);
        setError(null);
        setIsPlaying(true);

        if (localModel) {
            let localError: string | null = null;
            await speakLocal(text, {
                modelId: localModel,
                speakerId: localModel === 'kokoro-en-v0_19' ? localTtsVoiceId : 0,
                speed: speechRate,
                onError: (message) => { localError = message; },
                onEnd: () => {
                    if (generationRef.current === generation) setIsPlaying(false);
                },
            });
            if (generationRef.current !== generation || !localError) return;
        }

        try {
            await browserVoiceService.waitForVoices();
            if (generationRef.current !== generation) return;
            await browserVoiceService.speakText(text, language, () => {
                if (generationRef.current === generation) setIsPlaying(false);
            }, {
                rate: speechRate,
                pitch: speechPitch,
                volume: speechVolume,
            });
        } catch (cause) {
            if (generationRef.current !== generation) return;
            setError(cause instanceof Error ? cause.message : String(cause));
            setIsPlaying(false);
        }
    }, [localTtsVoiceId, speakLocal, speechPitch, speechRate, speechVolume, stop]);

    return { isPlaying, error, speak, stop, unlockAudio };
}
