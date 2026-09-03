/**
 * The tree becomes columns.
 *
 * These are the rules a person has to agree with before any of the rest is
 * worth anything, so they are asserted one at a time and named in words rather
 * than bundled into a snapshot. A snapshot of fourteen column names goes green
 * again the moment somebody updates it, which is the opposite of what a test is
 * for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flatten, nameFor, choicesOf, questionsIn } from '../src/flatten/attributes.js';
import { AWKWARD, INTAKE_V1, INTAKE_V2 } from '../src/fixtures/forms.js';

const columns = (form) => flatten(form).attributes.map((one) => one.name);
const named = (form, name) => flatten(form).attributes.find((one) => one.name === name);

test('a name becomes a column by losing its punctuation and its accents', () => {
  assert.equal(nameFor('Peso (kg)'), 'Peso_kg');
  assert.equal(nameFor('Peso kg'), 'Peso_kg');
  assert.equal(nameFor('Età'), 'Eta');
  assert.equal(nameFor('  Date of birth  '), 'Date_of_birth');
  assert.equal(nameFor('???'), '');
});

test('a panel leaves no column of its own and its children are walked', () => {
  const names = columns(INTAKE_V1);

  assert.ok(!names.includes('Conditions'), 'the panel itself is layout');
  assert.ok(names.includes('Taking_medication'), 'and its children are questions');
  assert.equal(named(INTAKE_V1, 'Taking_medication').page, 'History');
});

test('a checkbox becomes one column per choice, named question.choice', () => {
  const names = columns(INTAKE_V1);

  assert.deepEqual(
    names.filter((one) => one.startsWith('Diagnosed_with')),
    ['Diagnosed_with.diabetes', 'Diagnosed_with.asthma', 'Diagnosed_with.hypertension']
  );

  const one = named(INTAKE_V1, 'Diagnosed_with.asthma');
  assert.equal(one.question, 'Diagnosed with');
  assert.equal(one.choice, 'asthma');
  assert.equal(one.type, 'boolean', 'each column is "did they tick it"');
});

test('a single-choice question is one column that remembers what was allowed', () => {
  const one = named(INTAKE_V1, 'Smoker');

  assert.equal(one.choice, null);
  assert.deepEqual(one.allowed, ['never', 'former', 'current']);
});

test('a matrix and a repeating group are taken out, not flattened', () => {
  const { attributes, doesNotFit } = flatten(INTAKE_V1);
  const names = attributes.map((one) => one.name);

  assert.ok(!names.some((one) => one.startsWith('Symptoms')), 'twelve answers are not a cell');
  assert.ok(!names.some((one) => one.startsWith('Previous')), 'and neither is a list of unknown length');

  assert.deepEqual(
    doesNotFit.map((one) => one.question).sort(),
    ['Previous surgery', 'Symptoms by week']
  );

  for (const one of doesNotFit) assert.ok(one.why.length > 0, `${one.question} says why`);
});

test('the nested kinds are taken out before the choice rules, not after', () => {
  // A matrix has `choices`. If the checkbox rule ran first it would produce
  // five columns called `Symptoms_by_week.1` and so on, each of them a lie.
  const names = columns(INTAKE_V1);
  assert.ok(!names.some((one) => one.startsWith('Symptoms_by_week.')));
});

test('version 2 adds a column, keeps the rest, and drops the withdrawn one', () => {
  const before = columns(INTAKE_V1);
  const after = columns(INTAKE_V2);

  assert.ok(!before.includes('Diagnosed_with.coeliac'));
  assert.ok(after.includes('Diagnosed_with.coeliac'));
  assert.ok(before.includes('How_easy_was_this_form'));
  assert.ok(!after.includes('How_easy_was_this_form'));
});

test('two questions that collide are both kept, and the collision is reported', () => {
  const { attributes, trouble } = flatten(AWKWARD);
  const names = attributes.map((one) => one.name);

  assert.ok(names.includes('Peso_kg'), 'the first keeps the name');
  assert.ok(names.includes('Peso_kg__2'), 'the second gets another, rather than the same');
  assert.ok(
    trouble.some((one) => one.includes('Peso_kg__2')),
    'and nothing is silent about it'
  );
});

test('a question that cannot become a column, and a kind nobody knows, are reported', () => {
  const { attributes, trouble } = flatten(AWKWARD);

  assert.ok(!attributes.some((one) => one.name === ''), 'no column with an empty name');
  assert.ok(trouble.some((one) => one.includes('???')), 'the punctuation-only name is reported');
  assert.ok(trouble.some((one) => one.includes('slider')), 'the unknown kind is reported');
});

test('a checkbox with no choices produces no columns and says so', () => {
  const { attributes, trouble } = flatten(AWKWARD);

  assert.ok(!attributes.some((one) => one.question === 'Pick some'));
  assert.ok(trouble.some((one) => one.includes('Pick some')));
});

test('choices are read whichever of the three ways they were written', () => {
  assert.deepEqual(choicesOf({ choices: ['a', 'b'] }).map((one) => one.value), ['a', 'b']);
  assert.deepEqual(choicesOf({ choices: [{ value: 'a', label: 'A' }] }).map((one) => one.label), ['A']);
  assert.deepEqual(
    choicesOf({ choices: [{ value: 'a', label: { en: 'A', it: 'A!' } }] }).map((one) => one.label),
    ['A']
  );
});

test('every question in the form is reached, including the nested ones', () => {
  const found = questionsIn(INTAKE_V1).map((one) => one.name);

  assert.ok(found.includes('Anything else'), 'inside a panel');
  assert.ok(found.includes('Symptoms by week'), 'and the ones that do not become columns');
});
