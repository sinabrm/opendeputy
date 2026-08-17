import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  resolveOpenBrowserUseBinary,
  spawnOpenBrowserUse,
} from './agent-kit/servers/open-browser-use-launcher.mjs';

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
