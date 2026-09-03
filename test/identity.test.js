/**
 * Deciding whether the new version is asking a question the form already had.
 *
 * The opposite discipline from `match.test.js`: here a wrong match is two
 * questions sharing one column and two people's answers in the same cell, and
 * there is no way to unpick it afterwards. So there is no loose rung, and both
 * of the bugs this file was written after were the same mistake — a comparison
 * that did not look at the part that told two attributes apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flatten } from '../src/flatten/attributes.js';
import { sameQuestionAs, whatChanged } from '../src/flatten/identity.js';
import {
  INTAKE_V1,
  INTAKE_V1_IDS,
  INTAKE_V2,
  INTAKE_V2_IDS,
  INTAKE_V2_RENAMED,
} from '../src/fixtures/forms.js';

/** What the store holds: the flattened attributes, as rows. */
const asKnown = (form) =>
  flatten(form).attributes.map((one, id) => ({ ...one, id: id + 1, question_id: one.id ?? null }));

const changed = (before, after) => whatChanged(asKnown(before), flatten(after).attributes);

const names = (list) => list.map((one) => one.name).sort();

test('a question the form already has is the same question, not a new one', () => {
  const said = changed(INTAKE_V1, INTAKE_V2);

  assert.ok(names(said.same).includes('Smoker'));
  assert.ok(!names(said.added).includes('Smoker'));
});

test('a spelling change that lands on the same column is the same column', () => {
  // `Peso (kg)` and `Peso kg` both become `Peso_kg`, so this is a rename that
  // the naming rules absorb entirely — no id needed, nothing lost.
  const said = changed(INTAKE_V1, INTAKE_V2);

  assert.ok(names(said.same).includes('Peso_kg'));
  assert.equal(said.renamed.length, 0, 'nothing was renamed, because nothing had to be');
});

test('a new choice on an existing checkbox is a new column, not a rename', () => {
  // The first bug. Every column of a checkbox carries the question `Diagnosed
  // with`, so matching by question alone made `coeliac` a rename of `asthma`.
  const said = changed(INTAKE_V1, INTAKE_V2);

  assert.deepEqual(names(said.added), ['Diagnosed_with.coeliac']);
  assert.equal(said.renamed.length, 0);
});

test('and neither is it, when every column of that checkbox shares an id', () => {
  // The second bug, the same shape one level up. An id belongs to a question,
  // and a checkbox question is four attributes with one id between them.
  const said = changed(INTAKE_V1_IDS, INTAKE_V2_IDS);

  assert.ok(names(said.added).includes('Diagnosed_with.coeliac'));

  for (const one of said.renamed) {
    assert.ok(!one.now.name.startsWith('Diagnosed_with.'), `${one.was.name} -> ${one.now.name} is not a rename`);
  }
});

test('without an id, a question renamed in words is a new column', () => {
  // Not a failure of the code. There is nothing in `Anything else` and `Other
  // notes` for any rule to match on, and inventing one would be worse.
  const said = changed(INTAKE_V1, INTAKE_V2_RENAMED);

  assert.ok(names(said.added).includes('Other_notes'));
  assert.ok(names(said.withdrawn).includes('Anything_else'));
});

test('with an id, the same rename keeps the column and its answers', () => {
  const said = changed(INTAKE_V1_IDS, INTAKE_V2_IDS);

  const one = said.renamed.find((r) => r.now.name === 'Other_notes');

  assert.ok(one, 'it is a rename');
  assert.equal(one.was.name, 'Anything_else');
  assert.equal(one.how, 'its id');
  assert.ok(!names(said.withdrawn).includes('Anything_else'), 'so nothing is withdrawn');
});

test('a question the new version stops asking is withdrawn, never deleted', () => {
  for (const [before, after] of [
    [INTAKE_V1, INTAKE_V2],
    [INTAKE_V1_IDS, INTAKE_V2_IDS],
  ]) {
    assert.ok(names(whatChanged(asKnown(before), flatten(after).attributes).withdrawn).includes('How_easy_was_this_form'));
  }
});

test('the rungs are reported, so a screen can say how it decided', () => {
  const known = asKnown(INTAKE_V1_IDS);

  const byId = sameQuestionAs(known, { id: 'q.smoker', name: 'Whatever', question: 'Whatever', choice: null });
  assert.equal(byId.how, 'its id');

  const byName = sameQuestionAs(known, { name: 'Smoker', question: 'Something else', choice: null });
  assert.equal(byName.how, 'the same column name');

  const byQuestion = sameQuestionAs(known, { name: 'Other', question: 'smoker', choice: null });
  assert.equal(byQuestion.how, 'the same question');

  assert.equal(sameQuestionAs(known, { name: 'Nothing', question: 'Nothing', choice: null }).found, null);
});
