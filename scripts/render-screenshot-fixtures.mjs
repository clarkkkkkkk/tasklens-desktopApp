// Renders tests/fixtures/screenshots/screenshots.json into PNG screenshot fixtures with a
// local headless browser. Offline: system fonts only, no remote assets.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const folder = path.resolve('tests/fixtures/screenshots');
const fixtures = JSON.parse(readFileSync(path.join(folder, 'screenshots.json'), 'utf8'));
const escape = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function html(fixture) {
  const body =
    fixture.layout === 'chat'
      ? `<header>${escape(fixture.header)}</header>
         ${fixture.timestamp ? `<p class="stamp">${escape(fixture.timestamp)}</p>` : ''}
         ${fixture.messages
           .map(
             (m) =>
               `<p class="sender">${escape(m.sender)}</p><p class="bubble">${escape(m.text)}</p>`,
           )
           .join('')}`
      : fixture.sections
          .map(
            (s) =>
              `<section><h2>${escape(s.heading)}</h2>${s.lines.map((l) => `<p>${escape(l)}</p>`).join('')}</section>`,
          )
          .join('');
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; }
    main { width: 400px; padding: 16px; }
    header { font-weight: 600; font-size: 17px; padding-bottom: 12px; border-bottom: 1px solid #ddd; }
    .stamp { text-align: center; color: #666; font-size: 12px; margin: 14px 0 4px; }
    .sender { color: #666; font-size: 12px; margin: 12px 0 2px 12px; }
    .bubble { background: #ececf0; border-radius: 18px; padding: 9px 13px; margin: 0; font-size: 15px; line-height: 1.35; max-width: 300px; }
    section { border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    h2 { font-size: 16px; margin: 0 0 8px; }
    section p { margin: 4px 0; font-size: 14px; }
  </style><main>${body}</main>`;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { width: 432, height: 400 },
  });
  mkdirSync(folder, { recursive: true });
  for (const fixture of fixtures) {
    await page.setContent(html(fixture));
    await page.locator('main').screenshot({ path: path.join(folder, `${fixture.id}.png`) });
    console.info(`Rendered ${fixture.id}.png`);
  }
} finally {
  await browser.close();
}
