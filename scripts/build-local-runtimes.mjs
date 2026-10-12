import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const specs = JSON.parse(readFileSync('src-tauri/resources/models.json', 'utf8'));
const destination = path.join(root, 'src-tauri/resources/bin');
mkdirSync(destination, { recursive: true });
for (const [kind, name] of [
  ['whisper', 'whisper-cli'],
  ['extraction', 'llama-completion'],
]) {
  const spec = specs[kind];
  const source = path.join(root, '.local-ai', kind);
  if (!existsSync(source))
    execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', spec.repository, source], {
      stdio: 'inherit',
    });
  execFileSync('git', ['fetch', 'origin', spec.revision, '--depth=1'], {
    cwd: source,
    stdio: 'inherit',
  });
  execFileSync('git', ['checkout', '--detach', spec.revision], { cwd: source, stdio: 'inherit' });
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
    ['--build', `${source}/build`, '--config', 'Release', '--target', name, '-j', '2'],
    { stdio: 'inherit' },
  );
  const exe = name + (process.platform === 'win32' ? '.exe' : '');
  const binary = [`${source}/build/bin/${exe}`, `${source}/build/bin/Release/${exe}`].find(
    existsSync,
  );
  if (!binary) throw new Error(`Missing ${exe}`);
  copyFileSync(binary, path.join(destination, exe));
}
