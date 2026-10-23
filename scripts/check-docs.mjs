// Validate local Markdown targets without sending private repository content to a service.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter((f) => f.endsWith('.md'));
const failures = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const link = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^(?:[a-z]+:|\/\/)/i.test(link)) continue;
    if (!existsSync(path.resolve(path.dirname(file), decodeURIComponent(link))))
      failures.push(`${file}: missing local target ${link}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.info(`Validated local Markdown links in ${files.length} files.`);
