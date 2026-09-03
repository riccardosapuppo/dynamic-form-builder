/**
 * The tree, walked into columns.
 *
 * This is the heart of the project: a form definition goes in, and what comes
 * out is the list of things that can be asked about — one entry per column,
 * plus an honest account of what did not fit.
 *
 * ── The four rules, and why each of them is not obvious ──────────────────────
 *
 * **A panel is not a question.** It is layout. Its children are walked and it
 * leaves nothing behind, which means the walk has to recurse — and a form three
 * panels deep is ordinary, because that is how people group things on a page.
 *
 * **A `choice` becomes one column; a `choices` becomes one per choice.** Both
 * carry a list in the definition and it is tempting to treat them the same. One
 * answer out of a list is a value. *Several* answers out of a list is a set,
 * and a set in one cell is a string that has to be parsed back every time
 * anybody counts it — and is wrong the first time a choice contains the
 * separator.
 *
 * **A matrix also has choices, and is neither.** Its answers are cells: rows
 * times columns, none of which is "the answer to the matrix". It is the reason
 * the choice rules cannot simply look for a list and act on it — two rules read
 * the same field and want different things, so the matrix is taken out of the
 * way first.
 *
 * **What does not fit is recorded as not fitting.** A matrix and a repeating
 * panel are kept whole and marked. A flattening that quietly drops them leaves
 * a dashboard that is complete about the questions it can answer and silent
 * about the ones it cannot — which is the failure this whole project is about.
 */

import { KINDS, kindOf } from '../form/kinds.js';

/**
 * A name a column can be called.
 *
 * Accents come off, and that is not tidiness. In the system this is traced
 * from, the same names were used later to substitute values into a document
 * template, and the substitution matched on the name — so a question called
 * `Età` produced a column nothing downstream could ever find. It was fixed by
 * stripping the accents at the point the column was named, which is here.
 *
 * The rest is what a column name can be anywhere: letters, digits, and the two
 * separators. Everything else becomes an underscore rather than being dropped,
 * so two questions that differ only in punctuation do not become one column.
 */
