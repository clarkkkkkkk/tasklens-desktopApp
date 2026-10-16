import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, manifest } from './ai-assets.mjs';
const destination = path.join(root, 'src-tauri/resources/notices/dependencies');
mkdirSync(destination, { recursive: true });
const report = [];
function collect(dir, name, version, license, ecosystem, source) {
  const target = path.join(destination, ecosystem, `${name}-${version}`);
  mkdirSync(target, { recursive: true });
  const files = readdirSync(dir).filter((f) =>
    /^(licen[sc]e|copying|notice|copyright|authors)([.\-_]|$)/i.test(f),
  );
  for (const f of files) cpSync(path.join(dir, f), path.join(target, f), { recursive: true });
  const supplemental =
    manifest.dependencyNotices
      ?.filter((g) => g.packages.includes(name))
      .flatMap((g) => g.notices) || [];
  for (const spec of supplemental) {
    cpSync(path.join(root, 'src-tauri/resources/notices', spec.file), path.join(target, spec.file));
    files.push(spec.file);
  }
  if (!files.length) {
    // Some published packages carry licensing only in their metadata/source. Preserve it
    // verbatim alongside common license terms and the source/repository inventory.
    for (const file of [
      'Cargo.toml',
      'package.json',
      'README.md',
      'README',
      'lib.rs',
      'src/lib.rs',
    ]) {
      try {
        const label = file.replaceAll('/', '__');
        cpSync(path.join(dir, file), path.join(target, label));
        files.push(label);
      } catch {
        /* absent */
      }
    }
  }
  report.push({ ecosystem, name, version, license, source, noticeFiles: files });
}
const metadata = JSON.parse(
  execFileSync(
    'cargo',
    [
      'metadata',
      '--locked',
      '--format-version',
      '1',
      '--manifest-path',
      path.join(root, 'src-tauri/Cargo.toml'),
    ],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ),
);
for (const p of metadata.packages)
  collect(
    path.dirname(p.manifest_path),
    p.name,
    p.version,
    p.license,
    'cargo',
    p.repository || `https://crates.io/crates/${p.name}/${p.version}`,
  );
function npm(dir) {
  for (const f of readdirSync(dir)) {
    if (f.startsWith('.')) continue;
    const folder = path.join(dir, f);
    if (!statSync(folder).isDirectory()) continue;
    if (f.startsWith('@')) {
      npm(folder);
      continue;
    }
    try {
      const p = JSON.parse(readFileSync(path.join(folder, 'package.json')));
      collect(
        folder,
        p.name.replaceAll('/', '__'),
        p.version,
        p.license,
        'npm',
        p.repository?.url || `https://www.npmjs.com/package/${p.name}/v/${p.version}`,
      );
    } catch {
      /* non-package folder */
    }
  }
}
npm(path.join(root, 'node_modules'));
for (const folder of readdirSync(path.join(root, '.local-ai/sources'))) {
  const dir = path.join(root, '.local-ai/sources', folder, 'licenses');
  try {
    cpSync(dir, path.join(destination, 'runtime-vendors', folder), { recursive: true });
  } catch {
    /* no supplementary notices */
  }
}
// Include common terms for packages that publish only SPDX metadata/source headers.
for (const spec of manifest.notices.filter((s) => /(?:tesseract|llama.cpp)-LICENSE/.test(s.file)))
  cpSync(
    path.join(root, 'src-tauri/resources/notices', spec.file),
    path.join(destination, spec.file),
  );
if (process.platform === 'linux') {
  // AppImage tooling may bundle host shared libraries. Preserve the host's license corpus
  // rather than assuming Rust/npm notices cover native system libraries too.
  try {
    cpSync('/usr/share/licenses', path.join(destination, 'linux-system-licenses'), {
      recursive: true,
    });
  } catch {
    console.warn(
      'No host license corpus found; audit AppImage system-library notices before distribution.',
    );
  }
}
writeFileSync(path.join(destination, 'index.json'), JSON.stringify(report, null, 2) + '\n');
console.info(`Collected notices for ${report.length} dependencies.`);
