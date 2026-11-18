'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const sharpPackagePath = path.join(root, 'node_modules', 'sharp', 'package.json');
const tscPath = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const sharpPackage = JSON.parse(fs.readFileSync(sharpPackagePath, 'utf8'));

if (sharpPackage.version !== '0.35.5') {
  throw new Error('O teste exige sharp 0.35.5; encontrado: ' + sharpPackage.version);
}
if (!fs.existsSync(tscPath)) {
  throw new Error('TypeScript local não encontrado em node_modules.');
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-0355-types-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir');
const config = {
  compilerOptions: {
    target: 'ES2022',
    module: 'CommonJS',
    moduleResolution: 'Node',
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    types: ['node'],
    typeRoots: [path.join(root, 'node_modules', '@types')]
  }
};

function compile(source, name) {
  const file = path.join(temp, name + '.ts');
  const tsconfig = path.join(temp, name + '.tsconfig.json');
  fs.writeFileSync(file, source);
  fs.writeFileSync(tsconfig, JSON.stringify({ ...config, files: [file] }, null, 2) + '\n');
  return spawnSync(process.execPath, [tscPath, '--project', tsconfig, '--pretty', 'false'], {
    cwd: root,
    encoding: 'utf8'
  });
}

try {
  const named = compile([
    "import sharp from 'sharp';",
    "import type { OverlayOptions } from 'sharp';",
    'declare const options: OverlayOptions;',
    'const image = sharp();',
    'void [options, image];'
  ].join('\n'), 'named-entrypoint');

  if (named.status !== 0) {
    throw new Error('OverlayOptions como import nomeado deveria compilar:\n' + named.stdout + named.stderr);
  }

  const legacy = compile([
    "import sharp from 'sharp';",
    'type LegacyOverlayOptions = sharp.OverlayOptions;',
    'declare const options: LegacyOverlayOptions;',
    'void options;'
  ].join('\n'), 'legacy-namespace');

  const legacyOutput = (legacy.stdout || '') + (legacy.stderr || '');
  if (legacy.status === 0 || !legacyOutput.includes('TS2503')) {
    throw new Error('Esperava TS2503 para a namespace antiga sharp.OverlayOptions; diagnóstico:\n' + legacyOutput);
  }

  process.stdout.write(JSON.stringify({
    package: 'sharp',
    version: sharpPackage.version,
    namedOverlayOptionsImport: 'pass',
    legacyNamespace: 'not-exported',
    expectedDiagnostic: 'TS2503'
  }, null, 2) + '\n');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
