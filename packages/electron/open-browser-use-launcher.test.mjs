import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  resolveOpenBrowserUseBinary,
  spawnOpenBrowserUse,
} from './agent-kit/servers/open-browser-use-launcher.mjs';

test('routes ordinary browser requests to the in-app panel before real Chrome', () => {
  const skill = fs.readFileSync(
    path.resolve('agent-kit', 'skills', 'computer-control', 'SKILL.md'),
    'utf8',
  );
  const inAppRule = skill.indexOf('Treat an unqualified request');
  const externalBrowserRule = skill.indexOf('explicitly asks for an external/system/desktop browser');

  assert.ok(inAppRule >= 0);
  assert.ok(externalBrowserRule > inAppRule);
  assert.match(skill, /Manage it with `opendeputy_panel`/);
  assert.match(skill, /`opendeputy_web` with `browser\.open`/);
  assert.match(skill, /creates or reuses and focuses the Browser tab in the right context panel/);
});

test('keeps every OpenDeputy right-panel action inside the app state boundary', () => {
  const skill = fs.readFileSync(
    path.resolve('agent-kit', 'skills', 'computer-control', 'SKILL.md'),
    'utf8',
  );

  for (const surface of ['Context', 'Git', 'PR', 'Changes', 'Walkthrough', 'Files', 'Terminal', 'Notes', 'Plan', 'Browser', 'Chat']) {
    assert.match(skill, new RegExp(`\\b${surface}\\b`));
  }
  assert.match(skill, /`panel\.list` first/);
  assert.match(skill, /`panel\.closeTab`/);
  assert.match(skill, /Never use desktop mouse\/keyboard control/);
  assert.match(skill, /`Ctrl\+W`/);
  assert.match(skill, /close the whole application/);
  assert.match(skill, /Do the work through the surface's native data path/);
  assert.match(skill, /Use an external application when the user explicitly names one/);
  assert.match(skill, /Do not silently replace a supported internal surface/);
});

test('spawns the native Windows Open Browser Use binary with its console hidden', () => {
  const root = path.resolve('agent-kit-fixture');
  const args = ['mcp', '--session-id', 'opendeputy-test'];
  const environment = { OPENDEPUTY_TEST: '1' };
  const expectedChild = { pid: 42 };
  let observed;

  const child = spawnOpenBrowserUse({
    root,
    args,
    platform: 'win32',
    architecture: 'x64',
    environment,
    binaryExists: () => true,
    spawnProcess: (program, childArgs, options) => {
      observed = { program, childArgs, options };
      return expectedChild;
    },
  });

  assert.equal(child, expectedChild);
  assert.deepEqual(observed, {
    program: path.join(
      root,
      'node_modules',
      'open-browser-use',
      'native',
      'windows-amd64',
      'open-browser-use.exe',
    ),
    childArgs: args,
    options: {
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    },
  });
});

test('rejects unsupported platforms before spawning', () => {
  assert.throws(
    () => resolveOpenBrowserUseBinary({
      root: path.resolve('agent-kit-fixture'),
      platform: 'freebsd',
      architecture: 'x64',
    }),
    /does not ship a binary for freebsd\/x64/,
  );
});

test('reports a missing native binary before spawning', () => {
  assert.throws(
    () => resolveOpenBrowserUseBinary({
      root: path.resolve('agent-kit-fixture'),
      platform: 'win32',
      architecture: 'x64',
      binaryExists: () => false,
    }),
    /open-browser-use binary is missing for win32\/x64/,
  );
});
