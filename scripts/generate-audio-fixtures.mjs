// Optional local decoder verification. Requires ffmpeg; never reads user audio.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const folder = path.resolve('.local-ai/codec-fixtures');
mkdirSync(folder, { recursive: true });
const source = path.join(folder, 'sample.wav');
execFileSync('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=1:sample_rate=48000',
  '-ac',
  '2',
  '-c:a',
  'pcm_s16le',
  source,
]);
for (const [name, codec] of [
  ['sample.mp3', 'libmp3lame'],
  ['sample-aac.m4a', 'aac'],
  ['sample-alac.m4a', 'alac'],
  ['sample.ogg', 'libvorbis'],
  ['unsupported.ogg', 'libopus'],
  ['unsupported.webm', 'libopus'],
]) {
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    source,
    '-c:a',
    codec,
    path.join(folder, name),
  ]);
}
console.info(`Synthetic decoder fixtures: ${folder}`);
