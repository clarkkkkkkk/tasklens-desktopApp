import { splitArtifact } from './release-parts.mjs';
import { assertReleaseEnvironment } from './release-policy.mjs';
import { loadEnv } from 'vite';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  copyFileSync,
  cpSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { root, manifest, targetTriple, sidecar, hash } from './ai-assets.mjs';
assertReleaseEnvironment({ ...loadEnv('production', root, 'VITE_'), ...process.env });
const releaseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
  throw new Error(
    'Release packaging requires a clean committed worktree. Preserve unfinished work separately.',
  );
const version = JSON.parse(readFileSync(path.join(root, 'package.json'))).version;
if (
  JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.conf.json'))).version !== version ||
  !new RegExp('^version = "' + version.replaceAll('.', '\\.') + '"$', 'm').test(
    readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'),
  )
)
  throw new Error('Frontend, Tauri and Cargo release versions must match.');
const buildStarted = Date.now();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
if (process.env.VITE_TASKLENS_EXTRACTION === 'mock')
  throw new Error('Release builds cannot use mock extraction');
for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  if (
    existsSync(path.join(root, file)) &&
    /^\s*VITE_TASKLENS_EXTRACTION\s*=\s*['"]?mock\b/m.test(
      readFileSync(path.join(root, file), 'utf8'),
    )
  )
    throw new Error(`Mock configuration in ${file}`);
}
if (!process.argv.includes('--prepared')) {
  run(npm, ['run', 'prepare:models']);
  run(npm, ['run', 'build:runtimes']);
  run(npm, ['run', 'prepare:notices']);
}
run(npm, ['run', 'verify:assets']);
run(npm, ['run', 'prepare:packaging']);
const target = targetTriple();
if (process.platform === 'win32') {
  // Tauri's normal NSIS payload exceeds its size limit. Stage the same resource layout for Inno.
  run(npm, ['run', 'tauri', '--', 'build', '--no-bundle']);
  const stage = path.join(root, 'src-tauri/target/release/offline-stage');
  mkdirSync(stage, { recursive: true });
  copyFileSync(
    path.join(root, 'src-tauri/target/release/tasklens.exe'),
    path.join(stage, 'tasklens.exe'),
  );
  for (const name of [
    'llama-server',
    'whisper-cli',
    'tesseract',
    'llama-server-avx2',
    'whisper-cli-avx2',
  ])
    copyFileSync(
      path.join(root, 'src-tauri/binaries', sidecar(name)),
      path.join(stage, `tasklens-${name}.exe`),
    );
  for (const dir of ['models', 'tessdata', 'notices'])
    cpSync(path.join(root, 'src-tauri/resources', dir), path.join(stage, 'resources', dir), {
      recursive: true,
    });
  copyFileSync(
    path.join(root, 'src-tauri/resources/models.json'),
    path.join(stage, 'resources/models.json'),
  );
  copyFileSync(
    path.join(root, 'THIRD_PARTY_NOTICES.md'),
    path.join(stage, 'resources/notices/THIRD_PARTY_NOTICES.md'),
  );
  const webview = process.env.TASKLENS_WEBVIEW2_INSTALLER;
  if (
    !webview ||
    !process.env.TASKLENS_WEBVIEW2_SHA256 ||
    (await hash(webview)) !== process.env.TASKLENS_WEBVIEW2_SHA256
  )
    throw new Error('Provide verified offline x64 WebView2 installer and TASKLENS_WEBVIEW2_SHA256');
  copyFileSync(webview, path.join(stage, 'WebView2Setup.exe'));
  run(process.env.TASKLENS_ISCC || 'ISCC.exe', [
    `/DStage=${stage}`,
    `/DAppVersion=${JSON.parse(readFileSync(path.join(root, 'package.json'))).version}`,
    path.join(root, 'scripts/windows-offline.iss'),
  ]);
} else {
  run(npm, [
    'run',
    'tauri',
    '--',
    'build',
    '--bundles',
    process.platform === 'linux' ? 'rpm,appimage' : 'app,dmg',
  ]);
}
const bundle = path.join(root, 'src-tauri/target/release/bundle');
const files = [];
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!name.endsWith('.app') && !name.endsWith('.AppDir')) walk(p);
    } else if (/\.(rpm|AppImage|dmg|exe|msi|deb|zip)$/.test(name)) files.push(p);
  }
}
walk(bundle);
const report = {
  target,
  commit: releaseCommit,
  version,
  manifestVersion: manifest.manifestVersion,
  modelsBytes: manifest.extraction.bytes + manifest.whisper.bytes,
  artifacts: [],
};
for (const file of files.filter((file) => statSync(file).mtimeMs >= buildStarted)) {
  const distribution =
    statSync(file).size >= 2 ** 31
      ? await splitArtifact(file, path.join(bundle, 'distribution', path.basename(file)))
      : null;
  report.artifacts.push({
    file: path.relative(root, file),
    bytes: statSync(file).size,
    sha256: await hash(file),
    githubReleaseEligible: statSync(file).size < 2 ** 31,
    partsManifest: distribution ? path.relative(bundle, distribution.manifestFile) : null,
  });
}
if (!report.artifacts.length) throw new Error('No fresh installer artifacts were produced.');
if (
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !==
    releaseCommit ||
  execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
)
  throw new Error('Source changed during packaging; discard these release candidates.');
writeFileSync(
  path.join(bundle, 'SHA256SUMS'),
  report.artifacts.map((a) => `${a.sha256}  ${path.basename(a.file)}\n`).join(''),
);
writeFileSync(path.join(bundle, 'release-assets.json'), JSON.stringify(report, null, 2) + '\n');
console.info(report);
