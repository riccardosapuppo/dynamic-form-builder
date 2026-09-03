/**
 * The questions all three stores are asked, and what each of them says.
 *
 * Seven questions. None of them is exotic; every one is something a person who
 * ran the form would ask in the first week. They are here in the order that
 * makes the point, which is roughly "things everybody gets right" and then
 * "things that separate them".
 *
 * ── What is being measured ──────────────────────────────────────────────────
 *
 * Not speed. Speed is the thing benchmarks measure because it is easy, and it
 * is not what makes a schema worth having. What is measured is **whether the
 * answer is right, and whether a wrong answer announces itself.**
 *
 * The second half is the whole reason for the exercise. A store that cannot
 * answer a question has told you something true, and you go and do it another
 * way. A store that answers `22` when the answer is `37`, in a query nobody can
 * fault, on data where nothing failed, has told you something false and given
 * you no reason to doubt it. Those are marked `quietly wrong`, and they are the
 * findings.
 *
 * ── The three verdicts ──────────────────────────────────────────────────────
 *
 *   `right`     the answer matches the truth computed in `truth.js`
 *   `wrong`     it does not, and nothing about the result says so
 *   `cannot`    the store has no way to express the question at all
 */

import {
  averageOf,
  howManyAnswered,
  howManyTicked,
  howManyWereOffered,
  whatCouldNotBePlaced,
} from '../answers/ask.ts';

import {
  averageAge,
  averageWeight,
  gaveDateOfBirth,
  offered,
  offeredHowEasy,
  straysGiven,
  ticked,
  wroteNotes,
} from './truth.ts';

/** Two averages are the same answer if they agree to three decimals. */
const round = (n: number | null | undefined): number | null | undefined =>
  n === null || n === undefined ? n : Math.round(n * 1000) / 1000;

const sameAverage = (a: Average, b: Average): boolean => a !== null && b !== null && round(a.average) === round(b.average) && a.of === b.of;

const say = (value: number | null, of?: number): string =>
  of === undefined ? String(value) : `${round(value)} over ${of}`;

import type { Documents } from '../blob/documents.ts';
import type { FlatWorld, Worlds } from './worlds.ts';

export type Verdict = {
  verdict: 'right' | 'wrong' | 'cannot';
  why?: string;
  said?: string;
  instead?: string;
};

export type Which = 'documents' | 'flat' | 'flatWithIds';
export type Tally = { right: number; wrong: number; cannot: number };

export type Row = { asks: string; matters: string; truth: string } & Record<Which, Verdict>;

/** The two shapes an answer takes: a count, or a mean over a denominator. */
export type Average = { average: number | null; of: number };
export type Answer = number | Average;

/** What a store says when the question cannot be put to it at all. */
export type Cannot = { cannot: string };

export type Asked<T extends Answer = Answer> = {
  asks: string;
  matters: string;
  truth: () => T;
  says: (value: T) => string;
  same: (a: T, b: T) => boolean;
  documents: (world: Documents) => T | Cannot;
  flat: (world: FlatWorld) => T | Cannot;
  flatWithIds?: (world: FlatWorld) => T | Cannot;
};

/**
 * One question, checked against its OWN answer type and then put in the list.
 *
 * The list holds counts and means together, so typing it directly would give
 * every `says` and every `same` the union of both — and the mean questions,
 * which read `.average` off their argument, would each need a cast saying
 * something the question already knows. This says it once instead.
 */
const asking = <T extends Answer>(one: Asked<T>): Asked => one as unknown as Asked;

