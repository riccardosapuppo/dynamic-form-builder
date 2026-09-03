/**
 * Where a form, its versions, and the answers to it are kept.
 *
 * `node:sqlite`, in memory. Nothing is written to disk: this is a
 * demonstration anybody can open, and a database file on somebody else's
 * machine holding forms they typed in is a thing that should not exist.
 *
 * ── The one decision this schema is about ────────────────────────────────────
 *
 * **An attribute belongs to the FORM, not to the version.**
 *
 * That is the whole design, and it is not the obvious arrangement. The obvious
 * one is that saving version 2 of a form produces version 2's columns, which is
 * tidy, easy to reason about, and quietly destroys the only thing anybody wants
 * from this data.
 *
 * Because a form gets edited. Somebody renames `Peso (kg)` to `Weight`, or
 * fixes a typo, or adds a choice. If the columns belong to the version, the
 * answers from before the edit sit against one column and the answers after sit
 * against another — and `how many people answered this` returns half of them,
 * with no error, no warning, and a number that looks entirely reasonable.
 *
 * So an attribute is created once, against the form, and every version that
 * still asks that question points at the same one. A version records which
 * attributes it offers, so "was this question even asked in March" stays
 * answerable — and that is a different question from "did anybody answer it",
 * which is exactly the distinction a single flat table cannot make.
 *
 * ── And the table nobody usually builds ──────────────────────────────────────
 *
 * `unplaced`. An answer whose question cannot be found does not vanish: it is
 * written down, with the name it arrived under and why it could not be placed.
 *
 * Without it, a failed match is one fewer row. The totals still add up, the
 * charts still draw, and the count is quietly low — which is the failure this
 * project exists to make visible.
 */

import { readFileSync } from 'node:fs';

import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';

import type { Attribute, Form } from '../flatten/attributes.ts';
import type { KnownAttribute } from '../flatten/identity.ts';

export type Store = ReturnType<typeof store>;

export type Saved = {
  formId: number;
  versionId: number;
  number: number;
  added: string[];
  renamed: Array<{ was: string; now: string; question: string; how: string }>;
  same: string[];
  gone: string[];
  doesNotFit: unknown[];
  trouble: string[];
};

export type Filled = {
  submissionId: number;
  placed: unknown[];
  unplaced: Array<{ called: string; why: string }>;
  wrongType: Array<{ called: string; why: string }>;
  keptWhole: string[];
};

import { flatten } from '../flatten/attributes.ts';
import { whatChanged } from '../flatten/identity.ts';
import { index } from '../flatten/match.ts';
import type { Finder } from '../flatten/match.ts';
import { readAs } from '../form/kinds.ts';

/**
 * The schema, read from the file next to this one.
 *
 * `schema.sql` rather than a template literal: a schema is the part of a system
 * people argue about, and it argues better as a file something can open,
 * colour and diff than as a string inside a module.
 */
