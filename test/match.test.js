/**
 * Putting an answer back with the question it answers.
 *
 * The ladder is allowed to be generous here — the alternative to a loose match
 * is a lost answer — and it has exactly one thing it must refuse: a loose key
 * that two different questions answer to. Guessing there puts one person's
 * answer under another person's question, which is worse than losing it,
 * because it is not visible anywhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flatten } from '../src/flatten/attributes.js';
import { index, loosely, normalised } from '../src/flatten/match.js';
import { AWKWARD, INTAKE_V1 } from '../src/fixtures/forms.js';

const finder = () => index(flatten(INTAKE_V1).attributes);

test('normalising folds case, spacing and accents; loosening also folds punctuation', () => {
  assert.equal(normalised('  Date OF birth '), normalised('date of birth'));
  assert.equal(normalised('Età'), normalised('eta'));

  assert.notEqual(normalised('Peso (kg)'), normalised('Peso kg'), 'normalising keeps the bracket');
  assert.equal(loosely('Peso (kg)'), loosely('Peso-kg'), 'loosening does not');
});

test('the dash a word processor makes is the same dash', () => {
  for (const dash of ['‐', '‑', '‒', '–', '—', '―', '−']) {
    assert.equal(loosely(`Peso${dash}kg`), loosely('Peso-kg'), `U+${dash.charCodeAt(0).toString(16)}`);
  }
});

test('an answer keyed by the question finds its column, and so does one keyed by the column', () => {
  const found = finder();

  assert.equal(found.find('Peso (kg)').found.name, 'Peso_kg');
  assert.equal(found.find('Peso_kg').found.name, 'Peso_kg');

  for (const both of ['Peso (kg)', 'Peso_kg']) assert.equal(found.find(both).how, 'exactly');
});

test('a hand-typed key finds it one rung down, and the rung is reported', () => {
  const found = finder();

  assert.equal(found.find('  date of birth').how, 'normalised');
  assert.equal(found.find('  date of birth').found.name, 'Date_of_birth');

  assert.equal(found.find('Peso‐kg').how, 'loosely');
  assert.equal(found.find('Peso‐kg').found.name, 'Peso_kg');
});

test('a key nothing answers to is refused, with a reason', () => {
  const said = finder().find('Fiscal code');

  assert.equal(said.found, null);
  assert.ok(said.why.includes('Fiscal code'), 'and the reason names it');
});

test('a loose key two questions answer to is refused rather than guessed', () => {
  // `Peso-kg` and `Peso kg` are two questions in this form. They loosen onto
  // the same key, and there is no honest way to choose between them.
  const found = index(flatten(AWKWARD).attributes);

  assert.ok(found.ambiguous.length > 0, 'the clash is known');

  const said = found.find('Peso—kg');

  assert.equal(said.found, null, 'so nothing is chosen');
  assert.ok(said.why.toLowerCase().includes('more than one'), 'and the reason says why');
});

test('an attribute is found by a name it used to have', () => {
  // What a rename leaves behind. Without this the answers given before the
  // rename have nowhere to go, and a rename handled perfectly still loses half
  // the data.
  const found = index([{ name: 'Other_notes', question: 'Other notes', alsoCalled: ['Anything else'] }]);

  assert.equal(found.find('Anything else').found.name, 'Other_notes');
  assert.equal(found.find('Anything else').how, 'exactly');
});

test('reaching one attribute twice is not a clash with itself', () => {
  const found = index([{ name: 'Peso_kg', question: 'Peso (kg)', alsoCalled: ['Peso kg', 'Peso (kg)'] }]);

  assert.deepEqual(found.ambiguous, []);
  assert.equal(found.find('Peso—kg').found.name, 'Peso_kg');
});
