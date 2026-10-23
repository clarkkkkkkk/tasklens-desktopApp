// Build-time only: never imported by the application.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, copyFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const manifest = JSON.parse(
  readFileSync(path.join(root, 'src-tauri/resources/models.json')),
);
export async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
export async function validateFormat(file, spec) {
  if (!spec.format) return;
  const handle = await open(file, 'r');
  let offset = 0;
  // Metadata is small and bounded; avoid one filesystem operation per tokenizer entry.
  const header = Buffer.alloc(Math.min(spec.bytes, spec.format === 'gguf' ? 32 * 1024 * 1024 : 48));
  const read = await handle.read(header, 0, header.length, 0);
  async function bytes(n) {
    if (n < 0 || offset + n > read.bytesRead) throw new Error('Invalid or truncated format bounds');
    const b = header.subarray(offset, offset + n);
    offset += n;
    return b;
  }
  const u32 = async () => (await bytes(4)).readUInt32LE();
  const u64 = async () => {
    const n = (await bytes(8)).readBigUInt64LE();
    if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid metadata length');
    return Number(n);
  };
  const str = async () => (await bytes(await u64())).toString('utf8');
  async function value(type) {
    if (type === 8) return str();
    if (type === 9) {
      const element = await u32(),
        count = await u64();
      if (element === 9 || count > 2_000_000) throw new Error('Invalid metadata array');
      for (let i = 0; i < count; i++) await value(element);
      return;
    }
    const sizes = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
    if (!sizes[type]) throw new Error('Unknown GGUF metadata type');
    const b = await bytes(sizes[type]);
    return type === 4 ? b.readUInt32LE() : undefined;
  }
  try {
    const magic = await bytes(4);
    if (spec.format === 'gguf') {
      if (magic.toString() !== 'GGUF' || (await u32()) !== 3) throw new Error('Expected GGUF v3');
      const tensors = await u64(),
        count = await u64();
      if (!tensors || tensors > 100_000 || count > 100_000) throw new Error('Invalid GGUF header');
      const metadata = {};
      for (let i = 0; i < count; i++) metadata[await str()] = await value(await u32());
      if (
        metadata['general.architecture'] !== spec.architecture ||
        metadata['general.file_type'] !== 15
      )
        throw new Error('Expected Qwen3 Q4_K_M metadata');
    } else if (spec.format === 'ggml') {
      if (magic.readUInt32LE() !== 0x67676d6c) throw new Error('Expected Whisper GGML');
      const h = await bytes(44);
      // Small multilingual: vocab, audio context/state/heads/layers, text context/state/heads/layers, mels, ftype.
      const expected = [51865, 1500, 768, 12, 12, 448, 768, 12, 12, 80, 1];
      if (expected.some((n, i) => h.readInt32LE(i * 4) !== n))
        throw new Error('Expected multilingual Whisper Small f16');
    } else if (
      spec.format === 'traineddata' &&
      (magic.readInt32LE() < 1 || magic.readInt32LE() > 100)
    ) {
      throw new Error('Invalid Tesseract data header');
    }
  } finally {
    await handle.close();
  }
}
export async function verify(file, spec) {
  if ((await stat(file)).size !== spec.bytes)
    throw new Error(`Size mismatch: ${path.basename(file)}`);
  if ((await hash(file)) !== spec.sha256)
    throw new Error(`Checksum mismatch: ${path.basename(file)}`);
  await validateFormat(file, spec);
}
export async function prepare(spec, target, local) {
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await verify(target, spec);
    return;
  } catch {
    /* rebuild invalid cache */
  }
  const partial = `${target}.partial`;
  await rm(partial, { force: true });
  try {
    let reused = false;
    if (local) {
      try {
        await verify(local, spec);
        reused = true;
      } catch {
        /* download pinned asset */
      }
      if (reused) await copyFile(local, partial);
    }
    if (!reused) {
      console.info(`Downloading ${spec.source}`);
      const response = await fetch(spec.source);
      if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'wx' }));
    }
    await verify(partial, spec);
    await rename(partial, target);
  } finally {
    await rm(partial, { force: true });
  }
}
export function targetTriple() {
  const triples = {
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'win32-x64': 'x86_64-pc-windows-msvc',
    'darwin-arm64': 'aarch64-apple-darwin',
    'darwin-x64': 'x86_64-apple-darwin',
  };
  const triple = triples[`${process.platform}-${process.arch}`];
  if (!triple) throw new Error('Supported release hosts: Linux x64, Windows x64, macOS arm64/x64');
  return triple;
}
export const sidecar = (name) =>
  `tasklens-${name}-${targetTriple()}${process.platform === 'win32' ? '.exe' : ''}`;
