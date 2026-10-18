// Build-time only. Pin Tauri's otherwise mutable AppImage tool downloads before bundling.
import { readFileSync, chmodSync } from 'node:fs';
import { open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { root, prepare, verify } from './ai-assets.mjs';
if (process.platform === 'linux') {
  const pins = JSON.parse(readFileSync(path.join(root, 'scripts/linux-packaging-tools.json')));
  const cli = JSON.parse(
    readFileSync(path.join(root, 'node_modules/@tauri-apps/cli/package.json')),
  );
  if (process.arch !== 'x64' || cli.version !== pins.tauriCli)
    throw new Error('Update verified AppImage tool pins for this Tauri CLI/host before packaging');
  const xdg = process.env.XDG_CACHE_HOME;
  const cache = path.join(
    xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), '.cache'),
    'tauri',
  );
  for (const asset of pins.assets) {
    const file = path.join(cache, asset.file);
    if (asset.zeroedMagicSha256) {
      // Tauri zeroes bytes 8-10 (the AppImage magic) of its cached linuxdeploy on every bundle,
      // so accept that state; otherwise fetch the pinned upstream bytes and apply the same patch.
      const zeroed = { ...asset, sha256: asset.zeroedMagicSha256 };
      try {
        await verify(file, zeroed);
      } catch {
        await prepare(asset, file);
        const handle = await open(file, 'r+');
        try {
          await handle.write(Buffer.alloc(3), 0, 3, 8);
        } finally {
          await handle.close();
        }
        await verify(file, zeroed);
      }
    } else {
      await prepare(asset, file);
    }
    chmodSync(file, 0o755);
  }
  console.info(
    'Verified pinned AppImage packaging tools. Use the default Tauri tool-cache location.',
  );
}
