// Build-time only. Pin Tauri's otherwise mutable AppImage tool downloads before bundling.
import { readFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, prepare } from './ai-assets.mjs';
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
    await prepare(asset, file);
    chmodSync(file, 0o755);
  }
  console.info(
    'Verified pinned AppImage packaging tools. Use the default Tauri tool-cache location.',
  );
}
