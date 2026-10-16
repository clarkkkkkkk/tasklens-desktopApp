import { manifest, root, prepare } from './ai-assets.mjs';
import path from 'node:path';
for (const kind of ['extraction', 'whisper']) {
  const spec = manifest[kind];
  await prepare(
    spec,
    path.join(root, 'src-tauri/resources/models', spec.file),
    path.join(root, '.local-ai/models', spec.file),
  );
}
for (const spec of manifest.tesseract.data)
  await prepare(spec, path.join(root, 'src-tauri/resources/tessdata', spec.file));
for (const spec of manifest.notices)
  await prepare(spec, path.join(root, 'src-tauri/resources/notices', spec.file));
console.info('Pinned models, OCR data and notices verified.');
