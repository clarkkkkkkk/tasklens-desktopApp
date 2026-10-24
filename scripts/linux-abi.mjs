import { execFileSync } from 'node:child_process';
import { openSync, closeSync, readSync, lstatSync } from 'node:fs';

// Matches the Ubuntu 24.04 release runner. This is a necessary compatibility
// gate, not a substitute for clean Ubuntu/Fedora installation and runtime tests.
export const LINUX_GLIBC_BASELINE = '2.39';

export function assertLinuxGlibcVersions(versionInfo) {
  if (/\bGLIBC_PRIVATE\b/.test(versionInfo))
    throw new Error('Linux release binary requires private glibc symbols');
  const versions = [
    ...new Set([...versionInfo.matchAll(/\bGLIBC_(\d+(?:\.\d+)+)\b/g)].map((m) => m[1])),
  ];
  const newer = (version) => {
    const value = version.split('.').map(Number);
    const baseline = LINUX_GLIBC_BASELINE.split('.').map(Number);
    for (let i = 0; i < Math.max(value.length, baseline.length); i++) {
      const difference = (value[i] ?? 0) - (baseline[i] ?? 0);
      if (difference) return difference > 0;
    }
    return false;
  };
  const unsupported = versions.filter(newer);
  if (unsupported.length)
    throw new Error(
      `Linux release requires glibc ${unsupported.join(', ')}; rebuild the application and sidecars on the Ubuntu 24.04 baseline (maximum ${LINUX_GLIBC_BASELINE})`,
    );
  return versions;
}

export function auditLinuxBinary(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error('Expected a regular Linux executable');
  const fd = openSync(file, 'r');
  const header = Buffer.alloc(20);
  try {
    if (readSync(fd, header, 0, header.length, 0) !== header.length)
      throw new Error('Truncated Linux executable');
  } finally {
    closeSync(fd);
  }
  if (
    header.toString('hex', 0, 4) !== '7f454c46' ||
    header[4] !== 2 ||
    header[5] !== 1 ||
    header.readUInt16LE(18) !== 62
  )
    throw new Error('Linux release requires an x86_64 ELF executable');
  const info = execFileSync('readelf', ['--version-info', '--wide', file], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    maxBuffer: 8 * 1024 * 1024,
  });
  return assertLinuxGlibcVersions(info);
}
