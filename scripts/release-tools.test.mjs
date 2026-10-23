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

test('release inventory requires every target installer and detects post-build modification', async () => {
  const { releaseNames, inventory, verifyInventory } = await import('./release-artifacts.mjs');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tasklens-inventory-'));
  const spec = {
    version: '0.1.0',
    platform: 'linux',
    arch: 'x64',
    commit: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    signing: 'unsigned',
  };
  try {
    assert.throws(() => releaseNames('../escape', 'linux', 'x64'), /version/);
    await assert.rejects(inventory(dir, spec), /ENOENT/);
    for (const name of releaseNames('0.1.0', 'linux', 'x64'))
      await writeFile(path.join(dir, name), 'synthetic-package');
    const report = await inventory(dir, spec);
    assert.equal(report.artifacts.length, 3);
    assert.ok(report.artifacts.every((a) => a.downloadUrl === null && !a.downloadVerified));
    await writeFile(path.join(dir, 'release-assets.json'), JSON.stringify(report));
    await writeFile(
      path.join(dir, 'SHA256SUMS'),
      report.artifacts.map((a) => `${a.sha256}  ${a.filename}\n`).join(''),
    );
    await verifyInventory(dir);
    await writeFile(
      path.join(dir, 'release-assets.json'),
      JSON.stringify({ ...report, artifacts: report.artifacts.slice(0, 1) }),
    );
    await assert.rejects(verifyInventory(dir), /Incomplete/);
    await writeFile(path.join(dir, 'release-assets.json'), JSON.stringify(report));
    await writeFile(path.join(dir, report.artifacts[0].filename), 'tampered-package');
    await assert.rejects(verifyInventory(dir), /integrity/);
    report.artifacts[0].filename = '../outside.rpm';
    await writeFile(path.join(dir, 'release-assets.json'), JSON.stringify(report));
    await assert.rejects(verifyInventory(dir), /Unsafe/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
