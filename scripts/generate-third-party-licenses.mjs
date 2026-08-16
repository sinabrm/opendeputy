import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policyPath = path.join(repositoryRoot, 'scripts', 'third-party-license-policy.json');

const targetConfigs = {
  'windows-x64': {
    platform: 'win32',
    architecture: 'x64',
    defaultOutput: 'THIRD_PARTY_LICENSES.txt',
    scopes: [
      { label: 'root application runtime', manifest: 'package.json' },
      { label: 'web server and browser application', manifest: 'packages/web/package.json' },
      { label: 'shared browser UI', manifest: 'packages/ui/package.json' },
      { label: 'Electron desktop shell', manifest: 'packages/electron/package.json' },
    ],
    includeElectronRuntime: true,
  },
  'docker-linux-x64': {
    platform: 'linux',
    architecture: 'x64',
    defaultOutput: 'THIRD_PARTY_LICENSES.docker-linux-x64.txt',
    scopes: [
      { label: 'root application runtime', manifest: 'package.json' },
      { label: 'web server and browser application', manifest: 'packages/web/package.json' },
      { label: 'compiled shared browser UI', manifest: 'packages/ui/package.json' },
    ],
    includeElectronRuntime: false,
  },
};

const cli = { check: false, target: null, output: null };
const rawArguments = process.argv.slice(2);
for (let index = 0; index < rawArguments.length; index += 1) {
  const argument = rawArguments[index];
  if (argument === '--check') {
    cli.check = true;
  } else if (argument.startsWith('--target=')) {
    cli.target = argument.slice('--target='.length);
  } else if (argument === '--target') {
    cli.target = rawArguments[index += 1] || null;
  } else if (argument.startsWith('--output=')) {
    cli.output = argument.slice('--output='.length);
  } else if (argument === '--output') {
    cli.output = rawArguments[index += 1] || null;
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

if (!cli.target || !targetConfigs[cli.target]) {
  throw new Error(`A supported explicit target is required: ${Object.keys(targetConfigs).join(', ')}`);
}
const targetConfig = targetConfigs[cli.target];
if (process.platform !== targetConfig.platform || process.arch !== targetConfig.architecture) {
  throw new Error(
    `Target ${cli.target} must be generated on ${targetConfig.platform}/${targetConfig.architecture}; current host is ${process.platform}/${process.arch}.`,
  );
}

const requestedOutput = cli.output || targetConfig.defaultOutput;
const reportPath = path.resolve(repositoryRoot, requestedOutput);
const reportRelativePath = path.relative(repositoryRoot, reportPath);
if (!reportRelativePath || reportRelativePath.startsWith('..') || path.isAbsolute(reportRelativePath)) {
  throw new Error(`Report output must be a file inside the repository: ${requestedOutput}`);
}

const shippedScopes = targetConfig.scopes;

// These packages are declared as development dependencies because they are
// consumed by the build, but their code/runtime is shipped in the selected
// artifact. Electron's npm dependencies are download/build helpers rather than
// packaged application code, so only Electron itself is retained for Windows.
const bundledBuildDependencies = [
  {
    label: 'compiled browser application assets',
    name: '@remixicon/react',
    resolveFrom: 'packages/ui',
    recurse: true,
  },
  {
    label: 'compiled browser application assets',
    name: 'workbox-window',
    resolveFrom: 'packages/web',
    recurse: true,
  },
];
if (targetConfig.includeElectronRuntime) {
  bundledBuildDependencies.unshift({
    label: 'bundled Electron runtime',
    name: 'electron',
    resolveFrom: 'packages/electron',
    recurse: false,
  });
}

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const normalizeText = (value) => String(value)
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t]+$/gm, '')
  .trimEnd();

const readJson = (absolutePath) => JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
const policy = readJson(policyPath);

const packageDirectoryParts = (name) => name.split('/');

const resolveInstalledPackage = (name, fromDirectory) => {
  let current = path.resolve(fromDirectory);

  while (true) {
    const manifestPath = path.join(current, 'node_modules', ...packageDirectoryParts(name), 'package.json');
    if (fs.existsSync(manifestPath)) {
      const realManifestPath = fs.realpathSync(manifestPath);
      return {
        directory: path.dirname(realManifestPath),
        manifestPath: realManifestPath,
      };
    }
    if (current === repositoryRoot) return null;
    const relativeToRepository = path.relative(repositoryRoot, current);
    if (relativeToRepository.startsWith('..') || path.isAbsolute(relativeToRepository)) return null;
    current = path.dirname(current);
  }
};

const normalizeLicense = (value) => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const values = value.map(normalizeLicense).filter((entry) => entry !== '(not declared)');
    return values.length > 0 ? values.join(' OR ') : '(not declared)';
  }
  if (value && typeof value === 'object') return normalizeLicense(value.type);
  return '(not declared)';
};

