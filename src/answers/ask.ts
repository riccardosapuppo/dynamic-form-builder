/**
 * The questions somebody asks of a pile of answers, asked of the flattened
 * store.
 *
 * Every one of them is a `SELECT`. That is the entire return on the work in
 * `src/flatten/` — not that it is faster, but that these are *questions* rather
 * than programs, and somebody who is not the author can write another one.
 */

import type { Store } from '../store/db.ts';

/** How many people answered a question at all. */
export function howManyAnswered(kept: Store, formId: number, column: string): number {
  return Number(
    kept.run(
      `SELECT COUNT(*) AS n
         FROM answers a
         JOIN attributes t ON t.id = a.attribute_id
        WHERE t.form_id = ? AND t.name = ?
          -- One COALESCE, not two.
          --
          -- The first version tested the coalesced value for NULL and then
          -- tested as_text for empty -- and as_text is NULL on every number,
          -- so every numeric answer counted as blank and the column read
          -- zero. A number is not a missing answer, and a second condition
          -- naming one column of four was never going to say so.
          AND COALESCE(a.as_text, CAST(a.as_number AS TEXT), CAST(a.as_boolean AS TEXT), a.as_date, '') != ''`,
      [formId, column]
    )[0].n
  );
}

/**
 * The average of a numeric question.
 *
 * `as_number` is a REAL column, so this is an average of numbers rather than
 * an average of whatever a cast made of some text. A value that was not a
 * number never reached this column — it was recorded as unplaceable, with the
 * reason — so the count here is the count of answers that were actually
 * numbers, and it is knowable rather than assumed.
 */
export function averageOf(kept: Store, formId: number, column: string): { average: number | null; of: number } {
  const said = kept.run(
    `SELECT AVG(a.as_number) AS avg, COUNT(a.as_number) AS n
       FROM answers a
       JOIN attributes t ON t.id = a.attribute_id
      WHERE t.form_id = ? AND t.name = ?`,
    [formId, column]
  )[0];

  return { average: said.avg === null ? null : Number(said.avg), of: Number(said.n) };
}

/**
 * How many ticked one choice.
 *
 * One column, one boolean, one count. The set became columns when the form was
 * saved, so nothing here has to know that a checkbox is a set — which is the
 * point of having done it then.
 */
export function howManyTicked(kept: Store, formId: number, question: string, choice: string): number {
  return Number(
    kept.run(
      `SELECT COUNT(*) AS n
         FROM answers a
         JOIN attributes t ON t.id = a.attribute_id
        WHERE t.form_id = ? AND t.question = ? AND t.choice = ? AND a.as_boolean = 1`,
      [formId, question, choice]
    )[0].n
  );
}

/**
 * How many were **offered** a question, which is not how many answered it.
 *
 * A submission against a version that did not include the question has not
 * declined to answer it. This is the distinction a pile of documents cannot
 * make, because an absent key looks the same either way — and it is the
 * difference between "twelve per cent have coeliac disease" and "twelve per
 * cent of the half who were asked".
 */
export function howManyWereOffered(kept: Store, formId: number, column: string): number {
  return Number(
    kept.run(
      `SELECT COUNT(*) AS n
         FROM submissions s
         JOIN version_attributes va ON va.version_id = s.version_id
         JOIN attributes t ON t.id = va.attribute_id
        WHERE s.form_id = ? AND t.name = ?`,
      [formId, column]
    )[0].n
  );
}

/** Which versions offered a question, and under what name in each. */
export function askedIn(kept: Store, formId: number, column: string) {
  return kept.run(
    `SELECT v.number AS version, va.called AS called
       FROM version_attributes va
       JOIN versions v ON v.id = va.version_id
       JOIN attributes t ON t.id = va.attribute_id
      WHERE t.form_id = ? AND t.name = ?
      ORDER BY v.number`,
    [formId, column]
  );
}

/** What the form can be asked about, and what it cannot. */
export function whatCanBeAsked(kept: Store, formId: number) {
  return kept.run(
    `SELECT name, question, kind, type, choice, page, allowed, first_seen, last_seen
       FROM attributes
      WHERE form_id = ?
      ORDER BY first_seen, id`,
    [formId]
  );
}

/**
 * The answers nothing could place, grouped by what they arrived called.
 *
 * The most useful thing this produces, and the one a pile of documents has no
 * equivalent of — there, an answer to a question the form does not have is
 * simply a key nobody ever looks at.
 */
export function whatCouldNotBePlaced(kept: Store, formId: number) {
  return kept.run(
    `SELECT u.called, u.why, COUNT(*) AS n
       FROM unplaced u
       JOIN submissions s ON s.id = u.submission_id
      WHERE s.form_id = ?
      GROUP BY u.called, u.why
      ORDER BY n DESC, u.called`,
    [formId]
  );
}

/** How each answer found its question: exactly, normalised, or loosely. */
export function howAnswersWereMatched(kept: Store, formId: number) {
  return kept.run(
    `SELECT a.matched, COUNT(*) AS n
       FROM answers a
       JOIN submissions s ON s.id = a.submission_id
      WHERE s.form_id = ?
      GROUP BY a.matched
      ORDER BY n DESC`,
    [formId]
  );
}

/**
 * A cross-tabulation: one question against another.
 *
 * Here to make a point rather than because a demonstration needs it. This is
 * the question that is a `SELECT` over columns and a program over documents,
 * and it is the one somebody asks on the second day.
 */
export function crossTab(kept: Store, formId: number, down: string, across: string) {
  return kept.run(
    `SELECT
        COALESCE(l.as_text, CAST(l.as_number AS TEXT), l.as_date) AS down,
        COALESCE(r.as_text, CAST(r.as_number AS TEXT), r.as_date, CAST(r.as_boolean AS TEXT)) AS across,
        COUNT(*) AS n
       FROM answers l
       JOIN attributes lt ON lt.id = l.attribute_id AND lt.form_id = ? AND lt.name = ?
       JOIN answers r ON r.submission_id = l.submission_id
       JOIN attributes rt ON rt.id = r.attribute_id AND rt.form_id = ? AND rt.name = ?
      GROUP BY down, across
      ORDER BY down, across`,
    [formId, down, formId, across]
  );
}
