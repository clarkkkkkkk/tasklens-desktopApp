// Developer-only native OCR test. Uses the production Rust decoder/preprocessor/TSV parser.
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  copyFileSync,
  readdirSync,
  mkdirSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const target = spawnSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).stdout.trim();
let binary = process.argv.includes('--binary')
  ? path.resolve(option('--binary'))
  : path.join(
      root,
      'src-tauri/binaries',
      `tasklens-tesseract-${target}${process.platform === 'win32' ? '.exe' : ''}`,
    );
let data = process.argv.includes('--tessdata')
  ? path.resolve(option('--tessdata'))
  : path.join(root, 'src-tauri/resources/tessdata');
const out = mkdtempSync(path.join(os.tmpdir(), 'TaskLens OCR é test '));
if (!existsSync(binary))
  throw new Error('Bundled OCR executable missing; build the native runtimes first.');
if (process.argv.includes('--unicode-path')) {
  const binDir = path.join(out, 'bin space é');
  mkdirSync(binDir);
  for (const name of readdirSync(path.dirname(binary))) {
    if (name === path.basename(binary) || /\.dll$/i.test(name))
      copyFileSync(path.join(path.dirname(binary), name), path.join(binDir, name));
  }
  binary = path.join(binDir, path.basename(binary));
  const dataDir = path.join(out, 'language data é');
  mkdirSync(dataDir);
  for (const language of ['eng', 'ceb', 'tgl'])
    copyFileSync(
      path.join(data, `${language}.traineddata`),
      path.join(dataDir, `${language}.traineddata`),
    );
  data = dataDir;
}
const result = spawnSync(
  'cargo',
  [
    'test',
    '--locked',
    '--manifest-path',
    path.join(root, 'src-tauri/Cargo.toml'),
    'ocr::tests::native_ocr_smoke',
    '--',
    '--ignored',
    '--exact',
    '--nocapture',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      TASKLENS_OCR_FIXTURE: process.argv.includes('--fixture') ? option('--fixture') : 'midterm',
      TASKLENS_TESSERACT: binary,
      TASKLENS_TESSDATA: data,
      TASKLENS_OCR_SMOKE_OUTPUT: out,
    },
  },
);
console.info(`Synthetic smoke evidence retained at ${out}`);
if (existsSync(path.join(out, 'report.json')))
  console.info(readFileSync(path.join(out, 'report.json'), 'utf8'));
process.exitCode = result.status ?? 1;
