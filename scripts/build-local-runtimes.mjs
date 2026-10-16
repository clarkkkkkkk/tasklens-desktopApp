// Native host builds only. No application-time downloader or system runtime lookup.
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, copyFileSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { root, manifest, prepare, sidecar, targetTriple, hash } from './ai-assets.mjs';
const destination = path.join(root, 'src-tauri/binaries');
const notices = path.join(root, 'src-tauri/resources/notices');
mkdirSync(destination, { recursive: true });
mkdirSync(notices, { recursive: true });
const exe = (name) => name + (process.platform === 'win32' ? '.exe' : '');
const run = (cmd, args) =>
  execFileSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.join(root, '.local-ai/sources') },
  });
async function source(key) {
  const spec = manifest[key];
  const archive = path.join(root, '.local-ai/downloads', `${key}-${spec.revision}.tar.gz`);
  await prepare(spec.archive, archive);
  const folder = path.join(root, '.local-ai/sources', `${key}-${spec.revision}`);
  // Restore sources from the verified archive on every build. Preserve only compiled
  // build artifacts, whose paths remain identical; added/edited source files cannot leak in.
  const cache = `${folder}-build-cache`;
  if (existsSync(path.join(folder, 'build'))) renameSync(path.join(folder, 'build'), cache);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const tar =
    process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32/tar.exe') : 'tar';
  run(tar, ['-xf', archive, '-C', folder, '--strip-components=1']);
  if (existsSync(cache)) renameSync(cache, path.join(folder, 'build'));
  // Never retain unpinned UI downloads from an older llama.cpp build cache.
  if (key === 'llamaCpp')
    rmSync(path.join(folder, 'build/tools/ui'), { recursive: true, force: true });
  return folder;
}
const common = [
  '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_SHARED_LIBS=OFF',
  '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
  '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded',
];
const ggml = [
  '-DGGML_NATIVE=OFF',
  '-DGGML_OPENMP=OFF',
  '-DGGML_METAL=OFF',
  '-DGGML_BLAS=OFF',
  '-DGGML_CCACHE=OFF',
  '-DGGML_AVX=OFF',
  '-DGGML_AVX2=OFF',
  '-DGGML_FMA=OFF',
  '-DGGML_F16C=OFF',
  '-DGGML_BMI2=OFF',
  '-DGGML_SSE42=OFF',
];
function configure(folder, options) {
  run('cmake', ['-S', folder, '-B', `${folder}/build`, ...common, ...options]);
}
function build(folder, target) {
  run('cmake', [
    '--build',
    `${folder}/build`,
    '--config',
    'Release',
    '--target',
    target,
    '--parallel',
    process.env.TASKLENS_BUILD_JOBS || '2',
  ]);
}
const receipt = { target: targetTriple(), manifestVersion: manifest.manifestVersion, runtimes: {} };
async function install(folder, binary, key) {
  const candidates = [
    `build/bin/${exe(binary)}`,
    `build/bin/Release/${exe(binary)}`,
    `build/${exe(binary)}`,
    `build/Release/${exe(binary)}`,
  ];
  const file = candidates.map((p) => path.join(folder, p)).find(existsSync);
  if (!file) throw new Error(`Missing ${binary}`);
  const target = path.join(destination, sidecar(binary));
  copyFileSync(file, target);
  receipt.runtimes[binary] = {
    revision: manifest[key].revision,
    archiveSha256: manifest[key].archive.sha256,
    sha256: await hash(target),
    file: path.basename(target),
  };
}
for (const [key, binary] of [
  ['llamaCpp', 'llama-server'],
  ['whisper', 'whisper-cli'],
]) {
  const folder = await source(key);
  configure(folder, [
    ...ggml,
    '-DLLAMA_BUILD_TESTS=OFF',
    '-DLLAMA_CURL=OFF',
    '-DLLAMA_OPENSSL=OFF',
    '-DLLAMA_USE_PREBUILT_UI=OFF',
    '-DLLAMA_BUILD_UI=OFF',
    '-DLLAMA_SUBPROCESS=OFF',
    '-DWHISPER_BUILD_TESTS=OFF',
  ]);
  build(folder, binary);
  await install(folder, binary, key);
}
const lep = await source('leptonica');
const prefix = path.join(root, '.local-ai/ocr-prefix', targetTriple());
configure(lep, [
  '-DBUILD_PROG=OFF',
  '-DSW_BUILD=OFF',
  '-DENABLE_ZLIB=OFF',
  '-DENABLE_PNG=OFF',
  '-DENABLE_JPEG=OFF',
  '-DENABLE_TIFF=OFF',
  '-DENABLE_WEBP=OFF',
  '-DENABLE_OPENJPEG=OFF',
  '-DENABLE_GIF=OFF',
  `-DCMAKE_INSTALL_PREFIX=${prefix}`,
]);
build(lep, 'leptonica');
run('cmake', ['--install', `${lep}/build`, '--config', 'Release']);
const tess = await source('tesseract');
configure(tess, [
  '-DBUILD_TRAINING_TOOLS=OFF',
  '-DBUILD_TESTS=OFF',
  '-DOPENMP_BUILD=OFF',
  '-DDISABLE_ARCHIVE=ON',
  '-DDISABLE_CURL=ON',
  `-DCMAKE_PREFIX_PATH=${prefix}`,
]);
build(tess, 'tesseract');
await install(tess, 'tesseract', 'tesseract');
writeFileSync(path.join(notices, 'runtime-build.json'), JSON.stringify(receipt, null, 2) + '\n');
console.info(`Prepared native sidecars for ${targetTriple()}.`);
