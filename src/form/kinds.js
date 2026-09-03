/**
 * What a question is, and what it becomes when it has to be stored.
 *
 * ── The whole subject, in one sentence ───────────────────────────────────────
 *
 * **A form is authored as a tree and asked about as a table**, and a question
 * type is not a storage type. Everything difficult in this project lives in
 * that gap.
 *
 * A form definition is a nested thing: pages contain panels contain questions,
 * a matrix has rows and columns, a repeating panel has as many answers as
 * somebody chose to add. Storing it as it arrives — one JSON document per
 * submission — takes an afternoon and makes every subsequent question hard:
 * *how many people said yes*, *what is the average*, *which forms even ask
 * about this*.
 *
 * Flattening it takes much longer and makes those questions a `SELECT`. What it
 * costs is written down here rather than discovered later: three of these kinds
 * **do not fit in a cell**, and pretending otherwise is worse than saying so.
 */

/**
 * `stores`  what one answer to this becomes.
 *
 *   `one`      a single value in a single column
 *   `many`     one column per choice — a set, and a set in one cell is a string
 *              somebody has to parse back
 *   `nested`   it does not fit. A matrix has rows and columns; a repeating
 *              panel has a count nobody knew in advance. These are kept whole
 *              and marked, because a flattening that quietly loses them is
 *              worse than one that admits it cannot.
 *
 * `as`      the type the value is read back as.
 * `choices` whether the definition carries a list of allowed values.
 */
export const KINDS = {
  text: { stores: 'one', as: 'text', choices: false, says: 'a line of text' },
  paragraph: { stores: 'one', as: 'text', choices: false, says: 'several lines' },
  number: { stores: 'one', as: 'number', choices: false, says: 'a number' },
  integer: { stores: 'one', as: 'integer', choices: false, says: 'a whole number' },
  date: { stores: 'one', as: 'date', choices: false, says: 'a date' },
  yesno: { stores: 'one', as: 'boolean', choices: false, says: 'yes or no' },
  rating: { stores: 'one', as: 'integer', choices: false, says: 'a score out of something' },
  email: { stores: 'one', as: 'text', choices: false, says: 'an address' },

  /**
   * One answer, out of a list. One column, and the allowed values recorded
   * beside it — so "which answers are no longer offered" is answerable, which
   * it is not if the choices live only in the definition.
   */
  choice: { stores: 'one', as: 'text', choices: true, says: 'one of a list' },

  /**
   * Several answers, out of a list. **One column per choice**, named
   * `question.choice`, holding yes or no.
   *
   * The obvious alternative — one column holding "a, c, d" — is a string that
   * has to be parsed back every time anybody asks how many people ticked `c`,
   * and it is wrong the first time a choice contains a comma.
   */
  choices: { stores: 'many', as: 'boolean', choices: true, says: 'any of a list' },

  /** Layout, not data. Its children are questions; it is not one. */
  panel: { stores: 'nothing', as: null, choices: false, says: 'a group of questions' },

  /**
   * Rows against columns. Every cell is an answer, so the number of values is
   * rows × columns and none of them is "the answer to the matrix".
   */
  matrix: { stores: 'nested', as: null, choices: true, says: 'a grid of answers' },

  /**
   * A group of questions, repeated as many times as somebody chose. The number
   * of answers is not known until the form is filled in, which is exactly the
   * thing a column cannot express.
   */
  repeating: { stores: 'nested', as: null, choices: false, says: 'a group, repeated' },
};

export const KIND_NAMES = Object.keys(KINDS);

/** Kinds that produce a column of their own. */
export const FLATTENS = KIND_NAMES.filter((one) => KINDS[one].stores === 'one' || KINDS[one].stores === 'many');

/** Kinds that do not fit in a cell, and are stored whole and marked as such. */
export const DOES_NOT_FIT = KIND_NAMES.filter((one) => KINDS[one].stores === 'nested');

export function kindOf(question) {
  return KINDS[question?.kind] ?? null;
}

/**
 * Read a value the way its kind says to.
 *
 * ── Why this exists at all ───────────────────────────────────────────────────
 *
 * A JSON document keeps whatever type the browser happened to send. A number
 * field that somebody typed into is a string on one submission and a number on
 * the next, depending on the widget, the browser and whether the form was ever
 * saved and reloaded. Averaging that column then averages the ones that
 * happened to be numbers and silently ignores the rest — which is not an
 * error, and not a number anybody should act on.
 *
 * So a value is read as its **declared** type on the way in, once, and the
 * failures are recorded rather than dropped.
 *
 * @returns {{ok: true, value: unknown} | {ok: false, why: string}}
 */
export function readAs(type, raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };

  if (type === 'text') return { ok: true, value: String(raw) };

  if (type === 'number' || type === 'integer') {
    // A comma decimal separator is what half of Europe types, and
    // `Number('7,5')` is NaN — which would silently become "no answer".
    const text = String(raw).trim().replace(',', '.');
    const value = Number(text);

    if (!Number.isFinite(value)) return { ok: false, why: `"${raw}" is not a number` };
    if (type === 'integer' && !Number.isInteger(value)) return { ok: false, why: `${value} is not a whole number` };

    return { ok: true, value };
  }

  if (type === 'boolean') {
    if (typeof raw === 'boolean') return { ok: true, value: raw };

    const text = String(raw).trim().toLowerCase();
    if (['true', 'yes', '1', 'y', 'si', 'sì'].includes(text)) return { ok: true, value: true };
    if (['false', 'no', '0', 'n'].includes(text)) return { ok: true, value: false };

    return { ok: false, why: `"${raw}" is neither yes nor no` };
  }

  if (type === 'date') {
    const text = String(raw).trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (!match) return { ok: false, why: `"${raw}" is not a date` };

    // Kept as text, in the one format where sorting and comparing are the same
    // as chronological order. A date object here would be a timezone waiting
    // to move somebody's answer to the day before.
    return { ok: true, value: `${match[1]}-${match[2]}-${match[3]}` };
  }

  return { ok: false, why: `nothing knows how to read a ${type}` };
}
