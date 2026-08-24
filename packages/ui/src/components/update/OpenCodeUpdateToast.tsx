import * as React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/toast';
import { reloadOpenCodeConfiguration } from '@/stores/useAgentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { updateDesktopSettings } from '@/lib/persistence';
import { isWindowsArm64 } from '@/lib/platform';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';
import {
  resolveOpenCodeUpdateAction,
  resolveOpenCodeUpdateVersion,
  resolveOpenCodeUpgradeStatusVersion,
  type OpenCodeUpgradeStatusLike,
} from './openCodeUpdateDedup';

const UPDATE_TOAST_ID = 'opencode-update-available';
const UPGRADE_TOAST_ID = 'opencode-upgrade-progress';
const INITIAL_CHECK_DELAY_MS = 5_000;
const CHECK_RETRY_DELAYS_MS = [10_000, 60_000];
const UPDATE_TOAST_DISMISSED_VERSION_KEY = 'opencode-update-toast-dismissed-version';

interface UpdatePromptDescriptionProps {
  version: string;
  onAutoUpdateChange: (checked: boolean) => void;
}

const UpdatePromptDescription: React.FC<UpdatePromptDescriptionProps> = ({
  version,
  onAutoUpdateChange,
}) => {
  const { t } = useI18n();
  const [checked, setChecked] = React.useState(false);
  const setAutoUpdate = React.useCallback((next: boolean) => {
    setChecked(next);
    onAutoUpdateChange(next);
  }, [onAutoUpdateChange]);

  return (
    <div className="flex flex-col gap-2">
      <span>{t('opencodeUpdate.toast.available.description', { version })}</span>
      <div className="flex items-center gap-2 text-foreground">
        <Checkbox
          checked={checked}
          onChange={setAutoUpdate}
          ariaLabel={t('settings.openchamber.opencodeCli.field.autoUpdateAria')}
        />
        <button
          type="button"
          className="text-left typography-meta"
          onClick={() => setAutoUpdate(!checked)}
        >
          {t('settings.openchamber.opencodeCli.field.autoUpdate')}
        </button>
      </div>
    </div>
  );
};

