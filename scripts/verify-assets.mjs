import { loadEnv } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { manifest, root, verify, sidecar, targetTriple, hash } from './ai-assets.mjs';
if (
  (process.env.VITE_TASKLENS_EXTRACTION ??
    loadEnv('production', root, 'VITE_').VITE_TASKLENS_EXTRACTION) === 'mock'
)
  throw new Error('Release assets cannot be packaged with mock extraction');
const specs = [
  ['extraction', 'models'],
  ['whisper', 'models'],
].map(([kind, dir]) => [manifest[kind], dir]);
for (const s of manifest.tesseract.data) specs.push([s, 'tessdata']);
for (const s of manifest.notices) specs.push([s, 'notices']);
let bytes = 0;
for (const [s, dir] of specs) {
  await verify(path.join(root, 'src-tauri/resources', dir, s.file), s);
  bytes += s.bytes;
}
const receipt = JSON.parse(
  readFileSync(path.join(root, 'src-tauri/resources/notices/runtime-build.json')),
);
if (receipt.target !== targetTriple() || receipt.manifestVersion !== manifest.manifestVersion)
  throw new Error('Runtime build target/version mismatch');
for (const [name, key] of [
  ['llama-server', 'llamaCpp'],
  ['whisper-cli', 'whisper'],
  ['tesseract', 'tesseract'],
]) {
  const file = path.join(root, 'src-tauri/binaries', sidecar(name));
  if (
    receipt.runtimes[name]?.revision !== manifest[key].revision ||
    receipt.runtimes[name]?.sha256 !== (await hash(file))
  )
    throw new Error(`Runtime provenance mismatch: ${name}`);
  execFileSync(file, ['--help'], { stdio: 'ignore', timeout: 20000 });
  if (process.platform === 'linux') {
    const output = execFileSync('ldd', [file], { encoding: 'utf8' });
    if (output.includes('not found')) throw new Error(`Unresolved runtime dependencies: ${name}`);
    const dependencies = [...output.matchAll(/^\s*(\S+) =>/gm)].map((m) => m[1]);
    const unexpected = dependencies.filter(
      (n) => !/^lib(c|m|stdc\+\+|gcc_s|pthread|dl|rt)\.so/.test(n),
    );
    if (unexpected.length)
      throw new Error(`Unbundled runtime dependencies: ${unexpected.join(', ')}`);
    console.info(`${name}: ${dependencies.join(', ')}`);
  } else if (process.platform === 'darwin') {
    const output = execFileSync('otool', ['-L', file], { encoding: 'utf8' });
    const dependencies = output
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(' ')[0])
      .filter(Boolean);
    if (dependencies.some((d) => !d.startsWith('/usr/lib/') && !d.startsWith('/System/Library/')))
      throw new Error(`Unbundled macOS dependency: ${output}`);
  }
  bytes += statSync(file).size;
}
for (const [dir, expected] of [
  ['models', [manifest.extraction.file, manifest.whisper.file]],
  ['tessdata', manifest.tesseract.data.map((s) => s.file)],
]) {
  const extra = readdirSync(path.join(root, 'src-tauri/resources', dir)).filter(
    (f) => f !== 'README.md' && !expected.includes(f),
  );
  if (extra.length) throw new Error(`Unexpected bundled ${dir}: ${extra.join(', ')}`);
}
for (const dir of ['models', 'tessdata', 'notices']) {
  if (readdirSync(path.join(root, 'src-tauri/resources', dir)).some((f) => f.endsWith('.partial')))
    throw new Error('Incomplete preparation file');
}
console.info(`Verified offline payload: ${bytes} bytes (before TaskLens/system webview).`);