export function nameFor(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    // The combining marks block: the accent itself, once `normalize` has
    // separated it from the letter it was sitting on. Written as escapes
    // rather than as the characters, which are invisible in an editor and
    // survive a copy and paste about half the time.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_.]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

/**
 * @typedef {object} Attribute
 * @property {string} name      what the column is called
 * @property {string} question  the question it came from
 * @property {string} kind      the question's kind
 * @property {string} type      how its value is read
 * @property {string|null} choice  which choice, for a `choices` question
 * @property {string} page      the page it is on
 * @property {string[]} inside  the panels it sits in, outermost first
 * @property {string[]|null} allowed  the values a `choice` question offers
 */

/**
 * Walk a form definition into its attributes.
 *
 * @returns {{attributes: Attribute[], doesNotFit: object[], trouble: string[]}}
 */
export function flatten(form) {
  const attributes = [];
  const doesNotFit = [];
  const trouble = [];

  /** Column names already used, so a collision is reported rather than silent. */
  const taken = new Map();

  const add = (attribute) => {
    // A name with nothing but punctuation in it.
    //
    // `nameFor("???")` is the empty string, and adding it produced a column
    // with no name: unreachable, because the index skips empty keys, so
    // nothing could ever put an answer in it and nothing said so. A question
    // that cannot become a column is trouble to report, not a column to make.
    if (!attribute.name) {
      trouble.push(
        `"${attribute.question}" has no letters or digits in its name, so there is no column it could become`
      );
      return;
    }

    const already = taken.get(attribute.name);

    if (already) {
      // Two questions that flatten to the same column name. Not a crash — the
      // form is somebody else's and refusing the whole thing over one clash is
      // the sort of strictness that gets a tool abandoned — but the second one
      // is renamed and the collision is reported, because a column silently
      // holding two questions' answers is the worst outcome available.
      const renamed = `${attribute.name}__${already + 1}`;
      trouble.push(
        `"${attribute.question}" and "${taken.get(`question:${attribute.name}`)}" both become the column ` +
          `${attribute.name}; the second is ${renamed}`
      );

      taken.set(attribute.name, already + 1);
      attributes.push({ ...attribute, name: renamed, renamedFrom: attribute.name });
      return;
    }

    taken.set(attribute.name, 1);
    taken.set(`question:${attribute.name}`, attribute.question);
    attributes.push(attribute);
  };

  const walk = (elements, { page, inside }) => {
    if (!Array.isArray(elements)) return;

    for (const element of elements) {
      const kind = kindOf(element);

      if (!kind) {
        trouble.push(`"${element?.name ?? '(unnamed)'}" is a ${element?.kind ?? 'nothing'}, which is not a kind of question`);
        continue;
      }

      if (!element.name) {
        trouble.push(`a ${element.kind} on ${page} has no name, so nothing can refer to its answers`);
        continue;
      }

      // ── layout ────────────────────────────────────────────────────────────
      if (kind.stores === 'nothing') {
        walk(element.elements, { page, inside: [...inside, element.name] });
        continue;
      }

      // ── what does not fit ─────────────────────────────────────────────────
      //
      // Taken out of the way BEFORE the choice rules, because a matrix carries
      // a list of choices too and would otherwise be flattened by the rule
      // written for checkboxes.
      if (kind.stores === 'nested') {
        doesNotFit.push({
          question: element.name,
          kind: element.kind,
          page,
          inside: [...inside],
          why:
            element.kind === 'matrix'
              ? `a matrix is ${(element.rows ?? []).length} rows by ${(element.columns ?? []).length} columns of answers, and none of them is the answer to the matrix`
              : 'a repeating group has as many answers as somebody chose to add, which is the one thing a column cannot say in advance',
          // Kept whole. Somebody can still read it back; what they cannot do is
          // put it in a WHERE clause, and that is said rather than hidden.
          keptWhole: true,
        });
        continue;
      }

      const base = {
        question: element.name,
        // The stable id, when the definition carries one. It is what lets a
        // question be renamed outright and keep its answers -- see identity.js.
        id: element.id ?? null,
        kind: element.kind,
        page,
        inside: [...inside],
      };

      // ── a set: one column per choice ──────────────────────────────────────
      if (kind.stores === 'many') {
        const choices = choicesOf(element);

        if (choices.length === 0) {
          trouble.push(`"${element.name}" offers several answers out of a list, and the list is empty`);
          continue;
        }

        for (const choice of choices) {
          add({
            ...base,
            name: `${nameFor(element.name)}.${nameFor(choice.value)}`,
            type: kind.as,
            choice: choice.value,
            label: choice.label,
            allowed: null,
          });
        }

        continue;
      }

      // ── one value ─────────────────────────────────────────────────────────
      add({
        ...base,
        name: nameFor(element.name),
        type: kind.as,
        choice: null,
        // The allowed values travel with the column rather than staying in the
        // definition, so "which answers are no longer offered" is a question
        // somebody can ask of the data. It is the question that gets asked
        // after a form has been edited a few times.
        allowed: kind.choices ? choicesOf(element).map((one) => one.value) : null,
      });
    }
  };

  for (const page of form?.pages ?? []) {
    walk(page.elements, { page: page.name ?? 'page', inside: [] });
  }

  return { attributes, doesNotFit, trouble };
}

/**
 * The choices a question offers, however they were written.
 *
 * A definition somebody edited by hand has strings; one a builder produced has
 * objects; one that has been translated has an object whose label is a map of
 * languages. All three are the same list, and refusing two of them would mean
 * refusing most real forms.
 */
export function choicesOf(element) {
  const out = [];

  for (const one of element?.choices ?? []) {
    if (typeof one === 'string' || typeof one === 'number') {
      out.push({ value: String(one), label: String(one) });
      continue;
    }

    if (one && typeof one === 'object') {
      const value = one.value ?? one.name ?? null;
      if (value === null || value === undefined) continue;

      const label =
        typeof one.label === 'string'
          ? one.label
          : one.label && typeof one.label === 'object'
            ? (Object.values(one.label)[0] ?? String(value))
            : String(value);

      out.push({ value: String(value), label: String(label) });
    }
  }

  return out;
}

/** Every question in a form, in order, panels flattened. Used by the screen. */
export function questionsIn(form) {
  const found = [];

  const walk = (elements, page, inside) => {
    for (const element of elements ?? []) {
      const kind = kindOf(element);
      if (!kind) continue;

      if (kind.stores === 'nothing') {
        walk(element.elements, page, [...inside, element.name]);
        continue;
      }

      found.push({ ...element, page, inside, says: KINDS[element.kind].says });
    }
  };

  for (const page of form?.pages ?? []) walk(page.elements, page.name ?? 'page', []);

  return found;
}
