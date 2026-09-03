#!/usr/bin/env node
/**
 * The console, driven with a browser.
 *
 *     npm run check:screen
 *     npm run check:screen -- --show          with a visible browser
 *     npm run check:screen -- --against URL   against something already running
 *
 * The layer the others cannot reach. `npm test` says the parts work and
 * `npm run measure` says the answers are right — only this says that a person
 * can edit a definition and **watch the columns change under it**, save a
 * version and **see what the store decided**, and fill the form in and **see
 * every answer land or fail to**. Those three are what the project is for, and
 * none of them is a function anybody can call.
 *
 * ── Every button is checked against the thing that behaves ──────────────────
 *
 * The preset buttons carry what pressing them must produce — the service states
 * it, the page prints it, and this presses each one and compares against what
 * the page then shows. A button whose promise is checked against a number
 * somebody typed in two places is checked against nothing.
 *
 * It starts its own service on a port nothing else uses, so it can never go
 * green having driven a stranger's process.
 */

import { aBrowser } from './a-browser.mjs';
import { startTheService } from './with-the-service.mjs';

const show = process.argv.includes('--show');

let checks = 0;
let bad = 0;

function is(what, got, wanted, detail) {
  checks += 1;

  if (got === wanted) return console.log(`    ok    ${what}`);

  bad += 1;
  console.log(`    NO    ${what}\n            wanted ${JSON.stringify(wanted)}, got ${JSON.stringify(detail ?? got)}`);
}

function has(what, got, wanted) {
  checks += 1;

  if (String(got ?? '').toLowerCase().includes(String(wanted).toLowerCase())) {
    return console.log(`    ok    ${what}`);
  }

  bad += 1;
  console.log(`    NO    ${what}\n            wanted something containing ${JSON.stringify(wanted)}, got ${JSON.stringify(got)}`);
}

const say = (what) => console.log(`\n  ${what}`);

const service = await startTheService();
const { browser, channel } = await aBrowser({ headless: !show });
const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, reducedMotion: 'reduce' });

