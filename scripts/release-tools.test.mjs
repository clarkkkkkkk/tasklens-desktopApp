import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { splitArtifact, joinArtifact } from './release-parts.mjs';
import { assertReleaseEnvironment } from './release-policy.mjs';
test('production rejects explicit mock providers and public credential environment variables', () => {
  assert.throws(() => assertReleaseEnvironment({ VITE_TASKLENS_EXTRACTION: 'mock' }), /mock/);
  assert.throws(
    () => assertReleaseEnvironment({ VITE_GROQ_API_KEY: 'synthetic-placeholder' }),
    /Credential/,
  );
  assert.doesNotThrow(() => assertReleaseEnvironment({}));
});
test('installer parts reassemble byte-for-byte, reject tampering, and preserve existing output', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tasklens-parts-'));
  try {
    const input = path.join(dir, 'TaskLens_0.1.0.rpm');
    const original = Buffer.from('A complete synthetic offline installer with model data.');
    await writeFile(input, original);
    const { manifestFile, manifest } = await splitArtifact(input, path.join(dir, 'parts'), 11);
    const joined = await joinArtifact(manifestFile, path.join(dir, 'joined'));
    assert.deepEqual(await readFile(joined), original);
    await assert.rejects(joinArtifact(manifestFile, path.join(dir, 'joined')), /EEXIST/);
    assert.deepEqual(await readFile(joined), original);
    await writeFile(path.join(dir, 'parts', manifest.parts[0].file), Buffer.alloc(11));
    await assert.rejects(joinArtifact(manifestFile, path.join(dir, 'broken')), /checksum/);
    await assert.rejects(access(path.join(dir, 'broken', manifest.artifact.file)));
    manifest.artifact.file = '../outside.exe';
    await writeFile(manifestFile, JSON.stringify(manifest));
    await assert.rejects(joinArtifact(manifestFile, path.join(dir, 'attack')), /Invalid/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
