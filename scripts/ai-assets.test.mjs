import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verify, prepare, validateFormat } from './ai-assets.mjs';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
