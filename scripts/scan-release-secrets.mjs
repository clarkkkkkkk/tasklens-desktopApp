// Maintainer-only, redacted source scan. Includes ignored .env files without publishing them.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const root = path.resolve(import.meta.dirname, '..');
const scanner = path.resolve(
  process.argv[2] || path.join(root, '.local-ai/release-audit/tools/gitleaks'),
);
const temporary = mkdtempSync(path.join(os.tmpdir(), 'tasklens-source-scan-'));
const output = path.join(root, '.local-ai/release-audit');
mkdirSync(output, { recursive: true });
try {
  const files = new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  );
  for (const name of readdirSync(root)) if (/^\.env(?:\.|$)/.test(name)) files.add(name);
  for (const name of files) {
    const source = path.join(root, name);
    if (!lstatSync(source).isFile()) continue;
    const destination = path.join(temporary, name);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  const result = spawnSync(
    scanner,
    [
      'dir',
      '--redact=100',
      '--config',
      path.join(root, '.gitleaks.toml'),
      '--report-format',
      'json',
      '--report-path',
      path.join(output, 'source-secrets.json'),
      temporary,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
