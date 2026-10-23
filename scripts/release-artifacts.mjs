// Final installer inventory. URLs are deliberately unset until a separately approved upload.
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
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
      distribution:
        info.size < 2 ** 31 ? 'github-or-approved-host' : 'approved-large-file-host-required',
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
    !report.artifacts.length
  )
    throw new Error('Invalid release inventory');
  const seen = new Set();
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
  }
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