// Anything the page throws fails this even if every assertion passes: a screen
// that works while quietly throwing is a screen that stops working on the next
// browser.
const thrown = [];
page.on('pageerror', (error) => thrown.push(`threw: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') thrown.push(message.text());
});

const tally = (which) => page.locator(which).textContent();

/** Wait for the flattening to have caught up with the editor. */
const settled = () => page.waitForTimeout(450);

/**
 * Save, and wait for the answer to have been drawn.
 *
 * Waiting for [data-changes] to have any child at all was waiting for a card
 * that is drawn at startup and never removed, so it returned instantly and the
 * three checks after it read the page before the save had come back. They
 * failed, which was luck: a slower machine would have made them pass.
 */
/** The same, for the button that puts the store back. */
async function resetAndWait() {
  const before = await page.getAttribute('[data-changes]', 'data-drawn');

  await page.locator('[data-reset]').click();

  await page.waitForFunction(
    (was) => document.querySelector('[data-changes]').dataset.drawn !== was,
    before,
    { timeout: 10_000 }
  );
}

async function saveAndWait() {
  const before = await page.getAttribute('[data-changes]', 'data-drawn');

  await page.locator('[data-save]').click();

  await page.waitForFunction(
    (was) => document.querySelector('[data-changes]').dataset.drawn !== was,
    before,
    { timeout: 10_000 }
  );
}

try {
  console.log(`\n  driving ${service.base} through the screen`);

  await page.goto(`${service.base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.ready === 'yes', null, { timeout: 20_000 });

  // ── the page is the page ──────────────────────────────────────────────────
  say('the page');

  has('the title names the project', await page.title(), 'Dynamic Form Builder');
  is('the mark is drawn', await page.locator('svg[data-mark]').count(), 1);
  has('the thesis is on the page', await page.locator('.thesis').textContent(), 'tree');

  // ── every preset does what its button promises ────────────────────────────
  say('every preset does what its button says it will');

  const buttons = await page.locator('[data-preset]').all();

  is('there are presets to press', buttons.length > 0, true, buttons.length);

  for (const button of buttons) {
    const key = await button.getAttribute('data-preset');
    const wants = {
      columns: Number(await button.getAttribute('data-expect-columns')),
      notFit: Number(await button.getAttribute('data-expect-notfit')),
      trouble: Number(await button.getAttribute('data-expect-trouble')),
    };

    await button.click();
    await settled();

    const columns = await page.locator('[data-columns] tbody tr').count();
    const notFit = await page.locator('[data-notfit] .note').count();

    // The good note is the "everything became a column" one, which is not
    // trouble. Counting it as trouble would make the check pass on a page
    // that reported four problems where there are none.
    const trouble = await page.locator('[data-trouble] .note:not(.good)').count();

    is(`${key}: the columns it promised`, columns, wants.columns);
    is(`${key}: the questions that cannot be columns`, notFit, wants.notFit);
    is(`${key}: the trouble it promised`, trouble, wants.trouble);
  }

  // ── editing the tree moves the table ──────────────────────────────────────
  say('editing the definition moves the columns under it');

  await page.locator('[data-preset="v1"]').click();
  await settled();

  const before = await page.locator('[data-columns] tbody tr').count();

  await page.evaluate(() => {
    const editor = document.querySelector('[data-editor]');
    const definition = JSON.parse(editor.value);

    definition.pages[0].elements.push({ kind: 'text', name: 'Something new' });

    editor.value = JSON.stringify(definition, null, 2);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await settled();

  is('adding a question adds a column', await page.locator('[data-columns] tbody tr').count(), before + 1);
  // Looked up by name rather than by position. The first version read the
  // LAST row, and columns come out in page order -- so the new question, added
  // to the first page, was never going to be there.
  is(
    'and the column is named after it',
    await page.locator('[data-columns] tbody tr', { hasText: 'Something_new' }).count(),
    1
  );

  // ── a checkbox is several columns, and the page says so ───────────────────
  say('one question, several columns');

  await page.locator('[data-preset="v1"]').click();
  await settled();

  const ticked = await page.locator('[data-columns] tbody tr[data-question="Diagnosed with"]').count();
  is('the checkbox became one column per choice', ticked, 3);

  await page.locator('[data-columns] tbody tr[data-question="Diagnosed with"]').first().hover();
  is('hovering one of them lights all of them', await page.locator('[data-columns] tbody tr.lit').count(), 3);

  // ── invalid JSON says so, and does not clear the table ────────────────────
  say('a half-typed definition');

  await page.evaluate(() => {
    const editor = document.querySelector('[data-editor]');
    editor.value = '{ "pages": [';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await settled();

  is('the parse error is shown', await page.locator('[data-editor-bad]').isVisible(), true);
  is('and the columns are left alone rather than emptied', await page.locator('[data-columns] tbody tr').count(), 12);

  // ── saving a version, without ids ─────────────────────────────────────────
  say('saving version 2 over version 1, with no ids on the questions');

  await page.locator('[data-preset="v2renamed"]').click();
  await settled();
  await saveAndWait();

  const changes = await page.locator('[data-changes]').textContent();

  has('the new choice is a new column', changes, 'Diagnosed_with.coeliac');
  has('the renamed question is a new column as well', changes, 'Other_notes');
  has('and the old one is no longer asked', changes, 'Anything_else');
  has('nothing was matched as a rename', changes, 'nothing');

  // ── saving a version, with ids ────────────────────────────────────────────
  say('the same edit again, on definitions that give every question an id');

  await resetAndWait();

  await page.locator('[data-preset="v1ids"]').click();
  await settled();
  await saveAndWait();

  await page.locator('[data-preset="v2ids"]').click();
  await settled();
  await saveAndWait();

  const withIds = await page.locator('[data-changes]').textContent();

  has('now it is a rename', withIds, 'Anything_else');
  has('to the new name', withIds, 'Other_notes');
  has('and the page says what matched them', withIds, 'its id');

  // ── filling it in ─────────────────────────────────────────────────────────
  say('filling the form in');

  await resetAndWait();

  is('the form is rendered from the version the store is on', await page.locator('[data-form] .question').count() > 0, true);

  is(
    'the matrix and the repeating group are shown as what they are',
    await page.locator('[data-form] .wont-fit').count(),
    2
  );

  await page.fill('[data-form] [data-asks="Name"]', 'Someone');
  await page.fill('[data-form] [data-asks="Peso (kg)"]', '71.5');
  await page.locator('[data-form] input[type="checkbox"][value="asthma"]').check();

  await page.locator('[data-stray]').click();
  await page.locator('[data-fill]').click();
  await page.waitForFunction(() => document.querySelector('[data-landed] tbody').children.length > 0, null, {
    timeout: 10_000,
  });

  const landed = await page.locator('[data-landed]').textContent();

  has('the name landed in its column', landed, 'Name');
  has('the weight landed in the column with no bracket in it', landed, 'Peso_kg');
  has('the ticked choice landed', landed, 'Diagnosed_with.asthma');
  has('and so did the two nobody ticked', landed, 'Diagnosed_with.diabetes');

  const after = await page.locator('[data-aftermath]').textContent();

  has('the stray answer was written down rather than dropped', after, 'nothing in this form is called');
  is('and it says which one', (after ?? '').includes('Fiscal code') || (after ?? '').includes('Peso'), true, after);

  // ── the measurement is on the page ────────────────────────────────────────
  say('the measurement, on the page rather than only in a terminal');

  is('every question is a row', await page.locator('[data-measure] tbody tr').count(), 8);

  is(
    'the store with ids is right about all of them',
    await page.locator('[data-measure] tbody td .verdict.right').count() >= 8,
    true,
    await page.locator('[data-measure] tbody td .verdict.right').count()
  );

  has('the claim in the header is the claim in the table', await tally('[data-claim-figure]'), '8 of 8');

  const findings = await page.locator('.finding').count();
  is('the rows that went wrong are explained underneath', findings >= 4, true, findings);

  has(
    'including the one this project exists for',
    await page.locator('.findings').textContent(),
    'wrote something in the notes'
  );

  // ── nothing was thrown ────────────────────────────────────────────────────
  say('and the page was quiet while doing all that');

  is('nothing was thrown or logged as an error', thrown.length, 0, thrown);
} finally {
  await browser.close();
  await service.stop();
}

console.log(`\n  ${checks} checks, ${bad} of them failed\n`);
process.exit(bad ? 1 : 0);
