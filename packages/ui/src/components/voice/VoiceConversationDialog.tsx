import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDictation } from '@/hooks/useDictation';
import { useFreeMultilingualTTS } from '@/hooks/useFreeMultilingualTTS';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getNextStreamingSpeechChunk } from '@/lib/voice/speech-language';
import { useConfigStore } from '@/stores/useConfigStore';
import { extractTextContent } from '@/components/chat/message/partUtils';
import { useSessionMessages, useSessionParts } from '@/sync/sync-context';

type ConversationState = 'preparing' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export interface VoiceConversationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sessionId: string | null;
    directory?: string;
    sessionPhase: string;
    onSend: (text: string) => void;
}

const SILENCE_AFTER_SPEECH_MS = 800;
const SILENCE_CHECK_INTERVAL_MS = 100;
const SPEECH_VOLUME_THRESHOLD = 0.035;
const STATUS_KEYS = {
    preparing: 'chat.voiceMode.preparing',
    listening: 'chat.dictation.listening',
    transcribing: 'chat.dictation.processing',
    thinking: 'chat.voiceMode.thinking',
    speaking: 'chat.voiceMode.speaking',
    error: 'chat.dictation.failed',
} as const;

export function VoiceConversationDialog({
    open,
    onOpenChange,
    sessionId,
    directory,
    sessionPhase,
    onSend,
}: VoiceConversationDialogProps) {
    const { t } = useI18n();
    const messages = useSessionMessages(sessionId ?? '', directory);
    const latestAssistantInfo = React.useMemo(() => {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (message.role === 'assistant') return message;
        }
        return null;
    }, [messages]);
    const latestAssistantParts = useSessionParts(latestAssistantInfo?.id ?? '', directory);
    const latestAssistant = React.useMemo(() => {
        if (!latestAssistantInfo) return null;
        const text = latestAssistantParts
            .filter((part) => part.type === 'text')
            .map(extractTextContent)
            .join('\n')
            .trim();
        const completedAt = (latestAssistantInfo as { time?: { completed?: unknown } }).time?.completed;
        return {
            id: latestAssistantInfo.id,
            text,
            complete: typeof completedAt === 'number' && completedAt > 0,
        };
    }, [latestAssistantInfo, latestAssistantParts]);

    const [muted, setMuted] = React.useState(false);
    const [lastTranscript, setLastTranscript] = React.useState('');
    const [awaitingResponse, setAwaitingResponse] = React.useState(false);
    const responseBaselineRef = React.useRef<string | null>(null);
    const activeResponseSpeechRef = React.useRef({ messageId: null as string | null, spokenCharacters: 0 });
    const speechPumpRunningRef = React.useRef(false);
    const speechPumpRequestedRef = React.useRef(false);
    const heardSpeechRef = React.useRef(false);
    const lastSpeechAtRef = React.useRef(0);
    const durationRef = React.useRef(0);
    const openRef = React.useRef(open);
    const mutedRef = React.useRef(muted);
    const sendRef = React.useRef(onSend);
    const latestAssistantRef = React.useRef(latestAssistant);
    const awaitingResponseRef = React.useRef(awaitingResponse);

    openRef.current = open;
    mutedRef.current = muted;
    sendRef.current = onSend;
    latestAssistantRef.current = latestAssistant;
    awaitingResponseRef.current = awaitingResponse;

    const {
        isPlaying: voiceIsPlaying,
        error: voiceError,
        speak: speakVoice,
        stop: stopVoice,
        unlockAudio,
    } = useFreeMultilingualTTS();
    const unlockAudioRef = React.useRef(unlockAudio);
    unlockAudioRef.current = unlockAudio;
    const {
        status: dictationStatus,
        isRecording,
        partialTranscript,
        volume,
        duration,
        error: dictationError,
        startDictation,
        confirmDictation,
        cancelDictation,
        retryFailedDictation,
    } = useDictation({
        getStartOptions: () => {
            const language = useConfigStore.getState().sttLanguage.trim();
            return {
                provider: 'muse',
                ...(language ? { language } : {}),
            };
        },
        canStart: () => Boolean(openRef.current && !mutedRef.current),
        onTranscript: (text) => {
            setLastTranscript(text);
            awaitingResponseRef.current = true;
            setAwaitingResponse(true);
            responseBaselineRef.current = latestAssistantRef.current?.id ?? null;
            activeResponseSpeechRef.current = { messageId: null, spokenCharacters: 0 };
            sendRef.current(text);
        },
    });
    durationRef.current = duration;

    const startListeningRef = React.useRef<() => void>(() => undefined);
    const startListening = React.useCallback(() => {
        if (!openRef.current || mutedRef.current || sessionPhase !== 'idle') return;
        heardSpeechRef.current = false;
        lastSpeechAtRef.current = 0;
        void startDictation();
    }, [sessionPhase, startDictation]);
    startListeningRef.current = startListening;

    React.useEffect(() => {
        if (!open) return;
        setMuted(false);
        setLastTranscript('');
        awaitingResponseRef.current = false;
        setAwaitingResponse(false);
        responseBaselineRef.current = latestAssistantRef.current?.id ?? null;
        activeResponseSpeechRef.current = { messageId: null, spokenCharacters: 0 };
        void unlockAudioRef.current();
        const timeout = window.setTimeout(() => startListeningRef.current(), 120);
        return () => window.clearTimeout(timeout);
    }, [open]); // Opening intentionally snapshots the current turn only once.

    React.useEffect(() => {
        if (open) return;
        void cancelDictation();
        stopVoice();
    }, [cancelDictation, open, stopVoice]);

    const pumpResponseSpeech = React.useCallback(async () => {
        speechPumpRequestedRef.current = true;
        if (speechPumpRunningRef.current) return;
        speechPumpRunningRef.current = true;

        try {
            do {
                speechPumpRequestedRef.current = false;
                while (openRef.current && !mutedRef.current && awaitingResponseRef.current) {
                    const response = latestAssistantRef.current;
                    if (!response || response.id === responseBaselineRef.current) break;

                    const progress = activeResponseSpeechRef.current;
                    if (progress.messageId !== response.id) {
                        activeResponseSpeechRef.current = {
                            messageId: response.id,
                            spokenCharacters: 0,
                        };
                    }

                    const activeProgress = activeResponseSpeechRef.current;
                    const next = getNextStreamingSpeechChunk(
                        response.text,
                        activeProgress.spokenCharacters,
                        response.complete,
                    );
                    if (!next) {
                        if (response.complete && activeProgress.spokenCharacters >= response.text.length) {
                            awaitingResponseRef.current = false;
                            setAwaitingResponse(false);
                        }
                        break;
                    }

                    activeProgress.spokenCharacters = next.end;
                    if (next.text) {
                        await speakVoice(next.text);
                    }
                }
            } while (speechPumpRequestedRef.current);
        } finally {
            speechPumpRunningRef.current = false;
            if (speechPumpRequestedRef.current) {
                void pumpResponseSpeech();
            }
        }
    }, [speakVoice]);

    React.useEffect(() => {
        if (!open || !awaitingResponse || muted) return;
        void pumpResponseSpeech();
    }, [awaitingResponse, latestAssistant, muted, open, pumpResponseSpeech]);

    React.useEffect(() => {
        if (
            open
            && !muted
            && !awaitingResponse
            && !voiceIsPlaying
            && !dictationError
            && !voiceError
            && sessionPhase === 'idle'
            && dictationStatus === 'idle'
        ) {
            const timeout = window.setTimeout(() => startListeningRef.current(), 120);
            return () => window.clearTimeout(timeout);
        }
    }, [awaitingResponse, dictationError, dictationStatus, muted, open, sessionPhase, voiceError, voiceIsPlaying]);

    React.useEffect(() => {
        if (!isRecording) return;
        if (volume >= SPEECH_VOLUME_THRESHOLD) {
            heardSpeechRef.current = true;
            lastSpeechAtRef.current = Date.now();
        }
    }, [isRecording, volume]);

    React.useEffect(() => {
        if (!isRecording) return;
        const interval = window.setInterval(() => {
            if (
                heardSpeechRef.current
                && durationRef.current >= 1
                && Date.now() - lastSpeechAtRef.current >= SILENCE_AFTER_SPEECH_MS
            ) {
                heardSpeechRef.current = false;
                void confirmDictation();
            }
        }, SILENCE_CHECK_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [confirmDictation, isRecording]);

    const state: ConversationState = dictationError || voiceError
        ? 'error'
        : voiceIsPlaying
            ? 'speaking'
            : awaitingResponse || sessionPhase !== 'idle'
                ? 'thinking'
                : dictationStatus === 'recording'
                    ? 'listening'
                    : dictationStatus === 'uploading'
                        ? 'transcribing'
                        : 'preparing';

    const statusLabel = t(STATUS_KEYS[state]);
    const orbScale = isRecording ? 1 + Math.min(0.12, volume * 0.45) : 1;

    const handleOrbAction = () => {
        if (voiceIsPlaying) {
            stopVoice();
            window.setTimeout(() => startListeningRef.current(), 80);
            return;
        }
        if (isRecording) {
            void confirmDictation();
            return;
        }
        if (dictationStatus === 'failed') {
            void retryFailedDictation();
            return;
        }
        startListeningRef.current();
    };

    const toggleMute = () => {
        const next = !muted;
        setMuted(next);
        if (next) {
            void cancelDictation();
            stopVoice();
        } else {
            window.setTimeout(() => startListeningRef.current(), 80);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="h-[min(720px,calc(100dvh-2rem))] max-w-2xl overflow-hidden border-border/70 bg-background/95 p-0 sm:rounded-[2rem]"
                aria-describedby="voice-conversation-description"
            >
                <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <DialogTitle className="typography-ui-heading">{t('chat.voiceMode.title')}</DialogTitle>
                            <DialogDescription id="voice-conversation-description" className="mt-1">
                                {t('chat.voiceMode.description')}
                            </DialogDescription>
                        </div>
                        <button
                            type="button"
                            className="flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-interactive text-foreground transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => onOpenChange(false)}
                            aria-label={t('chat.voiceMode.close')}
                            title={t('chat.voiceMode.close')}
                        >
                            <Icon name="close" className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 text-center">
                        <button
                            type="button"
                            className="group relative flex h-52 w-52 touch-manipulation items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background sm:h-60 sm:w-60"
                            onClick={handleOrbAction}
                            aria-label={isRecording ? t('chat.voiceMode.finishTurn') : statusLabel}
                        >
                            <span className={cn('voice-orb-halo absolute inset-3 rounded-full bg-primary/15', state === 'speaking' && 'voice-orb-halo--speaking')} />
                            <span className="voice-orb-drift absolute inset-8 rounded-full bg-primary/25 blur-2xl" />
                            <span
                                className={cn(
                                    'voice-orb-core relative flex h-32 w-32 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-100 sm:h-36 sm:w-36',
                                    state === 'thinking' && 'opacity-80',
                                )}
                                style={{ transform: `scale(${orbScale})` }}
                            >
                                <Icon
                                    name={state === 'speaking' ? 'volume-up' : state === 'thinking' ? 'loader-4' : 'mic'}
                                    className={cn('h-10 w-10', state === 'thinking' && 'animate-spin')}
                                />
                            </span>
                        </button>

                        <div className="min-h-24 max-w-lg" aria-live="polite" aria-atomic="true">
                            <p className="text-xl font-medium text-foreground">{muted ? t('chat.voiceMode.muted') : statusLabel}</p>
                            <p className="mt-2 min-h-10 text-pretty typography-ui-label text-muted-foreground">
                                {partialTranscript || lastTranscript || t('chat.voiceMode.finishTurnHint')}
                            </p>
                            {dictationError || voiceError ? (
                                <p className="mt-2 typography-ui-compact text-[var(--status-error)]">
                                    {dictationError || voiceError}
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-4">
                        <button
                            type="button"
                            className={cn(
                                'flex h-12 min-w-12 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                muted ? 'bg-[var(--status-error)]/15' : 'bg-interactive hover:bg-interactive-hover',
                            )}
                            onClick={toggleMute}
                            aria-pressed={muted}
                            aria-label={muted ? t('chat.voiceMode.unmute') : t('chat.voiceMode.mute')}
                        >
                            <Icon name={muted ? 'mic' : 'pause'} className="h-5 w-5" />
                            <span className="typography-ui-label">{muted ? t('chat.voiceMode.unmute') : t('chat.voiceMode.mute')}</span>
                        </button>
                        <button
                            type="button"
                            className="flex h-12 min-w-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-foreground px-4 text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => onOpenChange(false)}
                        >
                            <Icon name="close" className="h-5 w-5" />
                            <span className="typography-ui-label">{t('chat.voiceMode.close')}</span>
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