const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function store() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);

  /**
   * A prepared statement, with the shape its caller says it returns.
   *
   * `node:sqlite` hands back `Record<string, SQLOutputValue>`, which is honest —
   * it cannot know what a SELECT produces. Wrapping `prepare` once means the
   * cast happens here rather than at forty call sites, and each of those says
   * what it expects instead of saying nothing.
   */
  const put = (sql: string) => {
    const statement = db.prepare(sql);

    return {
      get: <T>(...params: SQLInputValue[]): T | undefined =>
        statement.get(...params) as unknown as T | undefined,
      all: <T>(...params: SQLInputValue[]): T[] => statement.all(...params) as unknown as T[],
      run: (...params: SQLInputValue[]) => statement.run(...params),
    };
  };

  const statements = {
    form: put('INSERT INTO forms (name) VALUES (?) RETURNING id'),
    formByName: put('SELECT id FROM forms WHERE name = ?'),
    version: put('INSERT INTO versions (form_id, number, saved_at, note, definition) VALUES (?, ?, ?, ?, ?) RETURNING id'),
    lastVersion: put('SELECT MAX(number) AS n FROM versions WHERE form_id = ?'),
    attributes: put('SELECT * FROM attributes WHERE form_id = ?'),

    /**
     * Every name each attribute has ever been offered under.
     *
     * `version_attributes.called` was written to record what a version called
     * a question, for the sake of a screen that shows it. It turns out to be
     * load-bearing: after a rename the attribute answers to a new name, and
     * the answers people gave before the rename arrive under the old one.
     * Without this the rename is handled perfectly and loses every answer
     * that came before it.
     */
    namesEver: put(
      `SELECT va.attribute_id AS id, va.called AS called
         FROM version_attributes va
         JOIN attributes t ON t.id = va.attribute_id
        WHERE t.form_id = ?`
    ),
    newAttribute: put(
      `INSERT INTO attributes (form_id, name, question, question_id, kind, type, choice, page, allowed, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
    ),
    /**
     * Seen again, and possibly carrying an id for the first time.
     *
     * COALESCE, so an id is learned once and never overwritten. Somebody who
     * adds ids to a form that already has answers is the ordinary case -- ids
     * are the thing nobody puts in until the first rename goes wrong -- and
     * without this the form takes the new definition, matches every question
     * by column name, and quietly keeps none of the ids. The next version
     * then renames a question and has nothing to match it on, which looks
     * exactly like ids not working.
     *
     * Never overwritten because a column whose id changed is not this column
     * with a new id; it is somebody having reused a name.
     */
    seenAgain: put(
      'UPDATE attributes SET last_seen = ?, question = ?, question_id = COALESCE(question_id, ?) WHERE id = ?'
    ),
    rename: put(
      'UPDATE attributes SET last_seen = ?, question = ?, name = ?, question_id = COALESCE(question_id, ?) WHERE id = ?'
    ),
    offers: put('INSERT OR REPLACE INTO version_attributes (version_id, attribute_id, called) VALUES (?, ?, ?)'),
    submission: put('INSERT INTO submissions (form_id, version_id, at, reference) VALUES (?, ?, ?, ?) RETURNING id'),
    answer: put(
      `INSERT INTO answers (submission_id, attribute_id, as_text, as_number, as_boolean, as_date, matched)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ),
    unplaced: put('INSERT INTO unplaced (submission_id, called, raw, why) VALUES (?, ?, ?, ?)'),
    keptWhole: put('INSERT INTO kept_whole (submission_id, called, kind, raw) VALUES (?, ?, ?, ?)'),
  };

  return {
    db,

    /** Every query in `src/answers/` goes through this. */
    run<T = Record<string, unknown>>(sql: string, params: SQLInputValue[] = []): T[] {
      return db.prepare(sql).all(...params) as unknown as T[];
    },

    close() {
      db.close();
    },

    /**
     * Save a version of a form. Returns what it did, in enough detail for a
     * screen to show it: which columns are new, which are the same question
     * under a new name, and what did not fit.
     */
    save(
      name: string,
      definition: unknown,
      { note = '', at = '2026-01-01' }: { note?: string; at?: string } = {}
    ): Saved {
      const existing = statements.formByName.get<{ id: number }>(name);
      const formId = existing ? existing.id : statements.form.get<{ id: number }>(name)!.id;

      const number = Number(statements.lastVersion.get<{ n: number }>(formId)?.n ?? 0) + 1;
      const versionId = statements.version.get<{ id: number }>(
        formId,
        number,
        at,
        note,
        JSON.stringify(definition)
      )!.id;

      const { attributes, doesNotFit, trouble } = flatten(definition as Form);

      // What this version changes about what the form already had.
      //
      // Worked out against the FORM, which is the point of the schema: a
      // question that is still being asked keeps its column and its answers,
      // whatever the new version calls it.
      const known = statements.attributes.all<KnownAttribute>(formId);
      const changed = whatChanged(known, attributes);

      const added: string[] = [];
      const renamed: Saved['renamed'] = [];

      for (const attribute of changed.same) {
        const already = known.find((one) => one.name === attribute.name);
        statements.seenAgain.run(number, attribute.question, attribute.id ?? null, already!.id);
        // What this version CALLED it, which is the question rather than the
        // column. The column name is derivable from it and the question is
        // not derivable from the column, so this is the one worth keeping --
        // and it is what a rename has to be searchable by afterwards.
        statements.offers.run(versionId, already!.id, attribute.question);
      }

      for (const one of changed.renamed) {
        // The column is renamed rather than a second one being created. Every
        // answer already recorded against it stays where it is, which is the
        // whole reason attributes belong to the form.
        statements.rename.run(number, one.now.question, one.now.name, one.now.id ?? null, one.was.id);
        statements.offers.run(versionId, one.was.id, one.now.question);
        renamed.push({ was: one.was.name, now: one.now.name, question: one.now.question, how: one.how });
      }

      for (const attribute of changed.added) {
        const id = statements.newAttribute.get<{ id: number }>(
          formId,
          attribute.name,
          attribute.question,
          attribute.id ?? null,
          attribute.kind,
          attribute.type,
          attribute.choice,
          attribute.page,
          attribute.allowed ? JSON.stringify(attribute.allowed) : null,
          number,
          number
        )!.id;

        statements.offers.run(versionId, id, attribute.question);
        added.push(attribute.name);
      }

      const same = changed.same.map((one) => one.name);
      const gone = changed.withdrawn.map((one) => one.name);
      return { formId, versionId, number, added, renamed, same, gone, doesNotFit, trouble };
    },

    /**
     * Save a submission against a version of a form.
     *
     * Nothing here throws on an answer it cannot place. It records it, with the
     * reason, and carries on — because one unmatched answer in a submission of
     * forty is not a reason to lose the other thirty-nine, and because the
     * record of what could not be placed is the most useful thing this produces.
     */
    fill(
      formId: number,
      versionId: number,
      answers: Record<string, unknown> | null | undefined,
      { at = '2026-01-01', reference = '' }: { at?: string; reference?: string } = {}
    ): Filled {
      const submissionId = statements.submission.get<{ id: number }>(formId, versionId, at, reference)!.id;

      const known = withEveryName(statements, formId);
      const finder = index(known);
      const byName = new Map(known.map((one) => [one.name, one]));

      const placed: unknown[] = [];
      const unplaced: Filled['unplaced'] = [];
      const whole: string[] = [];
      const wrongType: Filled['wrongType'] = [];

      for (const [called, raw] of Object.entries(answers ?? {})) {
        // ── the ones that do not fit in a cell ────────────────────────────
        if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
          statements.keptWhole.run(submissionId, called, 'repeating-or-matrix', JSON.stringify(raw));
          whole.push(called);
          continue;
        }

        // ── a set: one answer per choice ──────────────────────────────────
        if (Array.isArray(raw)) {
          const ticked = new Set(raw.map(String));

          // Every column of that question, not only the ticked ones: "did not
          // tick it" and "was never asked" are different, and a table with only
          // the ticked ones cannot tell them apart.
          const columns = known.filter((one) => one.choice !== null && one.question === called);
          const found = columns.length ? columns : columnsFor(finder, byName, called, known);

          if (found.length === 0) {
            statements.unplaced.run(submissionId, called, JSON.stringify(raw), `nothing in this form is called "${called}"`);
            unplaced.push({ called, why: `nothing in this form is called "${called}"` });
            continue;
          }

          for (const column of found) {
            // `choice` is never null here: `found` holds only the columns of a
            // checkbox, and a checkbox column is one per choice by construction.
            statements.answer.run(
              submissionId,
              column.id,
              null,
              null,
              ticked.has(String(column.choice)) ? 1 : 0,
              null,
              'exactly'
            );
            placed.push(column.name);
          }

          continue;
        }

        // ── one value ─────────────────────────────────────────────────────
        const said = finder.find(called);

        if (!said.found) {
          statements.unplaced.run(submissionId, called, raw === null ? null : String(raw), said.why);
          unplaced.push({ called, why: said.why });
          continue;
        }

        const read = readAs(String(said.found.type), raw);

        if (!read.ok) {
          // A value of the wrong type is not an unplaced answer -- the question
          // was found. It is an answer that cannot be stored as what it claims
          // to be, which is its own kind of problem and gets its own note.
          statements.unplaced.run(submissionId, called, String(raw), `${read.why}, and this question is a ${said.found.type}`);
          wrongType.push({ called, why: read.why });
          continue;
        }

        statements.answer.run(
          submissionId,
          said.found.id,
          said.found.type === 'text' ? (read.value as SQLInputValue) : null,
          said.found.type === 'number' || said.found.type === 'integer'
            ? (read.value as SQLInputValue)
            : null,
          said.found.type === 'boolean' ? (read.value === null ? null : read.value ? 1 : 0) : null,
          said.found.type === 'date' ? (read.value as SQLInputValue) : null,
          said.how
        );

        placed.push(said.found.name);
      }

      return { submissionId, placed, unplaced, wrongType, keptWhole: whole };
    },
  };
}

