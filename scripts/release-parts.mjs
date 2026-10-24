// Distribution tooling only: split the COMPLETE offline installer, never models at application time.
import { createReadStream } from 'node:fs';
import { mkdir, stat, readFile, writeFile, rename, rm, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const PART_BYTES = 1024 ** 3;
const validName = (value) =>
  typeof value === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value) &&
  value !== '.' &&
  value !== '..';
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function splitArtifact(file, directory, partBytes = PART_BYTES) {
  const name = path.basename(file);
  if (
    !validName(name) ||
    !Number.isSafeInteger(partBytes) ||
    partBytes < 1 ||
    partBytes > PART_BYTES
  )
    throw new Error('Invalid artifact name or part size.');
  const bytes = (await stat(file)).size;
  if (bytes < 1 || bytes > 32 * 1024 ** 3)
    throw new Error('Artifact size is outside supported bounds.');
  await mkdir(directory, { recursive: true });
  const artifact = { file: name, bytes, sha256: await digest(file) };
  const parts = [];
  for (let start = 0; start < bytes; start += partBytes) {
    const end = Math.min(bytes, start + partBytes) - 1;
    const part = `${name}.part${String(parts.length + 1).padStart(3, '0')}`;
    const target = path.join(directory, part);
    const partial = `${target}.partial`;
    // Refuse to overwrite unrelated files or silently reuse stale release chunks.
    const handle = await open(partial, 'wx');
    const output = handle.createWriteStream();
    try {
      await pipeline(createReadStream(file, { start, end }), output);
      const entry = { file: part, bytes: end - start + 1, sha256: await digest(partial) };
      const existing = await stat(target).catch((e) => {
        if (e.code === 'ENOENT') return null;
        throw e;
      });
      if (existing) {
        if (existing.size !== entry.bytes || (await digest(target)) !== entry.sha256)
          throw new Error('Existing release part differs; use a fresh distribution directory.');
        await rm(partial);
      } else await rename(partial, target);
      parts.push(entry);
    } finally {
      await handle.close().catch(() => {});
      await rm(partial, { force: true });
    }
  }
  if ((await digest(file)) !== artifact.sha256)
    throw new Error('Artifact changed while splitting.');
  const manifest = { version: 1, artifact, parts };
  const manifestFile = path.join(directory, `${name}.parts.json`);
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(
    path.join(directory, 'SHA256SUMS'),
    parts.map((p) => `${p.sha256}  ${p.file}\n`).join(''),
  );
  return { manifestFile, manifest };
}
async function readManifest(manifestFile) {
  const metadata = await stat(manifestFile);
  if (metadata.size > 1024 * 1024) throw new Error('Manifest is too large.');
  const m = JSON.parse(await readFile(manifestFile, 'utf8'));
  const validEntry = (p) =>
    p &&
    validName(p.file) &&
    /^[a-f0-9]{64}$/.test(p.sha256) &&
    Number.isSafeInteger(p.bytes) &&
    p.bytes > 0;
  if (
    m.version !== 1 ||
    !validEntry(m.artifact) ||
    !Array.isArray(m.parts) ||
    !m.parts.length ||
    m.parts.length > 10000 ||
    m.artifact.bytes > 32 * 1024 ** 3 ||
    m.parts.reduce((n, p) => n + (p?.bytes || 0), 0) !== m.artifact.bytes ||
    m.parts.some(
      (p, i) =>
        !validEntry(p) ||
        p.bytes > PART_BYTES ||
        p.file !== `${m.artifact.file}.part${String(i + 1).padStart(3, '0')}`,
    )
  )
    throw new Error('Invalid release manifest.');
  return m;
}
/** Hashes every part in place without reassembling; used by CI before any upload. */
export async function verifyParts(manifestFile) {
  const m = await readManifest(manifestFile);
  const whole = createHash('sha256');
  for (const part of m.parts) {
    const file = path.join(path.dirname(manifestFile), part.file);
    if ((await stat(file)).size !== part.bytes) throw new Error('Release part size mismatch.');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk);
      whole.update(chunk);
    }
    if (hash.digest('hex') !== part.sha256) throw new Error('Release part checksum mismatch.');
  }
  if (whole.digest('hex') !== m.artifact.sha256) throw new Error('Installer checksum mismatch.');
  return m;
}
export async function joinArtifact(manifestFile, directory) {
  const m = await readManifest(manifestFile);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, m.artifact.file);
  // Exclusive creation preserves an existing installer, including a prior partial failure.
  const output = await open(target, 'wx');
  try {
    const whole = createHash('sha256');
    for (const part of m.parts) {
      const file = path.join(path.dirname(manifestFile), part.file);
      if ((await stat(file)).size !== part.bytes) throw new Error('Release part size mismatch.');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file)) {
        hash.update(chunk);
        whole.update(chunk);
        // FileHandle.write may be short: writeFile writes the complete buffer at the current offset.
        await output.writeFile(chunk);
      }
      if (hash.digest('hex') !== part.sha256) throw new Error('Release part checksum mismatch.');
    }
    if (whole.digest('hex') !== m.artifact.sha256) throw new Error('Installer checksum mismatch.');
    await output.sync();
    await output.close();
    return target;
  } catch (error) {
    await output.close().catch(() => {});
    await rm(target, { force: true });
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, file, output] = process.argv.slice(2);
  if (!file || !output || !['split', 'join'].includes(command))
    throw new Error('Usage: node scripts/release-parts.mjs split|join INPUT OUTPUT_DIRECTORY');
  console.info(
    command === 'split'
      ? (await splitArtifact(file, output)).manifestFile
      : await joinArtifact(file, output),
  );
}