export const OpenCodeUpdateToast: React.FC = () => {
  const { t } = useI18n();
  const autoUpdateOpenCode = useUIStore((state) => state.autoUpdateOpenCode);
  const seenVersionsRef = React.useRef(new Set<string>());
  const upgradingRef = React.useRef(false);

  React.useEffect(() => {
    seenVersionsRef.current.clear();
    if (autoUpdateOpenCode) {
      toast.dismiss(UPDATE_TOAST_ID);
    }
  }, [autoUpdateOpenCode]);

  const reloadOpenCode = React.useCallback(() => {
    toast.dismiss(UPGRADE_TOAST_ID);
    void reloadOpenCodeConfiguration({
      message: t('opencodeUpdate.toast.reload.message'),
      mode: 'projects',
      scopes: ['all'],
    }).catch(() => undefined);
  }, [t]);

  const runUpgrade = React.useCallback(async () => {
    if (upgradingRef.current) return;
    upgradingRef.current = true;
    toast.dismiss(UPDATE_TOAST_ID);
    toast.message(t('opencodeUpdate.toast.upgrading.title'), {
      id: UPGRADE_TOAST_ID,
      description: t('opencodeUpdate.toast.upgrading.description'),
      duration: Infinity,
      icon: <Icon name="refresh" className="h-4 w-4 animate-spin text-muted-foreground" />,
    });

    try {
      const response = await runtimeFetch('/api/opencode/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => null) as null | { success?: boolean; version?: string; error?: string };
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || response.statusText || t('opencodeUpdate.toast.failed.description'));
      }

      toast.success(t('opencodeUpdate.toast.updated.title'), {
        id: UPGRADE_TOAST_ID,
        description: payload?.version
          ? t('opencodeUpdate.toast.updated.descriptionWithVersion', { version: payload.version })
          : t('opencodeUpdate.toast.updated.description'),
        duration: Infinity,
        icon: <Icon name="check" className="h-4 w-4 text-[var(--status-success)]" />,
        action: {
          label: t('opencodeUpdate.toast.actions.reload'),
          onClick: reloadOpenCode,
        },
      });
    } catch (error) {
      toast.error(t('opencodeUpdate.toast.failed.title'), {
        id: UPGRADE_TOAST_ID,
        description: error instanceof Error ? error.message : t('opencodeUpdate.toast.failed.description'),
        duration: Infinity,
      });
    } finally {
      upgradingRef.current = false;
    }
  }, [reloadOpenCode, t]);

  React.useEffect(() => {
    const showUpdateAvailableToast = (version: string) => {
      const decision = resolveOpenCodeUpdateAction({
        version,
        autoUpdate: useUIStore.getState().autoUpdateOpenCode,
        dismissedVersion: getDeferredSafeStorage().getItem(UPDATE_TOAST_DISMISSED_VERSION_KEY),
        seenVersions: seenVersionsRef.current,
      });
      if (decision === 'none') {
        return;
      }
      seenVersionsRef.current.add(version);

      if (decision === 'upgrade') {
        void runUpgrade();
        return;
      }

      const autoUpdateOnConfirm = { current: false };
      toast.info(t('opencodeUpdate.toast.available.title'), {
        id: UPDATE_TOAST_ID,
        description: (
          <UpdatePromptDescription
            version={version}
            onAutoUpdateChange={(checked) => {
              autoUpdateOnConfirm.current = checked;
            }}
          />
        ),
        duration: Infinity,
        action: {
          label: t('opencodeUpdate.toast.actions.update'),
          onClick: () => {
            if (autoUpdateOnConfirm.current) {
              useUIStore.getState().setAutoUpdateOpenCode(true);
              void updateDesktopSettings({ autoUpdateOpenCode: true });
            }
            void runUpgrade();
          },
        },
        cancel: {
          label: t('opencodeUpdate.toast.actions.dismiss'),
          onClick: () => {
            getDeferredSafeStorage().setItem(UPDATE_TOAST_DISMISSED_VERSION_KEY, version);
            void updateDesktopSettings({ openCodeUpdateToastDismissedVersion: version });
            toast.dismiss(UPDATE_TOAST_ID);
          },
        },
      });
    };

    let cancelled = false;
    const timeoutIds: Array<ReturnType<typeof setTimeout>> = [];

    const checkForUpdate = async (attempt: number, runtimeKey = getRuntimeKey()) => {
      try {
        const response = await runtimeFetch('/api/opencode/upgrade-status', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(response.statusText || 'OpenCode upgrade status check failed');
        const status = await response.json().catch(() => null) as OpenCodeUpgradeStatusLike | null;
        const version = resolveOpenCodeUpgradeStatusVersion(status);
        if (!cancelled && runtimeKey === getRuntimeKey() && version) {
          showUpdateAvailableToast(version);
        }
      } catch {
        const delay = CHECK_RETRY_DELAYS_MS[attempt];
        if (!cancelled && runtimeKey === getRuntimeKey() && delay !== undefined) {
          timeoutIds.push(setTimeout(() => { void checkForUpdate(attempt + 1, runtimeKey); }, delay));
        }
      }
    };

    const onUpdateAvailable = (event: Event) => {
      const version = resolveOpenCodeUpdateVersion((event as CustomEvent<unknown>).detail);
      if (version) {
        void checkForUpdate(0);
      }
    };

    if (!isWindowsArm64()) {
      timeoutIds.push(setTimeout(() => { void checkForUpdate(0); }, INITIAL_CHECK_DELAY_MS));
    }

    const unsubscribeRuntime = subscribeRuntimeEndpointChanged(({ runtimeKey }) => {
      seenVersionsRef.current.clear();
      toast.dismiss(UPDATE_TOAST_ID);
      if (!isWindowsArm64()) {
        void checkForUpdate(0, runtimeKey);
      }
    });

    window.addEventListener('openchamber:opencode-update-available', onUpdateAvailable);
    return () => {
      cancelled = true;
      for (const timeoutId of timeoutIds) clearTimeout(timeoutId);
      unsubscribeRuntime();
      window.removeEventListener('openchamber:opencode-update-available', onUpdateAvailable);
    };
  }, [autoUpdateOpenCode, runUpgrade, t]);

  return null;
};
