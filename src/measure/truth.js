/**
 * The right answers, worked out in plain JavaScript over the submissions.
 *
 * Not a query. Not a `SELECT` against either store, not a helper from
 * `src/answers/`, nothing that could be wrong in the same way the thing being
 * measured is wrong. Every function here loops over `SUBMISSIONS` — the array
 * the fixtures produced, before anything stored it — and counts.
 *
 * That is the entire discipline of this file, and it is the reason the
 * measurement is worth reading. A benchmark whose expected answer comes out of
 * the system under test measures nothing at all; it agrees with itself and
 * prints a row of ticks. If the flattening and the truth are both wrong here,
 * they have to be wrong independently and identically, and that is a great deal
 * less likely than one of them being wrong on its own.
 *
 * The one thing the loops are allowed to know is the fixture's own vocabulary —
 * that the notes question is called `Anything else` and that version 2 renames
 * it. Somebody reading the fixture knows that too. It is the shape of the data
 * as a person understands it, which is precisely what the stores are being
 * asked to preserve.
 */

import { SUBMISSIONS } from '../fixtures/submissions.js';

const answered = (value) => value !== undefined && value !== null && String(value).trim() !== '';

/**
 * How many people wrote something in the free-text notes.
 *
 * The question is `Anything else` in version 1 and `Other notes` in version 2,
 * and it is one question. A person counting by hand would count both, without
 * hesitating, which is the whole argument.
 */
export function wroteNotes() {
  return SUBMISSIONS.filter((one) => answered(one.answers['Anything else'])).length;
}

/** The mean weight, over everybody who gave one. */
export function averageWeight() {
  const weights = SUBMISSIONS.map((one) => one.truth.weight);
  return { average: weights.reduce((a, b) => a + b, 0) / weights.length, of: weights.length };
}

/** The mean age, which nothing renamed and nothing should get wrong. */
export function averageAge() {
  const ages = SUBMISSIONS.map((one) => one.truth.age);
  return { average: ages.reduce((a, b) => a + b, 0) / ages.length, of: ages.length };
}

/** How many ticked one condition. */
export function ticked(choice) {
  return SUBMISSIONS.filter((one) => one.truth.conditions.includes(choice)).length;
}

/**
 * How many were **offered** a condition, which is the question underneath the
 * one above.
 *
 * `coeliac` arrived in version 2. Eight people ticked it, and the honest
 * denominator is the sixty who were shown it rather than the hundred and twenty
 * who filled in the form. Thirteen per cent or seven — one of those is a
 * finding and the other is an artefact of when the question was added.
 */
export function offered(choice) {
  return SUBMISSIONS.filter((one) => (choice === 'coeliac' ? one.onV2 : true)).length;
}

/** How many were asked a question that version 2 withdrew. */
export function offeredHowEasy() {
  return SUBMISSIONS.filter((one) => !one.onV2).length;
}

/** How many gave a date of birth, however the key was typed. */
export function gaveDateOfBirth() {
  return SUBMISSIONS.filter(
    (one) => answered(one.answers['Date of birth']) || answered(one.answers['  date of birth'])
  ).length;
}

/**
 * How many answers arrived for something the form does not ask.
 *
 * Counted as answers rather than submissions, because that is what has to be
 * kept: each one is a value somebody entered that no column can hold, and the
 * useful output is a list of them with what they were called.
 */
export function straysGiven() {
  const known = new Set([
    'Name',
    'Date of birth',
    '  date of birth',
    'Età',
    'Eta',
    'Peso (kg)',
    'Peso kg',
    'Peso‐kg',
    'Smoker',
    'Diagnosed with',
    'Taking medication',
    'Anything else',
    'Other notes',
    'Agrees to be contacted',
    'Symptoms by week',
    'Previous surgery',
    'How easy was this form',
  ]);

  let n = 0;

  for (const one of SUBMISSIONS) {
    for (const key of Object.keys(one.answers)) if (!known.has(key)) n += 1;
  }

  return n;
}

/** How many submissions there are, so a wrong denominator is visible. */
export function howMany() {
  return SUBMISSIONS.length;
}
