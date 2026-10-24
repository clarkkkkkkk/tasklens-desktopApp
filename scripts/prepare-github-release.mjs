// Assemble verified local candidates into one flat, GitHub-sized upload set. Never uploads.
import { mkdir, link, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyInventory, sha256, GITHUB_ASSET_LIMIT } from './release-artifacts.mjs';
import { verifyParts } from './release-parts.mjs';

export async function prepareRelease(output, directories) {
  if (!directories.length) throw new Error('Provide at least one verified candidate directory');
  const reports = [];
  for (const directory of directories) reports.push(await verifyInventory(directory));
  const first = reports[0];
  if (
    reports.some(
      (r) =>
        r.version !== first.version ||
        r.commit !== first.commit ||
        r.sourceTree !== first.sourceTree,
    )
  )
    throw new Error('Release candidates must have identical version and source identity');
  // No stale assets: caller must choose a new directory on the same filesystem.
  await mkdir(output);
  const uploads = new Map();
  const artifacts = [];
  const installerSums = [];
  async function add(file) {
    const filename = path.basename(file);
    const info = await lstat(file);
    if (!info.isFile() || info.size < 1 || info.size >= GITHUB_ASSET_LIMIT)
      throw new Error('Invalid or oversized GitHub asset');
    const hash = await sha256(file);
    const existing = uploads.get(filename);
    if (existing) {
      if (existing.bytes !== info.size || existing.sha256 !== hash)
        throw new Error(`Conflicting release asset: ${filename}`);
      return;
    }
    await link(file, path.join(output, filename));
    uploads.set(filename, {
      filename,
      bytes: info.size,
      sha256: hash,
      downloadUrl: null,
      downloadVerified: false,
    });
  }
  for (let i = 0; i < reports.length; i++) {
    const report = reports[i],
      directory = directories[i];
    for (const entry of report.artifacts) {
      if (artifacts.some((a) => a.filename === entry.filename))
        throw new Error('Duplicate platform installer');
      const artifact = { ...entry, parts: [], partsManifest: null };
      installerSums.push(`${entry.sha256}  ${entry.filename}`);
      if (entry.bytes < GITHUB_ASSET_LIMIT) await add(path.join(directory, entry.filename));
      else {
        const manifestPath = path.join(directory, ...entry.partsManifest.split('/'));
        const parts = await verifyParts(manifestPath);
        await add(manifestPath);
        artifact.partsManifest = path.basename(manifestPath);
        for (const part of parts.parts) {
          await add(path.join(path.dirname(manifestPath), part.file));
          artifact.parts.push({ ...part, downloadUrl: null, downloadVerified: false });
        }
      }
      artifacts.push(artifact);
    }
    for (const file of report.supportFiles || []) await add(path.join(directory, file.filename));
  }
  const sums = [...installerSums];
  for (const entry of uploads.values())
    if (!artifacts.some((a) => a.filename === entry.filename))
      sums.push(`${entry.sha256}  ${entry.filename}`);
  await writeFile(path.join(output, 'SHA256SUMS'), sums.join('\n') + '\n', { flag: 'wx' });
  const manifest = {
    schemaVersion: 1,
    kind: 'tasklens-github-release',
    version: first.version,
    channel: 'prerelease',
    commit: first.commit,
    sourceTree: first.sourceTree,
    publication: 'BLOCKED',
    nativeAcceptance: reports.map((r) => ({ target: r.target, status: r.nativeAcceptance })),
    artifacts,
    assets: [...uploads.values()],
  };
  await writeFile(
    path.join(output, 'release-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    { flag: 'wx' },
  );
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [output, ...directories] = process.argv.slice(2);
  if (!output || !directories.length)
    throw new Error(
      'Usage: node scripts/prepare-github-release.mjs NEW_OUTPUT_DIRECTORY CANDIDATE_DIRECTORY [...]',
    );
  const manifest = await prepareRelease(
    path.resolve(output),
    directories.map((d) => path.resolve(d)),
  );
  console.info(
    `Prepared ${manifest.assets.length + 2} draft assets; no upload or publication performed.`,
  );
}
