import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import { SortableTabsStrip } from './sortable-tabs-strip';

describe('SortableTabsStrip active close control', () => {
  test('keeps the active tab close control visible and leaves inactive ones hover-only', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <SortableTabsStrip
          items={[
            { id: 'active', label: 'Active', icon: <span>A</span>, closeLabel: 'Close Active tab' },
            { id: 'inactive', label: 'Inactive', icon: <span>I</span>, closeLabel: 'Close Inactive tab' },
          ]}
          activeId="active"
          onSelect={() => undefined}
          onClose={() => undefined}
          showActiveCloseControl
        />
      </I18nProvider>,
    );

    const activeCloseIndex = html.indexOf('aria-label="Close Active tab"');
    const inactiveCloseIndex = html.indexOf('aria-label="Close Inactive tab"');
    expect(activeCloseIndex).toBeGreaterThan(0);
    expect(inactiveCloseIndex).toBeGreaterThan(0);
    expect(html.slice(activeCloseIndex - 350, activeCloseIndex)).toContain('opacity-100');
    expect(html.slice(inactiveCloseIndex - 350, inactiveCloseIndex)).toContain('opacity-0 group-hover:opacity-100');
  });
});
