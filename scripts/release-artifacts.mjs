// Final installer inventory. URLs are deliberately unset until a separately approved upload.
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyParts } from './release-parts.mjs';
export const GITHUB_ASSET_LIMIT = 2 ** 31;
export const partsManifestPath = (filename) => `parts/${filename}/${filename}.parts.json`;
export const releaseNames = (version, platform, arch) => {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error('Invalid release version');
  if (platform === 'linux' && arch === 'x64')
    return ['rpm', 'deb', 'AppImage'].map((ext) => `TaskLens-${version}-linux-x86_64.${ext}`);
  if (platform === 'win32' && arch === 'x64') return [`TaskLens-Setup-${version}-windows-x64.exe`];
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch))
    return [`TaskLens-${version}-macos-${arch}.dmg`];
  throw new Error('Unsupported installer target');
};
export async function sha256(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
export async function inventory(
  directory,
  { version, platform, arch, commit, sourceTree, signing },
) {
  if (!/^[a-f0-9]{40}$/.test(commit) || !/^[a-f0-9]{40}$/.test(sourceTree))
    throw new Error('Missing source identity');
  const artifacts = [];
  for (const filename of releaseNames(version, platform, arch)) {
    const file = path.join(directory, filename);
    const info = await lstat(file);
    if (!info.isFile() || info.size === 0) throw new Error(`Invalid installer: ${filename}`);
    artifacts.push({
      filename,
      platform,
      architecture: arch === 'x64' ? 'x86_64' : arch,
      bytes: info.size,
      sha256: await sha256(file),
      signing,
      githubReleaseEligible: info.size < 2 ** 31,
      distribution: info.size < GITHUB_ASSET_LIMIT ? 'github-release' : 'github-release-parts',
      partsManifest: null,
      downloadUrl: null,
      downloadVerified: false,
    });
  }
  return {
    schemaVersion: 1,
    version,
    channel: 'prerelease',
    commit,
    sourceTree,
    nativeAcceptance: 'NOT RUN',
    artifacts,
  };
}
export async function verifyInventory(directory) {
  const report = JSON.parse(await readFile(path.join(directory, 'release-assets.json'), 'utf8'));
  if (
    report.schemaVersion !== 1 ||
    report.channel !== 'prerelease' ||
    !Array.isArray(report.artifacts) ||
    !report.artifacts.length ||
    !/^[a-f0-9]{40}$/.test(report.commit) ||
    !/^[a-f0-9]{40}$/.test(report.sourceTree)
  )
    throw new Error('Invalid release inventory');
  const seen = new Set();
  const verifiedParts = new Map();
  for (const entry of report.artifacts) {
    if (
      typeof entry.filename !== 'string' ||
      path.basename(entry.filename) !== entry.filename ||
      entry.filename.includes('\\') ||
      seen.has(entry.filename)
    )
      throw new Error('Unsafe or duplicate installer filename');
    seen.add(entry.filename);
    if (
      !releaseNames(
        report.version,
        entry.platform,
        entry.architecture === 'x86_64' ? 'x64' : entry.architecture,
      ).includes(entry.filename)
    )
      throw new Error('Unexpected installer filename');
    const info = await lstat(path.join(directory, entry.filename));
    if (
      !info.isFile() ||
      info.size !== entry.bytes ||
      info.size < 1 ||
      (await sha256(path.join(directory, entry.filename))) !== entry.sha256
    )
      throw new Error(`Installer integrity failure: ${entry.filename}`);
    if (entry.partsManifest != null) {
      if (entry.partsManifest !== partsManifestPath(entry.filename))
        throw new Error('Unsafe parts manifest path');
      const parts = await verifyParts(path.join(directory, ...entry.partsManifest.split('/')));
      verifiedParts.set(entry.filename, parts);
      if (
        parts.artifact.file !== entry.filename ||
        parts.artifact.bytes !== entry.bytes ||
        parts.artifact.sha256 !== entry.sha256
      )
        throw new Error('Parts differ from complete installer');
    } else if (entry.bytes >= GITHUB_ASSET_LIMIT)
      throw new Error('Oversized installer has no verified parts');
  }
  const first = report.artifacts[0];
  const expected = releaseNames(
    report.version,
    first.platform,
    first.architecture === 'x86_64' ? 'x64' : first.architecture,
  );
  if (
    report.artifacts.length !== expected.length ||
    expected.some((name) => !seen.has(name)) ||
    report.artifacts.some(
      (entry) => entry.platform !== first.platform || entry.architecture !== first.architecture,
    )
  )
    throw new Error('Incomplete or mixed installer set');
  const sums = [];
  for (const entry of report.artifacts) {
    sums.push(`${entry.sha256}  ${entry.filename}\n`);
    if (entry.partsManifest) {
      const parts = verifiedParts.get(entry.filename);
      sums.push(...parts.parts.map((part) => `${part.sha256}  ${part.file}\n`));
    }
  }
  for (const file of report.supportFiles || []) {
    if (
      !['TaskLens-reconstruct.sh', 'TaskLens-reconstruct.ps1', 'THIRD_PARTY_NOTICES.md'].includes(
        file.filename,
      ) ||
      seen.has(file.filename)
    )
      throw new Error('Unsafe support file');
    seen.add(file.filename);
    const target = path.join(directory, file.filename);
    const info = await lstat(target);
    if (!info.isFile() || info.size !== file.bytes || (await sha256(target)) !== file.sha256)
      throw new Error('Support file integrity failure');
    sums.push(`${file.sha256}  ${file.filename}\n`);
  }
  const checksums = await readFile(path.join(directory, 'SHA256SUMS'), 'utf8');
  if (checksums !== sums.join('')) throw new Error('Checksum file differs from release inventory');
  Object.defineProperty(report, 'verifiedParts', { value: verifiedParts });
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const report = await verifyInventory(
    path.resolve(process.argv[2] || 'src-tauri/target/release/distribution'),
  );
  console.info(
    `Verified ${report.artifacts.length} installer(s); native acceptance and publication are separate gates.`,
  );
}
