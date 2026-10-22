// Separate identity and every Tauri directory, including WebView data. Never deletes profiles.
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  symlinkSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const root = path.resolve(import.meta.dirname, '..');
const profile = mkdtempSync(path.join(os.tmpdir(), 'TaskLens-acceptance-'));
const base = JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.conf.json')));
const identifier = `app.tasklens.acceptance.${Date.now()}`;
const config = path.join(profile, 'tauri.acceptance.json');
writeFileSync(
  config,
  JSON.stringify({
    identifier,
    app: {
      appDirectoriesOverride: path.join(profile, 'app'),
      windows: base.app.windows.map((w) => ({
        ...w,
        dataDirectory: path.join(profile, 'webview'),
      })),
    },
  }),
);
writeFileSync(path.join(profile, '.tasklens-test-profile'), identifier);
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'),
    'build',
    '--debug',
    '--no-bundle',
    '--config',
    config,
  ],
  { cwd: root, stdio: 'inherit' },
);
if (result.status !== 0) process.exit(result.status ?? 1);
const built = path.join(root, 'src-tauri/target/debug');
const stage = path.join(profile, 'bin');
mkdirSync(stage);
const name = `tasklens${process.platform === 'win32' ? '.exe' : ''}`;
for (const file of readdirSync(built)) {
  if (
    file === name ||
    (file.startsWith('tasklens-') && (process.platform !== 'win32' || file.endsWith('.exe')))
  ) {
    const source = path.join(built, file);
    try {
      copyFileSync(source, path.join(stage, file));
    } catch (error) {
      if (error.code !== 'EISDIR') throw error;
    }
  }
}
symlinkSync(
  path.join(built, 'resources'),
  path.join(stage, 'resources'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
const executable = path.join(stage, name);
const receipt = {
  identifier,
  profile,
  executable,
  promptVersion: Number(
    readFileSync(
      path.join(root, 'src/services/extraction/prompts/extraction-prompt-version.ts'),
      'utf8',
    ).match(/VERSION = (\d+)/)?.[1],
  ),
  manifestSha256: createHash('sha256')
    .update(readFileSync(path.join(root, 'src-tauri/resources/models.json')))
    .digest('hex'),
  sha256: createHash('sha256').update(readFileSync(executable)).digest('hex'),
};
const report = path.join(profile, 'acceptance-run.json');
writeFileSync(report, JSON.stringify(receipt, null, 2));
console.info(`Acceptance receipt: ${report}`);