export const QUESTIONS: Asked[] = [
  asking({
    asks: 'What is the mean age?',
    matters:
      'Nothing renamed it and nothing added it late. It is here because a comparison that only shows the failures of one side is an argument rather than a measurement — this is the row where the pile of documents is simply right.',
    truth: () => averageAge(),
    says: (r) => say(r.average, r.of),
    same: sameAverage,

    documents: (w) => w.average('"Eta"'),
    flat: (w) => averageOf(w.kept, w.formId, 'Eta'),
  }),

  asking({
    asks: 'How many ticked "coeliac disease"?',
    matters:
      'A checkbox is a set, and both stores can count one member of it. The documents need `json_each` and a correct guess about the shape; the columns need a `WHERE`. Both arrive at eight.',
    truth: () => ticked('coeliac'),
    says: (n) => String(n),
    same: (a, b) => a === b,

    documents: (w) => w.ticked('"Diagnosed with"', 'coeliac'),
    flat: (w) => howManyTicked(w.kept, w.formId, 'Diagnosed with', 'coeliac'),
  }),

  asking({
    asks: 'How many people were **offered** "coeliac disease"?',
    matters:
      'The denominator of the row above. Eight out of sixty is thirteen per cent and eight out of a hundred and twenty is seven, and only one of those is true — the question was added in version 2 and half the submissions never saw it. A document with no such key did not decline to tick it.',
    truth: () => offered('coeliac'),
    says: (n) => String(n),
    same: (a, b) => a === b,

    documents: () => ({
      cannot:
        'A missing key means "did not tick it" and "was never asked" and there is nothing in the document to tell them apart. The question cannot be written, so the eight above gets divided by a hundred and twenty.',
    }),

    flat: (w) => howManyWereOffered(w.kept, w.formId, 'Diagnosed_with.coeliac'),
  }),

  asking({
    asks: 'What is the mean weight?',
    matters:
      'The question was called `Peso (kg)`, then `Peso kg`, and six imports typed it with a word-processor hyphen. Three spellings, one question. The flattened store puts all hundred and twenty in one column because the naming rules make all three the same column name; the documents have three keys and a query naming one of them.',
    truth: () => averageWeight(),
    says: (r) => say(r.average, r.of),
    same: sameAverage,

    documents: (w) => w.average('"Peso (kg)"'),
    flat: (w) => averageOf(w.kept, w.formId, 'Peso_kg'),
  }),

  asking({
    asks: 'How many gave a date of birth?',
    matters:
      'The same shape of problem with none of the versioning: six submissions arrived with the header typed by hand, spaced and in lower case. The ladder normalises and finds it. A key lookup does not.',
    truth: () => gaveDateOfBirth(),
    says: (n) => String(n),
    same: (a, b) => a === b,

    documents: (w) => w.answered('"Date of birth"'),
    flat: (w) => howManyAnswered(w.kept, w.formId, 'Date_of_birth'),
  }),

  asking({
    asks: 'How many answers arrived for a question the form does not ask?',
    matters:
      'Twelve, from an old spreadsheet somebody re-imported. They are the answers most worth seeing and the easiest to lose: dropping them is one fewer row and no error anywhere. The flattened store cannot place them either — it writes down that it could not, and what they were called.',
    truth: () => straysGiven(),
    says: (n) => String(n),
    same: (a, b) => a === b,

    documents: () => ({
      cannot:
        'The documents keep every stray perfectly and have no idea any of them is a stray. Nothing here knows what the form asks, so there is nothing to be foreign to.',
    }),

    flat: (w) =>
      whatCouldNotBePlaced(w.kept, w.formId).reduce((n, row) => n + Number(row.n), 0),
  }),

  asking({
    asks: 'How many people wrote something in the notes?',
    matters:
      'The row this project exists for, and the one where the flattening on its own is **not enough**. `Anything else` became `Other notes` — the same question in different words, with nothing any rule could match on. Without an id it starts a second column and the answers split, exactly as they split across two keys in the documents. With an id on the question, the column is renamed and the thirty-seven stay together. The flattening does not fix versioning; it is what makes the id worth writing.',
    truth: () => wroteNotes(),
    says: (n) => String(n),
    same: (a, b) => a === b,

    documents: (w) => w.answered('"Anything else"'),
    flat: (w) => howManyAnswered(w.kept, w.formId, 'Anything_else'),
    flatWithIds: (w) => howManyAnswered(w.kept, w.formId, 'Other_notes'),
  }),

  asking({
    asks: 'How many people were asked "How easy was this form"?',
    matters:
      'Version 2 stopped asking it. The answers already given do not stop existing, and the question stays on the form as something that was asked until March — which is a different fact from nobody answering it.',
    truth: () => offeredHowEasy(),
    says: (n) => String(n),
    same: (a, b) => a === b,

    documents: () => ({
      cannot:
        'A document holds what somebody answered and never what they were shown. The withdrawn question leaves no trace beyond its own answers.',
    }),

    flat: (w) => howManyWereOffered(w.kept, w.formId, 'How_easy_was_this_form'),
  }),
];

/** Ask one store one question and judge the answer. */
function ask(
  question: Asked,
  how: ((world: never) => Answer | Cannot) | undefined,
  world: unknown
): { verdict: 'right' | 'wrong' | 'cannot'; why?: string; said?: string; instead?: string } {
  if (!how) return { verdict: 'cannot', why: 'not asked of this store' };

  let said: Answer | Cannot;

  try {
    said = (how as (world: unknown) => Answer | Cannot)(world);
  } catch (error) {
    // A store that throws has at least been honest about it, which is more than
    // the interesting failures manage.
    return { verdict: 'cannot', why: error instanceof Error ? error.message : String(error) };
  }

  if (said && typeof said === 'object' && 'cannot' in said) {
    return { verdict: 'cannot', why: said.cannot };
  }

  const truth = question.truth();

  return {
    verdict: question.same(said, truth) ? 'right' : 'wrong',
    said: question.says(said),
    instead: question.says(truth),
  };
}

/**
 * Every question, of every store.
 *
 * `flatWithIds` falls back to the `flat` asker, because the point of the ids is
 * that the *same query* returns a different answer. Only the notes question
 * overrides it, and only because without an id there is no column of that name
 * to ask about — which is itself the finding.
 */
export function measure(worlds: Worlds): Row[] {
  return QUESTIONS.map((question) => ({
    asks: question.asks,
    matters: question.matters,
    truth: question.says(question.truth()),

    documents: ask(question, question.documents, worlds.documents),
    flat: ask(question, question.flat, worlds.flat),
    flatWithIds: ask(question, question.flatWithIds ?? question.flat, worlds.flatWithIds),
  }));
}

/** The count of each verdict, per store. */
export function tally(rows: Row[]): Record<Which, Tally> {
  const empty = (): Tally => ({ right: 0, wrong: 0, cannot: 0 });
  const out: Record<Which, Tally> = { documents: empty(), flat: empty(), flatWithIds: empty() };

  for (const row of rows) {
    for (const which of Object.keys(out) as Which[]) out[which][row[which].verdict] += 1;
  }

  return out;
}
