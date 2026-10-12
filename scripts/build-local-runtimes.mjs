// Prepares local inference runtimes in src-tauri/resources/bin (git-ignored, bundled).
//
//   npm run build:runtimes                 build llama-server and whisper-cli from pinned sources
//   npm run build:runtimes -- --prebuilt   download the pinned official llama.cpp release for
//                                          this platform (SHA-256 verified) and build whisper-cli
//   add --llama-only to skip whisper.cpp
//
// Developer tooling only. TaskLens itself never downloads runtimes or models.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  readdirSync,
  rmSync,
  statSync,
  chmodSync,
} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const specs = JSON.parse(readFileSync('src-tauri/resources/models.json', 'utf8'));
const destination = path.join(root, 'src-tauri/resources/bin');
const args = new Set(process.argv.slice(2));
const exe = (name) => name + (process.platform === 'win32' ? '.exe' : '');
mkdirSync(destination, { recursive: true });

function buildFromSource(repository, revision, folder, target) {
  const source = path.join(root, '.local-ai', folder);
  if (!existsSync(source))
    execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', repository, source], {
      stdio: 'inherit',
    });
  execFileSync('git', ['fetch', 'origin', revision, '--depth=1'], {
    cwd: source,
    stdio: 'inherit',
  });
  execFileSync('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: source, stdio: 'inherit' });
  execFileSync(
    'cmake',
    [
      '-S',
      source,
      '-B',
      `${source}/build`,
      '-DCMAKE_BUILD_TYPE=Release',
      '-DBUILD_SHARED_LIBS=OFF',
      '-DGGML_NATIVE=OFF',
      '-DGGML_OPENMP=OFF',
      '-DGGML_METAL=OFF',
      '-DGGML_BLAS=OFF',
      '-DWHISPER_BUILD_TESTS=OFF',
      '-DLLAMA_BUILD_TESTS=OFF',
      '-DLLAMA_CURL=OFF',
      '-DGGML_CCACHE=OFF',
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    'cmake',
    ['--build', `${source}/build`, '--config', 'Release', '--target', target, '-j', '4'],
    { stdio: 'inherit' },
  );
  const binary = [
    `${source}/build/bin/${exe(target)}`,
    `${source}/build/bin/Release/${exe(target)}`,
  ].find(existsSync);
  if (!binary) throw new Error(`Missing ${exe(target)}`);
  copyFileSync(binary, path.join(destination, exe(target)));
}

async function downloadVerified(url, file, sha256) {
  const downloads = path.join(root, '.local-ai', 'downloads');
  mkdirSync(downloads, { recursive: true });
  const target = path.join(downloads, file);
  const digest = () => createHash('sha256').update(readFileSync(target)).digest('hex');
  if (!existsSync(target) || digest() !== sha256) {
    console.info(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
  if (digest() !== sha256) {
    rmSync(target);
    throw new Error(`Checksum mismatch for ${file}. The download was removed.`);
  }
  return target;
}

async function prebuiltLlama() {
  const llama = specs.llamaCpp;
  const key = `${process.platform}-${process.arch}`;
  const asset = llama.prebuilt[key];
  if (!asset) throw new Error(`No pinned llama.cpp release for ${key}. Build from source instead.`);
  const archive = await downloadVerified(
    `${llama.repository}/releases/download/${llama.release}/${asset.file}`,
    asset.file,
    asset.sha256,
  );
  // Extract into an empty folder of its own, then copy only the server and its libraries.
  const unpacked = path.join(root, '.local-ai', 'unpacked', llama.release);
  rmSync(unpacked, { recursive: true, force: true });
  mkdirSync(unpacked, { recursive: true });
  // Windows: use the system bsdtar (handles zip); a GNU tar from Git would misread "C:".
  const tar =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
      : 'tar';
  execFileSync(tar, ['-xf', archive, '-C', unpacked], { stdio: 'inherit' });
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(unpacked);
  const server = files.find((f) => path.basename(f) === exe(llama.binary));
  if (!server) throw new Error(`${exe(llama.binary)} not found in ${asset.file}`);
  const libraries = files.filter(
    (f) =>
      path.dirname(f) === path.dirname(server) &&
      /\.(dll|dylib|so(\.\d+)*)$/.test(f) &&
      // Skip libraries that only back llama.cpp's other command-line tools.
      !/llama-(?!server|common)[\w-]+-impl/.test(path.basename(f)),
  );
  for (const file of [server, ...libraries]) {
    const target = path.join(destination, path.basename(file));
    copyFileSync(file, target);
    if (process.platform !== 'win32') chmodSync(target, 0o755);
  }
  console.info(
    `Installed ${path.basename(server)} and ${libraries.length} libraries from ${llama.release}.`,
  );
}

if (args.has('--prebuilt')) await prebuiltLlama();
else
  buildFromSource(
    specs.llamaCpp.repository,
    specs.llamaCpp.revision,
    'llama',
    specs.llamaCpp.binary,
  );
if (!args.has('--llama-only'))
  buildFromSource(specs.whisper.repository, specs.whisper.revision, 'whisper', 'whisper-cli');
