/**
 * Saving a version and filling in a submission.
 *
 * The two things asserted hardest: that nothing is ever lost, and that nothing
 * is ever *silently* lost. An answer that cannot be placed goes to `unplaced`
 * with the reason; a value of the wrong type goes there too, rather than into a
 * numeric column as a zero; and a matrix is kept whole rather than folded into
 * something column-shaped that is not true.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { store } from '../src/store/db.ts';
import {
  AWKWARD,
  INTAKE_V1,
  INTAKE_V1_IDS,
  INTAKE_V2_IDS,
  INTAKE_V2_RENAMED,
} from '../src/fixtures/forms.ts';

const FORM = 'Patient intake';

/** A store with version 1 saved, and version 2 as well if the test asks. */
function opened(v2?: boolean) {
  const kept = store();
  const first = kept.save(FORM, v2 ? INTAKE_V1_IDS : INTAKE_V1, { at: '2026-01-10' });
  // `!` on `second` at the call sites: every test that reads it passes `true`,
  // and a test that did not would fail on the line before.
  const second = v2 ? kept.save(FORM, INTAKE_V2_IDS, { at: '2026-03-20' }) : null;

  return { kept, first, second: second! };
}

test('saving a version reports what it did, in enough detail to show somebody', () => {
  const { kept } = opened();
  const said = kept.save(FORM, INTAKE_V1, { at: '2026-01-10' });

  assert.equal(said.number, 2, 'versions are numbered');
  assert.equal(said.doesNotFit.length, 2, 'and it says what did not fit');
  assert.deepEqual(said.added, [], 'nothing new, because it is the same definition');

  kept.close();
});

test('an attribute belongs to the form, so a second version reuses its columns', () => {
  const { kept, first, second } = opened(true);

  const columns = kept.run('SELECT COUNT(*) AS n FROM attributes WHERE form_id = ?', [first.formId])[0].n;

  assert.equal(Number(columns), 13, 'twelve from version 1, plus the one version 2 adds');
  assert.ok(second.added.includes('Diagnosed_with.coeliac'));

  kept.close();
});

test('a withdrawn question keeps its column and stops being offered', () => {
  const { kept, first, second } = opened(true);

  assert.ok(second.gone.includes('How_easy_was_this_form'));

  const still = kept.run('SELECT name FROM attributes WHERE form_id = ? AND name = ?', [
    first.formId,
    'How_easy_was_this_form',
  ]);

  assert.equal(still.length, 1, 'the column is still there');

  const offered = kept.run(
    `SELECT COUNT(*) AS n FROM version_attributes va
       JOIN attributes t ON t.id = va.attribute_id
      WHERE t.name = ? AND va.version_id = ?`,
    ['How_easy_was_this_form', second.versionId]
  )[0].n;

  assert.equal(Number(offered), 0, 'and version 2 does not offer it');

  kept.close();
});

test('every answer that can be placed is, and each says which rung found it', () => {
  const { kept, first } = opened();

  const said = kept.fill(first.formId, first.versionId, {
    Name: 'A',
    'Peso (kg)': 70,
    '  date of birth': '1990-01-01',
  });

  assert.equal(said.unplaced.length, 0);

  const how = kept.run('SELECT matched, COUNT(*) AS n FROM answers WHERE submission_id = ? GROUP BY matched', [
    said.submissionId,
  ]);

  const by = Object.fromEntries(how.map((r) => [r.matched, Number(r.n)]));

  assert.equal(by.exactly, 2, 'the name and the weight');
  assert.equal(by.normalised, 1, 'the hand-typed date');

  kept.close();
});

test('a word-processor hyphen is found by the loose rung', () => {
  const { kept, first } = opened();

  const said = kept.fill(first.formId, first.versionId, { 'Peso‐kg': 70 });

  assert.equal(said.unplaced.length, 0);

  const rows = kept.run(
    `SELECT t.name, a.matched FROM answers a
       JOIN attributes t ON t.id = a.attribute_id
      WHERE a.submission_id = ?`,
    [said.submissionId]
  );

  assert.deepEqual(rows.map((r) => [r.name, r.matched]), [['Peso_kg', 'loosely']]);

  kept.close();
});