/** The columns of a `choices` question, found by whatever it was called. */
/**
 * The attributes of a form, each carrying every name it has ever had.
 *
 * A rename keeps the answers together going forward and loses the ones
 * already given, unless the old name still finds it. Sixty answers to
 * "Anything else" went to the unplaced table on the first run of the
 * measurement, in a run where nothing errored and every total looked
 * plausible -- which is the whole reason the measurement exists.
 */
function withEveryName(
  statements: { namesEver: { all: <T>(...p: SQLInputValue[]) => T[] }; attributes: { all: <T>(...p: SQLInputValue[]) => T[] } },
  formId: number
): KnownAttribute[] {
  const alsoCalled = new Map<number, Set<string>>();

  for (const row of statements.namesEver.all<{ id: number; called: string }>(formId)) {
    if (!alsoCalled.has(row.id)) alsoCalled.set(row.id, new Set());
    alsoCalled.get(row.id)!.add(row.called);
  }

  return statements.attributes.all<KnownAttribute>(formId).map((one) => ({
    ...one,
    alsoCalled: [...(alsoCalled.get(one.id) ?? [])],
  }));
}

function columnsFor(
  finder: Finder<KnownAttribute>,
  byName: Map<string, KnownAttribute>,
  called: string,
  known: KnownAttribute[]
): KnownAttribute[] {
  const said = finder.find(called);
  if (!said.found) return [];

  const question = said.found.question;
  return known.filter((one) => one.choice !== null && one.question === question);
}
