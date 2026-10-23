import { assertReleaseEnvironment } from './release-policy.mjs';
import { auditWindowsBinary } from './pe-dependencies.mjs';
import { inventory, releaseNames } from './release-artifacts.mjs';
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
  rmSync,
  renameSync,
} from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';
import { root, targetTriple, sidecar, hash } from './ai-assets.mjs';
assertReleaseEnvironment({ ...loadEnv('production', root, 'VITE_'), ...process.env });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git('status', '--porcelain'))
  throw new Error(
    'Release packaging requires a clean committed worktree. Preserve and commit the candidate first.',
  );
const commit = git('rev-parse', 'HEAD');
const sourceTree = git('rev-parse', 'HEAD^{tree}');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'))).version;
const config = JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.conf.json')));
const rustVersion = readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8').match(
  /^version = "([^"]+)"/m,
)?.[1];
if (config.version !== version || rustVersion !== version)
  throw new Error('Frontend, Tauri and Cargo versions must match');
const names = releaseNames(version, process.platform, process.arch);
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Invoke this wrapper with npm run release:desktop');
const run = (cmd, args) =>
  execFileSync(cmd === npm ? process.execPath : cmd, cmd === npm ? [npm, ...args] : args, {
    cwd: root,
    stdio: 'inherit',
  });
if (!process.argv.includes('--prepared')) {
  run(npm, ['run', 'prepare:models']);
  run(npm, ['run', 'build:runtimes']);
  run(npm, ['run', 'prepare:notices']);
}
// --prepared reuses preparation, never bypasses provenance/hash/dependency validation.
run(npm, ['run', 'verify:assets']);
run(npm, ['run', 'prepare:packaging']);
const target = targetTriple();
const release = path.join(root, 'src-tauri/target/release');
const bundle = path.join(release, 'bundle');
const distribution = path.join(release, 'distribution');
rmSync(bundle, { recursive: true, force: true });
rmSync(distribution, { recursive: true, force: true });
mkdirSync(distribution, { recursive: true });
let signing = 'unsigned';
if (process.platform === 'win32') {
  const webview = process.env.TASKLENS_WEBVIEW2_INSTALLER;
  if (
    !webview ||
    !/^[a-fA-F0-9]{64}$/.test(process.env.TASKLENS_WEBVIEW2_SHA256 || '') ||
    (await hash(webview)) !== process.env.TASKLENS_WEBVIEW2_SHA256.toLowerCase()
  )
    throw new Error('Provide verified offline x64 WebView2 installer and TASKLENS_WEBVIEW2_SHA256');
  // Reject wrong-architecture/bootstrapper payloads before compiling the installer.
  const pe = readFileSync(webview);
  if (
    pe.toString('ascii', 0, 2) !== 'MZ' ||
    pe.toString('ascii', pe.readUInt32LE(0x3c), pe.readUInt32LE(0x3c) + 4) !== 'PE\u0000\u0000'
  )
    throw new Error(
      'WebView2 payload must be a Windows executable; x64 payload provenance requires native acceptance',
    );
  run('powershell.exe', ['-NoProfile', '-File', 'scripts/verify-webview2.ps1', '-Path', webview]);
  run(npm, ['run', 'tauri', '--', 'build', '--no-bundle']);
  const stage = path.join(release, 'offline-stage');
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  auditWindowsBinary(path.join(release, 'tasklens.exe'));
  copyFileSync(path.join(release, 'tasklens.exe'), path.join(stage, 'tasklens.exe'));
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
  cpSync(
    path.join(root, 'docs/third-party/native-reliability'),
    path.join(stage, 'resources/notices/native-reliability'),
    { recursive: true },
  );
  copyFileSync(
    path.join(root, 'src-tauri/resources/models.json'),
    path.join(stage, 'resources/models.json'),
  );
  copyFileSync(
    path.join(root, 'THIRD_PARTY_NOTICES.md'),
    path.join(stage, 'resources/notices/THIRD_PARTY_NOTICES.md'),
  );
  copyFileSync(webview, path.join(stage, 'WebView2Setup.exe'));
  if (process.env.TASKLENS_SIGN_CERT_THUMBPRINT) {
    for (const file of readdirSync(stage).filter(
      (name) => name.endsWith('.exe') && name !== 'WebView2Setup.exe',
    ))
      run('powershell.exe', [
        '-NoProfile',
        '-File',
        'scripts/windows-sign.ps1',
        '-Path',
        path.join(stage, file),
      ]);
  }
  const signingArgs = process.env.TASKLENS_SIGN_CERT_THUMBPRINT
    ? [
        '/DSignEnabled',
        '/STaskLens=powershell.exe -NoProfile -File $q' +
          path.join(root, 'scripts/windows-sign.ps1') +
          '$q -Path $f',
      ]
    : [];
  run(process.env.TASKLENS_ISCC || 'ISCC.exe', [
    `/DStage=${stage}`,
    `/DAppVersion=${version}`,
    ...signingArgs,
    path.join(root, 'scripts/windows-offline.iss'),
  ]);
  if (process.env.TASKLENS_SIGN_CERT_THUMBPRINT) {
    run('signtool.exe', ['verify', '/pa', '/all', path.join(bundle, 'inno', names[0])]);
    signing = 'authenticode-verified';
  }
} else {
  const extra =
    process.platform === 'darwin' && process.arch === 'x64'
      ? ['--config', 'src-tauri/tauri.intel.conf.json']
      : [];
  run(npm, [
    'run',
    'tauri',
    '--',
    'build',
    '--bundles',
    process.platform === 'linux' ? 'rpm,deb,appimage' : 'app,dmg',
    ...extra,
  ]);
  if (process.platform === 'darwin') {
    const apps = readdirSync(path.join(bundle, 'macos')).filter((name) => name.endsWith('.app'));
    if (apps.length !== 1) throw new Error('Expected one macOS application bundle');
    const app = path.join(bundle, 'macos', apps[0]);
    if (process.env.APPLE_SIGNING_IDENTITY) {
      run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
      run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
      run('xcrun', ['stapler', 'validate', app]);
      signing = 'developer-id-gatekeeper-and-staple-verified';
    } else signing = 'unverified-developer-id';
  }
}
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) {
      if (!name.endsWith('.app') && !name.endsWith('.AppDir')) walk(file);
    } else if (/\.(rpm|deb|AppImage|dmg|exe)$/.test(name)) files.push(file);
  }
}
if (!existsSync(bundle)) throw new Error('Packaging produced no bundle directory');
walk(bundle);
for (const name of names) {
  const suffix = path.extname(name);
  const matching = files.filter((file) => path.extname(file) === suffix);
  if (matching.length !== 1)
    throw new Error(`Expected exactly one fresh ${suffix} installer, found ${matching.length}`);
  // Keep the verified installer inode instead of duplicating another ~3 GB per platform.
  renameSync(matching[0], path.join(distribution, name));
}
if (git('rev-parse', 'HEAD') !== commit || git('status', '--porcelain'))
  throw new Error('Candidate changed during packaging');
const report = await inventory(distribution, {
  version,
  platform: process.platform,
  arch: process.arch,
  commit,
  sourceTree,
  signing,
});
report.target = target;
writeFileSync(
  path.join(distribution, 'SHA256SUMS'),
  report.artifacts.map((a) => `${a.sha256}  ${a.filename}\n`).join(''),
);
writeFileSync(
  path.join(distribution, 'release-assets.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.info(JSON.stringify(report, null, 2));