test('an answer to a question the form does not ask is written down, not dropped', () => {
  const { kept, first } = opened();

  const said = kept.fill(first.formId, first.versionId, { 'Fiscal code': 'RSSMRA80A01H501U' });

  assert.equal(said.unplaced.length, 1);
  assert.equal(said.unplaced[0].called, 'Fiscal code');

  const rows = kept.run<{ called: string; raw: string; why: string }>(
    'SELECT called, raw, why FROM unplaced WHERE submission_id = ?',
    [said.submissionId]
  );

  assert.equal(rows.length, 1);
  assert.ok(rows[0]!.raw.includes('RSSMRA80A01H501U'), 'and the value is kept with it');
  assert.ok(rows[0]!.why.length > 0, 'and the reason');

  kept.close();
});

test('a value of the wrong type is not cast into the column as a zero', () => {
  const { kept, first } = opened();

  const said = kept.fill(first.formId, first.versionId, { 'Peso (kg)': 'about seventy' });

  assert.equal(said.wrongType.length, 1);

  const average = kept.run(
    `SELECT AVG(a.as_number) AS avg FROM answers a
       JOIN attributes t ON t.id = a.attribute_id
      WHERE t.name = 'Peso_kg'`
  )[0].avg;

  assert.equal(average, null, 'nothing reached the numeric column, so there is no average to be wrong');

  kept.close();
});

test('a matrix and a repeating group are kept whole, with the answer intact', () => {
  const { kept, first } = opened();

  const said = kept.fill(first.formId, first.versionId, {
    'Symptoms by week': { 'week 1': { pain: 3 } },
    'Previous surgery': { entries: [{ Operation: 'appendix', When: '2019-04-11' }] },
  });

  assert.equal(said.keptWhole.length, 2);

  const rows = kept.run<{ called: string; raw: string }>(
    'SELECT called, raw FROM kept_whole WHERE submission_id = ?',
    [said.submissionId]
  );

  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.raw.includes('appendix')), 'nothing about it is lost');

  kept.close();
});

test('a checkbox records every choice that was offered, not only the ticked ones', () => {
  const { kept, first } = opened();

  const said = kept.fill(first.formId, first.versionId, { 'Diagnosed with': ['asthma'] });

  const rows = kept.run(
    `SELECT t.choice, a.as_boolean FROM answers a
       JOIN attributes t ON t.id = a.attribute_id
      WHERE a.submission_id = ? AND t.question = 'Diagnosed with'
      ORDER BY t.choice`,
    [said.submissionId]
  );

  assert.equal(rows.length, 3, 'three choices were offered');

  assert.deepEqual(
    rows.map((r) => [r.choice, Number(r.as_boolean)]),
    [
      ['asthma', 1],
      ['diabetes', 0],
      ['hypertension', 0],
    ],
    'not ticked is a value; never asked is an absent row'
  );

  kept.close();
});

test('after a rename, answers given under the old name still find the column', () => {
  const { kept, first, second } = opened(true);

  const said = kept.fill(first.formId, first.versionId, { 'Anything else': 'something' });

  assert.equal(said.unplaced.length, 0, 'the old name still reaches it');

  const where = kept.run(
    'SELECT t.name FROM answers a JOIN attributes t ON t.id = a.attribute_id WHERE a.submission_id = ?',
    [said.submissionId]
  );

  assert.deepEqual(where.map((r) => r.name), ['Other_notes'], 'and it lands in the renamed column');
  assert.ok(second.renamed.some((r) => r.was === 'Anything_else' && r.now === 'Other_notes'));

  kept.close();
});

