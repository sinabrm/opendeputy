import { beforeEach, describe, expect, test } from 'bun:test';
import { CONTEXT_SURFACES } from '@/lib/surfaces/registry';
import { useUIStore } from '@/stores/useUIStore';
import { PANEL_MODES, runPanelControlAction } from './control';

const directory = '/repo';

type PanelResult = {
  isOpen: boolean;
  expanded: boolean;
  activeTabId: string | null;
  tabs: Array<{
    id: string;
    mode: string;
    targetPath: string | null;
    readOnly: boolean;
    active: boolean;
  }>;
};

const run = async (action: string, parameters: Record<string, unknown> = {}): Promise<PanelResult> => {
  return await runPanelControlAction(directory, action, parameters) as PanelResult;
};

beforeEach(() => {
  useUIStore.setState({
    contextPanelByDirectory: {},
    pendingFileNavigation: null,
    pendingFileFocusPath: null,
  });
});

describe('right-panel agent control', () => {
  test('covers every surface in the right-panel registry', () => {
    const publicRegistryModes = CONTEXT_SURFACES.map((surface) => {
      if (surface.mode === 'diff') return 'changes';
      if (surface.mode === 'file') return 'files';
      return surface.mode;
    }).sort();
    expect([...PANEL_MODES].sort()).toEqual(publicRegistryModes);
  });

  test('opens every registered right-panel surface with the public mode name', async () => {
    for (const panelMode of PANEL_MODES) {
      const parameters = panelMode === 'chat' ? { panelMode, sessionId: 'ses_1' } : { panelMode };
      const result = await run('panel.open', parameters);
      expect(result.isOpen).toBe(true);
      expect(result.tabs.find((tab) => tab.active)?.mode).toBe(panelMode);
    }
  });

  test('opens exact Files and Changes targets without desktop input', async () => {
    let result = await run('panel.open', {
      panelMode: 'files',
      filePath: '/repo/src/app.ts',
      line: 12,
      column: 4,
    });
    expect(result.tabs.find((tab) => tab.active)?.targetPath).toBe('/repo/src/app.ts');
    expect(useUIStore.getState().pendingFileNavigation).toEqual({
      path: '/repo/src/app.ts',
      line: 12,
      column: 4,
    });

    result = await run('panel.open', {
      panelMode: 'changes',
      filePath: '/repo/src/app.ts',
      diffScope: 'staged',
    });
    const changesTab = result.tabs.find((tab) => tab.active);
    expect(changesTab?.mode).toBe('changes');
    expect(changesTab?.targetPath).toBe('/repo/src/app.ts');
  });

  test('lists, activates, and closes one exact tab while leaving OpenDeputy itself untouched', async () => {
    await run('panel.open', { panelMode: 'browser' });
    await run('panel.newBrowserTab');
    let result = await run('panel.list');
    const browserTabs = result.tabs.filter((tab) => tab.mode === 'browser');
    expect(browserTabs).toHaveLength(2);

    result = await run('panel.activate', { tabId: browserTabs[0]?.id });
    expect(result.activeTabId).toBe(browserTabs[0]?.id);

    result = await run('panel.closeTab', { tabId: browserTabs[0]?.id });
    expect(result.tabs.filter((tab) => tab.mode === 'browser')).toHaveLength(1);
    expect(result.tabs.some((tab) => tab.id === browserTabs[0]?.id)).toBe(false);
  });

  test('opens a split Chat session and reports its read-only state', async () => {
    const result = await run('panel.open', {
      panelMode: 'chat',
      sessionId: 'ses_target',
      readOnly: true,
    });
    const chatTab = result.tabs.find((tab) => tab.active);
    expect(chatTab?.mode).toBe('chat');
    expect(chatTab?.readOnly).toBe(true);
  });

  test('sets expanded state explicitly and closes only the panel', async () => {
    await run('panel.open', { panelMode: 'terminal' });
    let result = await run('panel.setExpanded', { expanded: true });
    expect(result.expanded).toBe(true);

    result = await run('panel.close');
    expect(result.isOpen).toBe(false);
    expect(result.tabs).toHaveLength(1);
  });

  test('refuses unknown tab IDs and Chat without a session or existing tab', async () => {
    await expect(run('panel.closeTab', { tabId: 'browser:missing' })).rejects.toThrow('not found');
    await expect(run('panel.open', { panelMode: 'chat' })).rejects.toThrow('sessionId');
  });
});