const normalizeRepository = (manifest) => {
  let value = typeof manifest.repository === 'string'
    ? manifest.repository
    : manifest.repository?.url;
  if (!value && typeof manifest.homepage === 'string') value = manifest.homepage;
  if (typeof value !== 'string' || !value.trim()) return '(not declared)';

  value = value.trim()
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git(?:#.*)?$/, '')
    .replace(/#.*$/, '');
  return value;
};

const isLicenseOrNoticeFile = (name) => {
  const normalized = name.toLowerCase();
  return normalized === 'copyright'
    || normalized.startsWith('license')
    || normalized.startsWith('licence')
    || normalized.startsWith('notice')
    || normalized.startsWith('copying');
};

const readRetainedTexts = (packageDirectory) => fs.readdirSync(packageDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && isLicenseOrNoticeFile(entry.name))
  .sort((left, right) => compareText(left.name.toLowerCase(), right.name.toLowerCase()))
  .map((entry) => {
    const content = normalizeText(fs.readFileSync(path.join(packageDirectory, entry.name), 'utf8'));
    return {
      file: entry.name,
      content,
      hash: crypto.createHash('sha256').update(content, 'utf8').digest('hex'),
    };
  });

const collectInventory = () => {
  const manifests = shippedScopes.map((scope) => {
    const manifestPath = path.join(repositoryRoot, scope.manifest);
    return { ...scope, manifestPath, package: readJson(manifestPath) };
  });
  const internalPackageNames = new Set(manifests.map((entry) => entry.package.name));
  const queue = [];

  for (const scope of manifests) {
    for (const name of Object.keys(scope.package.dependencies || {}).sort(compareText)) {
      if (!internalPackageNames.has(name)) {
        queue.push({ name, fromDirectory: path.dirname(scope.manifestPath), required: true, recurse: true, scope: scope.label });
      }
    }
  }
  for (const runtime of bundledBuildDependencies) {
    queue.push({
      name: runtime.name,
      fromDirectory: path.join(repositoryRoot, runtime.resolveFrom),
      required: true,
      recurse: runtime.recurse,
      scope: runtime.label,
    });
  }

  const packages = new Map();
  const traversed = new Set();

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const dependency = queue[queueIndex];
    const resolved = resolveInstalledPackage(dependency.name, dependency.fromDirectory);
    if (!resolved) {
      if (dependency.required) {
        throw new Error(`Installed package not found: ${dependency.name} (required by ${dependency.scope}). Run bun install first.`);
      }
      continue;
    }

    const manifest = readJson(resolved.manifestPath);
    const packageName = manifest.name || dependency.name;
    const packageVersion = manifest.version || '(unknown version)';
    const key = `${packageName}@${packageVersion}`;
    let record = packages.get(key);
    if (!record) {
      record = {
        key,
        name: packageName,
        version: packageVersion,
        license: normalizeLicense(manifest.license ?? manifest.licenses),
        repository: normalizeRepository(manifest),
        scopes: new Set(),
        texts: readRetainedTexts(resolved.directory),
      };
      packages.set(key, record);
    }
    record.scopes.add(dependency.scope);

    const traversalKey = `${resolved.manifestPath}\0${dependency.scope}\0${dependency.recurse}`;
    if (traversed.has(traversalKey) || !dependency.recurse) continue;
    traversed.add(traversalKey);

    const requiredDependencies = manifest.dependencies || {};
    for (const name of Object.keys(requiredDependencies).sort(compareText)) {
      if (!internalPackageNames.has(name)) {
        queue.push({ name, fromDirectory: resolved.directory, required: true, recurse: true, scope: dependency.scope });
      }
    }
    const optionalDependencies = manifest.optionalDependencies || {};
    for (const name of Object.keys(optionalDependencies).sort(compareText)) {
      if (!internalPackageNames.has(name)) {
        queue.push({ name, fromDirectory: resolved.directory, required: false, recurse: true, scope: dependency.scope });
      }
    }
  }

  return [...packages.values()].sort((left, right) => compareText(left.key, right.key));
};

const validateInventoryPolicy = (packages) => {
  if (policy.version !== 1) throw new Error(`Unsupported third-party license policy version: ${policy.version}`);

  const reviewedLicenseExpressions = new Set(policy.reviewedLicenseExpressions || []);
  const manualFiles = new Map();
  for (const record of policy.manualLicenseFiles || []) {
    if (!record.component || !record.path || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) {
      throw new Error('Invalid manualLicenseFiles record in third-party-license-policy.json.');
    }
    const absolutePath = path.resolve(repositoryRoot, record.path);
    const relativePath = path.relative(repositoryRoot, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.existsSync(absolutePath)) {
      throw new Error(`Manual third-party license is missing or outside the repository: ${record.path}`);
    }
    const content = normalizeText(fs.readFileSync(absolutePath, 'utf8'));
    const actualHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    if (actualHash !== record.sha256) {
      throw new Error(`Manual third-party license changed without policy review: ${record.path}`);
    }
    manualFiles.set(record.path, record);
  }

  const activeExceptions = new Map();
  for (const record of policy.reviewedMissingTexts || []) {
    const targets = record.targets || Object.keys(targetConfigs);
    if (!targets.includes(cli.target)) continue;
    if (!record.key || !record.license || !record.reason || activeExceptions.has(record.key)) {
      throw new Error(`Invalid or duplicate retained-text exception: ${record.key || '(missing key)'}`);
    }
    if (record.manualLicenseFile && !manualFiles.has(record.manualLicenseFile)) {
      throw new Error(`Exception ${record.key} references an unverified manual license: ${record.manualLicenseFile}`);
    }
    activeExceptions.set(record.key, record);
  }

  const reviews = new Map();
  const packageKeys = new Set(packages.map((entry) => entry.key));
  for (const dependency of packages) {
    if (dependency.license === '(not declared)') {
      throw new Error(`Dependency has no declared license: ${dependency.key}`);
    }
    if (!reviewedLicenseExpressions.has(dependency.license)) {
      throw new Error(`Dependency has an unreviewed license expression: ${dependency.key} (${dependency.license})`);
    }

    const exception = activeExceptions.get(dependency.key);
    if (dependency.texts.length === 0) {
      if (!exception) {
        throw new Error(`Dependency has no retained license/notice text and no reviewed exception: ${dependency.key}`);
      }
      if (exception.license !== dependency.license) {
        throw new Error(
          `Reviewed license mismatch for ${dependency.key}: expected ${exception.license}, found ${dependency.license}`,
        );
      }
      reviews.set(dependency.key, exception);
    } else if (exception) {
      throw new Error(`Stale retained-text exception now has package text: ${dependency.key}`);
    }
  }

  for (const key of activeExceptions.keys()) {
    if (!packageKeys.has(key)) throw new Error(`Stale retained-text exception is not in target ${cli.target}: ${key}`);
  }

  return reviews;
};

const renderReport = (packages, reviews) => {
  const retainedTexts = new Map();
  for (const dependency of packages) {
    for (const retained of dependency.texts) {
      let record = retainedTexts.get(retained.hash);
      if (!record) {
        record = { content: retained.content, references: [] };
        retainedTexts.set(retained.hash, record);
      }
      record.references.push(`${dependency.key}/${retained.file}`);
    }
  }

  const lines = [
    `OpenDeputy Third-Party Dependency License Inventory (${cli.target})`,
    '=================================================================',
    '',
    'This file is generated by scripts/generate-third-party-licenses.mjs.',
    'Do not edit it manually. Regenerate it with this script and the same target after dependency changes.',
    '',
    `Target: ${cli.target} (${targetConfig.platform}/${targetConfig.architecture})`,
    'Scope: installed production dependency graphs used by this target, plus',
    'dev-declared dependencies whose runtime code is compiled into the artifact.',
    'Other build/test-only dependencies are excluded. Optional dependencies are',
    'included only when installed for the declared target platform.',
    'Packages with omitted root license files require an exact reviewed exception',
    'in scripts/third-party-license-policy.json.',
    '',
    `Packages: ${packages.length}`,
    `Unique retained license/notice texts: ${retainedTexts.size}`,
    '',
    'DEPENDENCY INVENTORY',
    '====================',
    '',
  ];

  for (const dependency of packages) {
    lines.push(
      '--------------------------------------------------------------------------------',
      dependency.key,
      `License: ${dependency.license}`,
      `Repository: ${dependency.repository}`,
      `Included by: ${[...dependency.scopes].sort(compareText).join('; ')}`,
    );
    if (dependency.texts.length === 0) {
      lines.push('Retained files: (none found in the installed package root)');
      const review = reviews.get(dependency.key);
      lines.push(`Reviewed exception: ${review.reason}`);
      if (review.manualLicenseFile) lines.push(`Manual license: ${review.manualLicenseFile}`);
    } else {
      lines.push('Retained files:');
      for (const retained of dependency.texts) {
        lines.push(`  - ${retained.file} (SHA-256 ${retained.hash})`);
      }
    }
    lines.push('');
  }

  lines.push(
    '',
    'RETAINED LICENSE AND NOTICE TEXTS',
    '=================================',
    '',
  );

  for (const [hash, retained] of [...retainedTexts.entries()].sort(([left], [right]) => compareText(left, right))) {
    lines.push(
      '--------------------------------------------------------------------------------',
      `SHA-256: ${hash}`,
      'Used by:',
      ...retained.references.sort(compareText).map((reference) => `  - ${reference}`),
      '',
      retained.content,
      '',
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
};

const inventory = collectInventory();
const reviews = validateInventoryPolicy(inventory);
const report = renderReport(inventory, reviews);
if (cli.check) {
  if (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, 'utf8') !== report) {
    console.error(`${reportRelativePath} is missing or stale. Regenerate it for ${cli.target} and commit the result.`);
    process.exitCode = 1;
  } else {
    console.log('THIRD_PARTY_LICENSES.txt is current.');
  }
} else {
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Wrote ${reportRelativePath} for ${cli.target} with ${inventory.length} packages.`);
}