test('without an id the same rename splits the answers, and that is the honest result', () => {
  const kept = store();
  const first = kept.save(FORM, INTAKE_V1, { at: '2026-01-10' });
  kept.save(FORM, INTAKE_V2_RENAMED, { at: '2026-03-20' });

  const rows = kept.run(
    `SELECT name FROM attributes
      WHERE form_id = ? AND name IN ('Anything_else', 'Other_notes')
      ORDER BY name`,
    [first.formId]
  );

  assert.deepEqual(rows.map((r) => r.name), ['Anything_else', 'Other_notes'], 'two columns, one question');

  kept.close();
});

test('filling in never throws, however wrong the answers are', () => {
  const { kept, first } = opened();

  assert.doesNotThrow(() => kept.fill(first.formId, first.versionId, null));
  assert.doesNotThrow(() => kept.fill(first.formId, first.versionId, { Name: undefined, Smoker: 'sideways' }));

  kept.close();
});

test('a form whose questions collide is saved, with the trouble reported', () => {
  const kept = store();
  const said = kept.save(AWKWARD.name, AWKWARD, { at: '2026-02-01' });

  assert.ok(said.trouble.length >= 3, 'the collision, the unknown kind, the empty list');
  assert.ok(said.added.includes('Peso_kg__2'));

  kept.close();
});

test('the definition is kept whole, so what was actually saved is recoverable', () => {
  const { kept, first } = opened();

  const raw = kept.run<{ definition: string }>('SELECT definition FROM versions WHERE id = ?', [
    first.versionId,
  ])[0]!.definition;

  assert.deepEqual(JSON.parse(raw), INTAKE_V1, 'exactly the thing that was saved');

  kept.close();
});

test('ids added to a form that already has answers are learned, not ignored', () => {
  // The ordinary case, because nobody puts ids in a form definition until the
  // first rename has already gone wrong. The form here starts without them,
  // gains them in version 2, and renames a question in version 3.
  //
  // Before this worked, version 2 matched every question by column name, kept
  // none of the ids, and version 3 had nothing to match on — so the rename
  // started a second column and it looked exactly like ids not working.
  const kept = store();

  const first = kept.save(FORM, INTAKE_V1, { at: '2026-01-10' });
  kept.fill(first.formId, first.versionId, { 'Anything else': 'said before the ids' });

  kept.save(FORM, INTAKE_V1_IDS, { note: 'ids added, nothing else changed', at: '2026-02-01' });

  const learned = kept.run(
    'SELECT question_id FROM attributes WHERE form_id = ? AND name = ?',
    [first.formId, 'Anything_else']
  )[0].question_id;

  assert.equal(learned, 'q.anything-else', 'the id is on the column now');

  const third = kept.save(FORM, INTAKE_V2_IDS, { at: '2026-03-20' });

  assert.ok(
    third.renamed.some((one) => one.was === 'Anything_else' && one.now === 'Other_notes' && one.how === 'its id'),
    'and the rename in version 3 is matched by it'
  );

  const where = kept.run(
    `SELECT t.name FROM answers a
       JOIN attributes t ON t.id = a.attribute_id
      WHERE t.form_id = ?`,
    [first.formId]
  );

  assert.deepEqual(where.map((r) => r.name), ['Other_notes'], 'so the answer given before it all moved with it');

  kept.close();
});

test('an id already on a column is never overwritten by a different one', () => {
  // A column whose id changed is not this column with a new id. It is somebody
  // having reused a name, and taking the new id would merge two questions.
  const kept = store();

  const first = kept.save(FORM, INTAKE_V1_IDS, { at: '2026-01-10' });

  const reused = JSON.parse(JSON.stringify(INTAKE_V1_IDS));
  reused.pages[0].elements[0].id = 'q.somebody-else';

  kept.save(FORM, reused, { at: '2026-02-01' });

  const kept_id = kept.run('SELECT question_id FROM attributes WHERE form_id = ? AND name = ?', [
    first.formId,
    'Name',
  ])[0].question_id;

  assert.equal(kept_id, 'q.name', 'the id it was first given');

  kept.close();
});
