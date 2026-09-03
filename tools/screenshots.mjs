#!/usr/bin/env node
/**
 * The pictures in the README, made rather than taken.
 *
 *     npm run screenshots
 *
 * Nothing here photographs the screen. It starts its own service on its own
 * port, opens the console in a browser, drives it, and captures **the page** —
 * so whatever else happens to be on this machine cannot end up in a file about
 * to be pushed to a repository.
 *
 * Generated rather than kept by hand so they cannot quietly stop matching the
 * thing they are pictures of. Re-run whenever the console changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { aBrowser } from './a-browser.mjs';
import { startTheService } from './with-the-service.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.join(here, '..', 'docs');

fs.mkdirSync(DOCS, { recursive: true });

const service = await startTheService();
const { browser, channel } = await aBrowser();

console.log(`
Retaking the pictures in ${channel}
`);
const say = (name) => console.log(`  docs/${name}`);

try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1150 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });

  const drawn = () => page.getAttribute('[data-changes]', 'data-drawn');

  const after = async (was, act) => {
    await act();
    await page.waitForFunction(
      (before) => document.querySelector('[data-changes]').dataset.drawn !== before,
      was,
      { timeout: 15_000 }
    );
    await page.waitForTimeout(300);
  };

  const preset = async (key) => {
    await page.locator(`[data-preset="${key}"]`).click();
    await page.waitForTimeout(450);
  };

  await page.goto(`${service.base}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready === 'yes', null, { timeout: 20_000 });
  await page.waitForTimeout(600);

  // 1. The whole page.
  await page.screenshot({ path: path.join(DOCS, 'console.png'), fullPage: true });
  say('console.png');

  // 2. The gap itself: the definition on the left, the columns on the right,
  //    and the two questions that do not fit underneath. One picture of the
  //    sentence the whole project is.
  await page.locator('#gap .split').screenshot({ path: path.join(DOCS, 'the-gap.png') });
  say('the-gap.png');

  // 3. The form somebody typed in a hurry. Four kinds of trouble, all named —
  //    which is the difference between a tool and a tool you can trust.
  await preset('awkward');
  await page.locator('#gap .split').screenshot({ path: path.join(DOCS, 'in-a-hurry.png') });
  say('in-a-hurry.png');

  // 4. A rename with no ids: two columns, one question, and the answers split.
  await preset('v2renamed');
  await after(await drawn(), () => page.locator('[data-save]').click());
  await page.locator('[data-changes]').screenshot({ path: path.join(DOCS, 'without-an-id.png') });
  say('without-an-id.png');

  // 5. The same rename, on definitions that carry an id. One column, matched by
  //    the id, and every answer already given moves with it.
  await after(await drawn(), () => page.locator('[data-reset]').click());
  await preset('v1ids');
  await after(await drawn(), () => page.locator('[data-save]').click());
  await preset('v2ids');
  await after(await drawn(), () => page.locator('[data-save]').click());
  await page.locator('[data-changes]').screenshot({ path: path.join(DOCS, 'with-an-id.png') });
  say('with-an-id.png');

  // 6. Filling it in: every answer, the column it reached, and the rung that
  //    found it — including the one nothing could place.
  await after(await drawn(), () => page.locator('[data-reset]').click());

  await page.fill('[data-form] [data-asks="Name"]', 'Someone');
  await page.fill('[data-form] [data-asks="Peso (kg)"]', '71.5');
  await page.fill('[data-form] [data-asks="Età"]', '34');
  await page.locator('[data-form] input[type="checkbox"][value="asthma"]').check();
  await page.locator('[data-form] input[type="checkbox"][value="diabetes"]').check();
  await page.locator('[data-stray]').click();

  await page.locator('[data-fill]').click();
  await page.waitForFunction(() => document.querySelector('[data-landed] tbody').children.length > 0, null, {
    timeout: 15_000,
  });
  await page.waitForTimeout(300);

  await page.locator('#filling .split').screenshot({ path: path.join(DOCS, 'where-it-landed.png') });
  say('where-it-landed.png');

  // 7. The measurement. The one picture that is an argument rather than a
  //    screenshot: three stores, eight questions, and the rows where a wrong
  //    answer came back without complaining.
  await page.locator('#measurement').screenshot({ path: path.join(DOCS, 'the-measurement.png') });
  say('the-measurement.png');

  // 8. The mark, at the sizes it is actually seen.
  const mark = await browser.newPage({ viewport: { width: 320, height: 96 }, deviceScaleFactor: 4 });
  const svg = fs.readFileSync(path.join(here, '..', 'public', 'mark.svg'), 'utf8');

  await mark.setContent(
    `<style>html,body{margin:0;background:#f2f5f4;display:flex;gap:18px;align-items:center;
       justify-content:center;height:96px}img{display:block}</style>` +
      [16, 32, 64]
        .map(
          (size) =>
            `<img src="data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}" width="${size}" height="${size}">`
        )
        .join('')
  );

  await mark.waitForFunction(() => [...document.images].every((one) => one.complete));
  await mark.screenshot({ path: path.join(DOCS, 'the-mark.png') });
  say('the-mark.png');
  await mark.close();

  await page.close();
} catch (error) {
  console.error(`\nThe pictures could not be retaken: ${error.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await service.stop();
}
