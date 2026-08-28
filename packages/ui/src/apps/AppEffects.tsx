import React from 'react';
import { VoiceConversationDialog } from '@/components/voice/VoiceConversationDialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useCurrentSessionActivity } from '@/hooks/useSessionActivity';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { usePwaManifestSync } from '@/hooks/usePwaManifestSync';
import { useQueuedMessageAutoSend } from '@/hooks/useQueuedMessageAutoSend';
import { useSessionAutoCleanup } from '@/hooks/useSessionAutoCleanup';
import { useWindowControlsOverlayLayout } from '@/hooks/useWindowControlsOverlayLayout';
import { preloadLocalDictationModel } from '@/lib/dictation/dictation-model-readiness';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useVoiceStore } from '@/sync/voice-store';
import { setOptimisticRefs } from '@/sync/session-actions';
import { markSessionViewed } from '@/sync/notification-store';
import { setExternallyViewedSession } from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';

const MINI_CHAT_PRESENCE_CHANNEL = 'openchamber:mini-chat-presence';

type MiniChatPresenceMessage = {
  type?: string;
  sessionId?: string;
  directory?: string;
  viewed?: boolean;
};

const SyncOptimisticBridge: React.FC = () => {
  const sync = useSync();
  const addRef = React.useRef(sync.optimistic.add);
  const removeRef = React.useRef(sync.optimistic.remove);
  const confirmRef = React.useRef(sync.optimistic.confirm);
  addRef.current = sync.optimistic.add;
  removeRef.current = sync.optimistic.remove;
  confirmRef.current = sync.optimistic.confirm;

  React.useEffect(() => {
    setOptimisticRefs(
      (input) => addRef.current(input),
      (input) => removeRef.current(input),
      (input) => confirmRef.current(input),
    );
  }, []);

  return null;
};

const MiniChatPresenceBridge: React.FC = () => {
  React.useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(MINI_CHAT_PRESENCE_CHANNEL);
    channel.onmessage = (event) => {
      const data = event.data as MiniChatPresenceMessage | null;
      if (data?.type !== 'mini-chat-session-presence' || !data.sessionId || !data.directory) {
        return;
      }

      const viewed = data.viewed !== false;
      setExternallyViewedSession(data.directory, data.sessionId, viewed);
      if (viewed) {
        markSessionViewed(data.sessionId);
      }
    };

    return () => channel.close();
  }, []);

  return null;
};

const LocalDictationModelPreloadEffect: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const isInitialized = useConfigStore((state) => state.isInitialized);
  const dictationEnabled = useConfigStore((state) => state.dictationEnabled);
  const sttProvider = useConfigStore((state) => state.sttProvider);
  const sttLocalModel = useConfigStore((state) => state.sttLocalModel);

  React.useEffect(() => {
    if (!enabled || !isInitialized || !dictationEnabled || sttProvider !== 'local') {
      return;
    }

    const controller = new AbortController();
    let requestInFlight = false;
    const requestPreload = () => {
      if (requestInFlight || controller.signal.aborted) {
        return;
      }
      requestInFlight = true;
      void preloadLocalDictationModel({
        modelId: sttLocalModel,
        signal: controller.signal,
      }).catch(() => {
        // Background preparation is best-effort after its bounded retries.
        // Recording still performs the authoritative readiness check and
        // reports any remaining error to the user.
      }).finally(() => {
        requestInFlight = false;
      });
    };

    requestPreload();
    window.addEventListener('online', requestPreload);
    return () => {
      controller.abort();
      window.removeEventListener('online', requestPreload);
    };
  }, [dictationEnabled, enabled, isInitialized, sttLocalModel, sttProvider]);

  return null;
};

const LOCAL_TTS_PRELOAD_MODELS = ['kokoro-en-v0_19', 'vits-piper-fa-en-medium'] as const;

const LocalVoiceModelPreloadEffect: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const isInitialized = useConfigStore((state) => state.isInitialized);

  React.useEffect(() => {
    if (!enabled || !isInitialized) return;

    const controller = new AbortController();
    const preload = () => {
      for (const modelId of LOCAL_TTS_PRELOAD_MODELS) {
        void preloadLocalDictationModel({ modelId, signal: controller.signal }).catch(() => {
          // Playback retries authoritatively when background preparation
          // cannot complete because the device is offline or low on disk.
        });
      }
    };

    preload();
    window.addEventListener('online', preload);
    return () => {
      controller.abort();
      window.removeEventListener('online', preload);
    };
  }, [enabled, isInitialized]);

  return null;
};

/**
 * Keep the voice dialog above the replaceable chat composer. Creating a session
 * from the first voice turn swaps ChatInput for the session view; mounting the
 * dialog here keeps its dictation stream and TTS state alive through that swap.
 */
const VoiceConversationHost: React.FC = () => {
  const isOpen = useVoiceStore((state) => state.isOpen);
  const setOpen = useVoiceStore((state) => state.setOpen);
  const sendText = useVoiceStore((state) => state.sendText);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const effectiveDirectory = useEffectiveDirectory();
  const { phase: sessionPhase } = useCurrentSessionActivity();

  if (!isOpen) return null;

  return (
    <VoiceConversationDialog
      open={isOpen}
      onOpenChange={setOpen}
      sessionId={currentSessionId}
      directory={effectiveDirectory}
      sessionPhase={sessionPhase}
      onSend={sendText}
    />
  );
};

export function SyncRuntimeEffects({ embeddedBackgroundWorkEnabled }: {
  embeddedBackgroundWorkEnabled: boolean;
}) {
  useSessionAutoCleanup(embeddedBackgroundWorkEnabled);
  useQueuedMessageAutoSend(embeddedBackgroundWorkEnabled);

  return (
    <>
      <SyncOptimisticBridge />
      <VoiceConversationHost />
    </>
  );
}

export function SyncAppEffects({ embeddedBackgroundWorkEnabled, dictationModelPreloadEnabled }: {
  embeddedBackgroundWorkEnabled: boolean;
  dictationModelPreloadEnabled?: boolean;
}) {
  usePwaManifestSync();
  useWindowControlsOverlayLayout();
  useKeyboardShortcuts();

  return (
    <>
      <SyncRuntimeEffects embeddedBackgroundWorkEnabled={embeddedBackgroundWorkEnabled} />
      <LocalDictationModelPreloadEffect enabled={dictationModelPreloadEnabled === true} />
      <LocalVoiceModelPreloadEffect enabled={dictationModelPreloadEnabled === true} />
      <MiniChatPresenceBridge />
    </>
  );
}
