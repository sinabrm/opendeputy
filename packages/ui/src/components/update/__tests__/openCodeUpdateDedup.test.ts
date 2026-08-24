import { describe, test, expect } from 'bun:test';

import {
    resolveOpenCodeUpdateVersion,
    resolveOpenCodeUpgradeStatusVersion,
    resolveOpenCodeUpdateAction,
    shouldShowPwaInstallToast,
} from '../openCodeUpdateDedup';

describe('shouldShowPwaInstallToast', () => {
    test('returns true when nothing blocks the toast', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: null,
                sessionShown: null,
                hasActiveToast: false,
            }),
        ).toBe(true);
    });

    test('returns false when persistent dismissal is set', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: 'true',
                sessionShown: null,
                hasActiveToast: false,
            }),
        ).toBe(false);
    });

    test('returns false when the toast was already shown in this session', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: null,
                sessionShown: 'true',
                hasActiveToast: false,
            }),
        ).toBe(false);
    });

    test('returns false when the effect already owns an active toast', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: null,
                sessionShown: null,
                hasActiveToast: true,
            }),
        ).toBe(false);
    });

    test('treats non-"true" storage values as unset', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: 'false',
                sessionShown: '0',
                hasActiveToast: false,
            }),
        ).toBe(true);
    });

    test('persistent dismissal wins even when session marker is also set', () => {
        expect(
            shouldShowPwaInstallToast({
                dismissed: 'true',
                sessionShown: 'true',
                hasActiveToast: false,
            }),
        ).toBe(false);
    });
});

describe('resolveOpenCodeUpdateAction', () => {
    test('prompts for a fresh version when automatic updates are off', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '1.16.0',
                autoUpdate: false,
                dismissedVersion: null,
                seenVersions: new Set(),
            }),
        ).toBe('prompt');
    });

    test('upgrades without prompting when automatic updates are on', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '1.16.0',
                autoUpdate: true,
                dismissedVersion: null,
                seenVersions: new Set(),
            }),
        ).toBe('upgrade');
    });

    test('automatic updates ignore a prior dismissal of the same version', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '1.16.0',
                autoUpdate: true,
                dismissedVersion: '1.16.0',
                seenVersions: new Set(),
            }),
        ).toBe('upgrade');
    });

    test('does nothing for an empty version string', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '',
                autoUpdate: true,
                dismissedVersion: null,
                seenVersions: new Set(),
            }),
        ).toBe('none');
    });

    test('does nothing when the version was already handled in this session', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '1.16.0',
                autoUpdate: true,
                dismissedVersion: null,
                seenVersions: new Set(['1.16.0']),
            }),
        ).toBe('none');
    });

    test('does nothing when a manual update prompt was dismissed for this version', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '1.16.0',
                autoUpdate: false,
                dismissedVersion: '1.16.0',
                seenVersions: new Set(),
            }),
        ).toBe('none');
    });

    test('prompts when a different version was previously dismissed', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '1.17.0',
                autoUpdate: false,
                dismissedVersion: '1.16.0',
                seenVersions: new Set(),
            }),
        ).toBe('prompt');
    });

    test('treats null dismissedVersion as no prior dismissal', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '1.16.0',
                autoUpdate: false,
                dismissedVersion: null,
                seenVersions: new Set(['1.15.0']),
            }),
        ).toBe('prompt');
    });

    test('seen set blocks even when dismissed version differs', () => {
        expect(
            resolveOpenCodeUpdateAction({
                version: '1.16.0',
                autoUpdate: false,
                dismissedVersion: '1.15.0',
                seenVersions: new Set(['1.16.0']),
            }),
        ).toBe('none');
    });
});

describe('resolveOpenCodeUpdateVersion', () => {
    test('returns the trimmed version when detail.version is a string', () => {
        expect(resolveOpenCodeUpdateVersion({ version: '1.16.0' })).toBe('1.16.0');
    });

    test('trims surrounding whitespace from a string version', () => {
        expect(resolveOpenCodeUpdateVersion({ version: '  1.16.0  ' })).toBe('1.16.0');
    });

    test('returns empty string when detail is null', () => {
        expect(resolveOpenCodeUpdateVersion(null)).toBe('');
    });

    test('returns empty string when detail is undefined', () => {
        expect(resolveOpenCodeUpdateVersion(undefined)).toBe('');
    });

    test('returns empty string when detail is not an object', () => {
        expect(resolveOpenCodeUpdateVersion('1.16.0')).toBe('');
        expect(resolveOpenCodeUpdateVersion(42)).toBe('');
        expect(resolveOpenCodeUpdateVersion(true)).toBe('');
    });

    test('returns empty string when the version field is missing', () => {
        expect(resolveOpenCodeUpdateVersion({})).toBe('');
    });

    test('returns empty string when the version field is non-string', () => {
        expect(resolveOpenCodeUpdateVersion({ version: 116 })).toBe('');
        expect(resolveOpenCodeUpdateVersion({ version: null })).toBe('');
        expect(resolveOpenCodeUpdateVersion({ version: { major: 1 } })).toBe('');
    });
});

describe('resolveOpenCodeUpgradeStatusVersion', () => {
    test('returns the trimmed latestVersion when available is true', () => {
        expect(
            resolveOpenCodeUpgradeStatusVersion({
                available: true,
                latestVersion: '1.16.0',
                upgrade: { supported: true },
            }),
        ).toBe('1.16.0');
    });

    test('trims surrounding whitespace from latestVersion', () => {
        expect(
            resolveOpenCodeUpgradeStatusVersion({
                available: true,
                latestVersion: '  1.16.0  ',
                upgrade: { supported: true },
            }),
        ).toBe('1.16.0');
    });

    test('returns empty string when status is null', () => {
        expect(resolveOpenCodeUpgradeStatusVersion(null)).toBe('');
    });

    test('returns empty string when status is undefined', () => {
        expect(resolveOpenCodeUpgradeStatusVersion(undefined)).toBe('');
    });

    test('returns empty string when available is false', () => {
        expect(
            resolveOpenCodeUpgradeStatusVersion({
                available: false,
                latestVersion: '1.16.0',
            }),
        ).toBe('');
    });

    test('fails closed when the server does not explicitly support upgrades', () => {
        expect(
            resolveOpenCodeUpgradeStatusVersion({
                available: true,
                latestVersion: '1.16.0',
            }),
        ).toBe('');
        expect(
            resolveOpenCodeUpgradeStatusVersion({
                available: true,
                latestVersion: '1.16.0',
                upgrade: { supported: false },
            }),
        ).toBe('');
    });

    test('returns empty string when available is missing or null', () => {
        expect(
            resolveOpenCodeUpgradeStatusVersion({
                latestVersion: '1.16.0',
            }),
        ).toBe('');
        expect(
            resolveOpenCodeUpgradeStatusVersion({
                available: null,
                latestVersion: '1.16.0',
            }),
        ).toBe('');
    });

    test('returns empty string when latestVersion is missing', () => {
        expect(resolveOpenCodeUpgradeStatusVersion({ available: true })).toBe('');
    });

    test('returns empty string when latestVersion is non-string', () => {
        expect(
            resolveOpenCodeUpgradeStatusVersion({
                available: true,
                latestVersion: null,
            }),
        ).toBe('');
    });
});
