import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verify, prepare, validateFormat } from './ai-assets.mjs';
import { assertLinuxGlibcVersions } from './linux-abi.mjs';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('release ABI gate rejects the observed Fedora/Ubuntu mismatch and private symbols', () => {
  const needs = (name) => `0x0010: Name: ${name} Flags: none Version: 4`;
  assert.deepEqual(assertLinuxGlibcVersions(needs('GLIBC_2.39')), ['2.39']);
  assert.deepEqual(assertLinuxGlibcVersions(needs('GLIBC_2.9')), ['2.9']);
  assert.throws(() => assertLinuxGlibcVersions(needs('GLIBC_2.43')), /rebuild.*Ubuntu/);
  assert.throws(() => assertLinuxGlibcVersions(needs('GLIBC_PRIVATE')), /private/);
});
test('preparation rejects corruption, preserves a valid cache and cleans failed stages', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tasklens-assets-'));
  const file = path.join(dir, 'asset');
  const good = Buffer.from('verified bytes');
  const spec = {
    bytes: good.length,
    sha256: digest(good),
    source: 'data:application/octet-stream;base64,' + good.toString('base64'),
  };
  try {
    await prepare(spec, file);
    await verify(file, spec);
    await prepare({ ...spec, source: 'invalid-url' }, file);
    assert.deepEqual(await readFile(file), good);
    await writeFile(file, 'corrupt bytes!');
    await assert.rejects(verify(file, spec));
    await assert.rejects(prepare({ ...spec, source: 'data:text/html,<html>error</html>' }, file));
    await assert.rejects(readFile(file + '.partial'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('format validation rejects an HTML response even when its size and digest match', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tasklens-format-'));
  const file = path.join(dir, 'model');
  try {
    const html = Buffer.from('<html>not a GGUF model</html>');
    await writeFile(file, html);
    await assert.rejects(
      verify(file, { bytes: html.length, sha256: digest(html), format: 'gguf' }),
      /GGUF/,
    );
    await assert.rejects(validateFormat(file, { bytes: html.length, format: 'ggml' }), /GGML/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Windows audit rejects missing runtime DLLs and incompatible architecture', async () => {
  const { auditWindowsBinary, peImports } = await import('./pe-dependencies.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'tasklens-pe-'));
  // Minimal synthetic PE32+ import table. Never executed.
  const pe = (name) => {
    const bytes = Buffer.alloc(2048);
    bytes.writeUInt32LE(128, 0x3c);
    bytes.write('PE\0\0', 128, 'ascii');
    bytes.writeUInt16LE(0x8664, 132);
    bytes.writeUInt16LE(1, 134);
    bytes.writeUInt16LE(240, 148);
    bytes.writeUInt16LE(0x20b, 152);
    bytes.writeUInt32LE(0x1000, 152 + 112 + 8);
    const section = 152 + 240;
    bytes.writeUInt32LE(1024, section + 8);
    bytes.writeUInt32LE(0x1000, section + 12);
    bytes.writeUInt32LE(1024, section + 16);
    bytes.writeUInt32LE(512, section + 20);
    bytes.writeUInt32LE(0x1100, 512 + 12);
    bytes.write(name + '\0', 768, 'ascii');
    return bytes;
  };
  try {
    const file = path.join(dir, 'synthetic.exe');
    await writeFile(file, pe('KERNEL32.dll'));
    assert.deepEqual(auditWindowsBinary(file), ['kernel32.dll']);
    await writeFile(file, pe('VCRUNTIME140.dll'));
    assert.throws(() => auditWindowsBinary(file), /Unbundled/);
    await writeFile(path.join(dir, 'vcruntime140.dll'), pe('KERNEL32.dll'));
    assert.deepEqual(auditWindowsBinary(file), ['vcruntime140.dll']);
    const wrong = pe('KERNEL32.dll');
    wrong.writeUInt16LE(0x14c, 132);
    await writeFile(file, wrong);
    assert.throws(() => peImports(file), /x86_64/);
    await writeFile(file, pe('../private.dll'));
    assert.throws(() => peImports(file), /Unsafe import/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
