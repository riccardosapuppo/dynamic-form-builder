/**
 * Deciding whether two versions of a form are asking the same question.
 *
 * This is a different problem from `match.js`, and conflating the two was a
 * real bug rather than a hypothetical one. `match.js` puts an **answer** back
 * with the question it answers, and is allowed to be generous, because the
 * alternative is losing the answer. This decides whether a question in the new
 * version **is** one the form already had, and being generous here merges two
 * questions into one column and puts two people's answers in the same place.
 *
 * ── What went wrong when they were the same code ─────────────────────────────
 *
 * Every column of a checkbox carries the same question name — `Diagnosed with`
 * — and differs only by its choice. A ladder that indexes by question therefore
 * matched the newly added `coeliac` column against the existing `asthma` one
 * and reported a rename that had not happened. Two columns, one question, and a
 * comparison that never looked at the part that told them apart.
 *
 * ── The three rungs, in order ────────────────────────────────────────────────
 *
 * **By id.** A question that carries an id is the same question as one with
 * that id, whatever either of them is called. This is the only rung that
 * survives an actual rename, and it is the reason to write ids into a form
 * definition at all.
 *
 * **By column name.** Two questions that flatten to the same column are the
 * same question — which is more often than it sounds, since `Peso (kg)` and
 * `Peso kg` both become `Peso_kg`.
 *
 * **By question, and by choice where there is one.** The last resort, and the
 * rung where the checkbox bug lived.
 *
 * There is deliberately no loose rung. `match.js` has one because an unmatched
 * answer is a loss; here an unmatched question is a new column, which is
 * recoverable — and a wrongly matched one is two questions sharing a column,
 * which is not.
 */

import { normalised } from './match.ts';
import type { Attribute } from './attributes.ts';

/**
 * An attribute as the STORE holds it, which is not the same shape flatten
 * produces: the id arrives as `question_id`, and there is a row id.
 */
export type KnownAttribute = {
  id: number;
  name: string;
  question: string;
  question_id: string | null;
  choice: string | null;
  [more: string]: unknown;
};

export type SameQuestion =
  | { found: KnownAttribute; how: 'its id' | 'the same column name' | 'the same question' }
  | { found: null; how: null };

export type WhatChanged = {
  added: Attribute[];
  renamed: Array<{ was: KnownAttribute; now: Attribute; how: string }>;
  same: Attribute[];
  withdrawn: KnownAttribute[];
};

/**
 * The existing attribute this one is a new version of, or null.
 *
 * @param known      attributes the form already has
 * @param attribute  one produced by flattening the new version
 */
export function sameQuestionAs(known: KnownAttribute[], attribute: Attribute): SameQuestion {
  // ── by id, and by choice where there is one ──────────────────────────────
  //
  // An id belongs to a QUESTION, and a checkbox question is several
  // attributes — one per choice, all carrying the same id. Matching on the id
  // alone therefore matched every choice column of version 2 against the first
  // choice column of version 1, renamed it four times over, and ended in a
  // unique-constraint failure.
  //
  // That is the same mistake as the one two rungs down, one level up: a
  // comparison that never looked at the part that tells them apart. It is
  // written twice here on purpose, because the two rungs are reached
  // separately and fixing one would have left the other.
  if (attribute.id) {
    const byId = known.find(
      (one) => one.question_id && one.question_id === attribute.id && (one.choice ?? null) === (attribute.choice ?? null)
    );

    if (byId) return { found: byId, how: 'its id' };
  }

  // ── by column name ───────────────────────────────────────────────────────
  const byName = known.find((one) => one.name === attribute.name);
  if (byName) return { found: byName, how: 'the same column name' };

  // ── by question, and by choice where there is one ────────────────────────
  const question = normalised(attribute.question);

  const byQuestion = known.find(
    (one) =>
      normalised(one.question) === question &&
      // The part the first version of this forgot. Two columns of the same
      // checkbox are the same question and different attributes, and only the
      // choice tells them apart.
      (one.choice ?? null) === (attribute.choice ?? null)
  );

  if (byQuestion) return { found: byQuestion, how: 'the same question' };

  return { found: null, how: null };
}

/**
 * What changed between what a form had and what a new version says.
 *
 * Returned rather than logged, because a screen shows it: somebody about to
 * save a version wants to know that they are about to start a second column
 * for a question they only renamed.
 */
export function whatChanged(known: KnownAttribute[], attributes: Attribute[]): WhatChanged {
  const added: Attribute[] = [];
  const renamed: WhatChanged['renamed'] = [];
  const same: Attribute[] = [];
  const matchedIds = new Set<number>();

  for (const attribute of attributes) {
    const said = sameQuestionAs(known, attribute);

    if (!said.found) {
      added.push(attribute);
      continue;
    }

    matchedIds.add(said.found.id);

    if (said.found.name === attribute.name) same.push(attribute);
    else renamed.push({ was: said.found, now: attribute, how: said.how });
  }

  /**
   * Questions the form had and this version does not offer.
   *
   * Not deleted, ever. People answered them, and a form no longer asking a
   * question does not unask it — so the attribute stays and the version simply
   * does not point at it, which is what makes "was this asked in March"
   * different from "did anybody answer it".
   */
  const withdrawn = known.filter((one) => !matchedIds.has(one.id));

  return { added, renamed, same, withdrawn };
}
