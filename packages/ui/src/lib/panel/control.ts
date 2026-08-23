import {
  normalizeContextPanelDirectoryKey,
  useUIStore,
  type ContextPanelMode,
  type PendingDiffScope,
} from '@/stores/useUIStore';

export const PANEL_MODES = [
  'context',
  'git',
  'pr',
  'changes',
  'walkthrough',
  'files',
  'terminal',
  'notes',
  'plan',
  'browser',
  'chat',
] as const;

export type PanelMode = typeof PANEL_MODES[number];

const MODE_TO_INTERNAL: Record<PanelMode, ContextPanelMode> = {
  context: 'context',
  git: 'git',
  pr: 'pr',
  changes: 'diff',
  walkthrough: 'walkthrough',
  files: 'file',
  terminal: 'terminal',
  notes: 'notes',
  plan: 'plan',
  browser: 'browser',
  chat: 'chat',
};

const INTERNAL_TO_MODE = Object.fromEntries(
  Object.entries(MODE_TO_INTERNAL).map(([mode, internal]) => [internal, mode]),
) as Record<ContextPanelMode, PanelMode>;

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const positiveInteger = (value: unknown, fallback: number): number => {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
};

const getPanelMode = (value: unknown): PanelMode => {
  if (typeof value === 'string' && (PANEL_MODES as readonly string[]).includes(value)) {
    return value as PanelMode;
  }
  throw new Error(`panelMode must be one of: ${PANEL_MODES.join(', ')}`);
};

const getPanelState = (directory: string) => {
  const state = useUIStore.getState().contextPanelByDirectory[directory];
  const activeTabID = state?.activeTabId ?? null;
  return {
    directory,
    isOpen: Boolean(state?.isOpen),
    expanded: Boolean(state?.expanded),
    activeTabId: activeTabID,
    tabs: (state?.tabs ?? []).map((tab) => ({
      id: tab.id,
      mode: INTERNAL_TO_MODE[tab.mode],
      targetPath: tab.targetPath,
      label: tab.label,
      readOnly: tab.readOnly,
      diffScope: tab.mode === 'diff' ? tab.diffScope : null,
      active: tab.id === activeTabID,
    })),
  };
};

const revealMostRecentOrCreate = (directory: string, mode: ContextPanelMode): void => {
  const state = useUIStore.getState();
  const tabs = state.contextPanelByDirectory[directory]?.tabs.filter((tab) => tab.mode === mode) ?? [];
  if (tabs.length > 0) {
    const mostRecent = tabs.reduce((best, tab) => (tab.touchedAt >= best.touchedAt ? tab : best));
    state.setActiveContextPanelTab(directory, mostRecent.id);
    return;
  }
  if (mode === 'chat') {
    throw new Error('No Chat tab exists yet; pass sessionId to open one');
  }
  state.openContextPanelTab(directory, { mode });
};

const openPanelMode = (directory: string, parameters: Record<string, unknown>): void => {
  const mode = getPanelMode(parameters.panelMode);
  const internalMode = MODE_TO_INTERNAL[mode];
  const state = useUIStore.getState();
  const filePath = asNonEmptyString(parameters.filePath);

  if (mode === 'files' && filePath) {
    if (parameters.line !== undefined || parameters.column !== undefined) {
      state.openContextFileAtLine(
        directory,
        filePath,
        positiveInteger(parameters.line, 1),
        positiveInteger(parameters.column, 1),
      );
    } else {
      state.openContextFile(directory, filePath);
    }
    return;
  }

  if (mode === 'changes' && filePath) {
    const diffScope = parameters.diffScope as PendingDiffScope | undefined;
    state.openContextDiff(directory, filePath, parameters.staged === true, diffScope ?? null);
    return;
  }

  if (mode === 'browser') {
    state.openContextBrowser(directory);
    return;
  }

  if (mode === 'chat') {
    const sessionID = asNonEmptyString(parameters.sessionId);
    if (!sessionID) {
      revealMostRecentOrCreate(directory, internalMode);
      return;
    }
    state.openContextPanelTab(directory, {
      mode: 'chat',
      dedupeKey: `session:${sessionID}`,
      readOnly: parameters.readOnly === true,
    });
    return;
  }

  revealMostRecentOrCreate(directory, internalMode);
};

/**
 * Executes an agent request through the same state-owner actions used by the
 * right-panel UI. It never synthesizes desktop input, so closing a panel tab
 * cannot become Ctrl+W against the OpenDeputy application window.
 */
export const runPanelControlAction = async (
  directoryValue: string,
  action: string,
  parameters: Record<string, unknown>,
): Promise<unknown> => {
  const directory = normalizeContextPanelDirectoryKey(directoryValue.trim());
  if (!directory) throw new Error('directory is required');

  const state = useUIStore.getState();

  if (action === 'panel.list') return getPanelState(directory);

  if (action === 'panel.open') {
    openPanelMode(directory, parameters);
  } else if (action === 'panel.newBrowserTab') {
    state.openNewContextBrowserTab(directory);
  } else if (action === 'panel.activate') {
    const tabID = asNonEmptyString(parameters.tabId);
    if (!tabID) throw new Error('tabId is required for panel.activate');
    const exists = state.contextPanelByDirectory[directory]?.tabs.some((tab) => tab.id === tabID);
    if (!exists) throw new Error(`Right-panel tab not found: ${tabID}`);
    state.setActiveContextPanelTab(directory, tabID);
  } else if (action === 'panel.closeTab') {
    const tabID = asNonEmptyString(parameters.tabId);
    if (!tabID) throw new Error('tabId is required for panel.closeTab');
    const exists = state.contextPanelByDirectory[directory]?.tabs.some((tab) => tab.id === tabID);
    if (!exists) throw new Error(`Right-panel tab not found: ${tabID}`);
    state.closeContextPanelTab(directory, tabID);
  } else if (action === 'panel.close') {
    state.closeContextPanel(directory);
  } else if (action === 'panel.setExpanded') {
    if (typeof parameters.expanded !== 'boolean') {
      throw new Error('expanded is required for panel.setExpanded');
    }
    state.setContextPanelExpanded(directory, parameters.expanded);
  } else {
    throw new Error(`Unsupported right-panel action: ${action || 'missing'}`);
  }

  return getPanelState(directory);
};
