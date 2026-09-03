/**
 * The measurement, and the honesty of the measurement.
 *
 * Two different things are asserted here and the second matters more.
 *
 * The first is the claim: the flattened store with ids answers all eight
 * questions correctly. If that ever stops being true this project's README is
 * wrong, and a README that can go stale without anything failing is a leaflet.
 *
 * The second is that the comparison is not rigged. A benchmark whose expected
 * answers come out of the thing being measured agrees with itself and prints a
 * row of ticks, so `truth.js` is checked here for importing nothing from
 * `src/store/`, `src/blob/` or `src/answers/` — and the document store is
 * checked for being right about the things it *is* right about, because a
 * comparison that only shows one side losing is an argument.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildWorlds, closeWorlds } from '../src/measure/worlds.ts';
import { measure, tally, QUESTIONS } from '../src/measure/questions.ts';
import type { Which } from '../src/measure/questions.ts';
import type { FlatWorld } from '../src/measure/worlds.ts';
import { averageWeight, howMany, straysGiven, wroteNotes } from '../src/measure/truth.ts';

/** One set of worlds, built once — they are identical every time by construction. */
const worlds = buildWorlds();
const rows = measure(worlds);
const counts = tally(rows);

test.after(() => closeWorlds(worlds));

/** One row by a fragment of its question. The `!` is the test knowing it is there. */
const row = (fragment: string) => rows.find((one) => one.asks.includes(fragment))!;

test('the claim: the flattened store with ids gets every question right', () => {
  const wrong = rows.filter((one) => one.flatWithIds.verdict !== 'right');

  assert.deepEqual(
    wrong.map((one) => `${one.asks} — said ${one.flatWithIds.said}, answer ${one.flatWithIds.instead}`),
    []
  );
});

test('the three stores are asked the same questions, and there are enough of them', () => {
  assert.ok(QUESTIONS.length >= 8, 'a comparison over three questions proves nothing');

  for (const one of QUESTIONS) {
    assert.ok(one.asks.endsWith('?'), `${one.asks} is a question`);
    assert.ok(one.matters.length > 80, `${one.asks} says why it matters`);
  }
});

test('the truth is computed without touching either store', () => {
  const source = readFileSync(new URL('../src/measure/truth.ts', import.meta.url), 'utf8');

  // What it IMPORTS, not what it mentions.
  //
  // The first version searched the whole file, and failed on the sentence in
  // truth.js's own header explaining that it does not use src/answers/. A
  // check that matches its own documentation would also have gone on passing
  // once somebody deleted that sentence and added the import.
  const lines = source.split('\n').map((one) => one.trim());

  const imports = lines
    .filter((one) => one.startsWith('import '))
    .map((one) => one.split("'")[1] ?? one.split('"')[1]);

  assert.deepEqual(imports, ['../fixtures/submissions.ts'], 'the fixtures, and nothing else');

  const code = lines.filter((one) => !one.startsWith('*') && !one.startsWith('/*') && !one.startsWith('//'));

  for (const forbidden of ['SELECT ', 'sqlite', '.run(', 'kept.']) {
    assert.ok(
      !code.some((one) => one.includes(forbidden)),
      `truth.js must not reach for ${forbidden}`
    );
  }
});

test('the truth is what a person counting by hand would count', () => {
  // Spot-checked against the fixture rather than against a query, which is the
  // whole point — if this and the flattening are both wrong they have to be
  // wrong independently and identically.
  assert.equal(howMany(), 120);
  assert.equal(wroteNotes(), 37, 'across both names the question has had');
  assert.equal(averageWeight().of, 120, 'every weight, not the ones under one key');
  assert.equal(straysGiven(), 12);
});

test('the pile of documents is right about the things it is right about', () => {
  assert.equal(row('mean age').documents.verdict, 'right');
  assert.equal(row('coeliac disease"?').documents.verdict, 'right', 'it can count a checkbox');

  assert.ok(counts.documents.right >= 2, 'this is a measurement, not a case for the prosecution');
});

test('the pile of documents is quietly wrong where a rename or a typo went through', () => {
  for (const which of ['mean weight', 'date of birth', 'wrote something in the notes']) {
    const said = row(which).documents;

    assert.equal(said.verdict, 'wrong', which);
    assert.ok(said.said !== said.instead, 'and the number it gives is a plausible one');
  }
});

test('the pile of documents cannot express three of the questions at all', () => {
  for (const which of ['were **offered**', 'does not ask', 'were asked "How easy']) {
    const said = row(which).documents;

    assert.equal(said.verdict, 'cannot', which);
    assert.ok((said.why ?? '').length > 40, 'and says what is missing rather than erroring');
  }
});

test('flattening alone fixes the typos and the spelling changes', () => {
  for (const which of ['mean weight', 'date of birth', 'were **offered**', 'does not ask']) {
    assert.equal(row(which).flat.verdict, 'right', which);
  }
});

test('flattening alone does NOT fix a rename, and the measurement says so', () => {
  // The row this project exists for. Without an id there is nothing for any
  // rule to match on, so the answers split into two columns exactly as they
  // split across two keys in the documents.
  const notes = row('wrote something in the notes');

  assert.equal(notes.flat.verdict, 'wrong');
  assert.equal(notes.flat.said, notes.documents.said, 'wrong in precisely the same way');
  assert.equal(notes.flatWithIds.verdict, 'right', 'and the id is what fixes it');
});

test('the three stores are given identical input', () => {
  const documents = Number(worlds.documents.run('SELECT COUNT(*) AS n FROM documents')[0].n);

  for (const world of [worlds.flat, worlds.flatWithIds]) {
    const filled = Number(
      world.kept.run('SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?', [world.formId])[0].n
    );

    assert.equal(filled, documents, 'the same submissions, in the same order');
  }

  assert.equal(documents, howMany());
});

test('the two flattened worlds differ only by the ids in the definitions', () => {
  // If they differed anywhere else, the row above would be measuring something
  // other than what it claims to measure.
  const columns = (world: FlatWorld): string[] =>
    world.kept
      .run<{ name: string }>('SELECT name FROM attributes WHERE form_id = ? ORDER BY name', [
        world.formId,
      ])
      .map((r) => r.name);

  const without = columns(worlds.flat);
  const with_ = columns(worlds.flatWithIds);

  assert.deepEqual(
    without.filter((one) => !with_.includes(one)),
    ['Anything_else'],
    'the only column the id world does not have is the one it renamed away'
  );

  assert.deepEqual(with_.filter((one) => !without.includes(one)), [], 'and it invents nothing');
});

test('the tallies add up to the number of questions, for every store', () => {
  for (const which of Object.keys(counts) as Which[]) {
    const c = counts[which];
    assert.equal(c.right + c.wrong + c.cannot, rows.length, which);
  }
});
