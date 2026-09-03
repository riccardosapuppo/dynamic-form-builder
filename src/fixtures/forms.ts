import type { Form } from '../flatten/attributes.ts';
import type { Question } from '../form/kinds.ts';

/**
 * The forms, invented, and the only truth in this project.
 *
 * Two versions of one form, and the difference between them is the whole
 * demonstration: **a question is renamed, one is added, one stops being asked.**
 * That is not an exotic scenario. It is what happens to every form that lives
 * longer than a season.
 *
 * Nothing here is a real form, a real clinic or a real person. The shapes are
 * real: a checkbox that is a set, a matrix that does not fit in a cell, a
 * repeating group whose length nobody knows in advance, and an accented
 * question name that has to survive being turned into a column.
 */

/** Version 1, as somebody first built it. */
export const INTAKE_V1 = {
  name: 'Patient intake',
  pages: [
    {
      name: 'About you',
      elements: [
        { kind: 'text', name: 'Name', label: 'Your name' },
        { kind: 'date', name: 'Date of birth' },
        { kind: 'integer', name: 'Età', label: 'Age' },

        /**
         * The name with a bracket in it. It becomes `Peso_kg`, and in version 2
         * somebody writes it without the bracket — which is the rename the
         * whole measurement turns on.
         */
        { kind: 'number', name: 'Peso (kg)', label: 'Weight in kilograms' },

        {
          kind: 'choice',
          name: 'Smoker',
          choices: ['never', 'former', 'current'],
        },
      ],
    },

    {
      name: 'History',
      elements: [
        {
          // Layout. It leaves no column behind and its children are walked.
          kind: 'panel',
          name: 'Conditions',
          elements: [
            {
              // A set. One column per choice, because "which did they tick" is
              // a question somebody will ask about each one separately.
              kind: 'choices',
              name: 'Diagnosed with',
              choices: [
                { value: 'diabetes', label: 'Diabetes' },
                { value: 'asthma', label: 'Asthma' },
                { value: 'hypertension', label: 'High blood pressure' },
              ],
            },
            { kind: 'yesno', name: 'Taking medication' },
            { kind: 'paragraph', name: 'Anything else' },
          ],
        },

        {
          /**
           * A grid. Four rows against three columns is twelve answers, and none
           * of them is "the answer to the matrix" — so it is kept whole and
           * marked, rather than flattened into something that looks like a
           * column and is not.
           */
          kind: 'matrix',
          name: 'Symptoms by week',
          rows: ['week 1', 'week 2', 'week 3', 'week 4'],
          columns: [
            { name: 'pain', kind: 'rating' },
            { name: 'sleep', kind: 'rating' },
            { name: 'appetite', kind: 'rating' },
          ],
          choices: [1, 2, 3, 4, 5],
        },

        {
          // As many as somebody chose to add. The one thing a column cannot say
          // in advance.
          kind: 'repeating',
          name: 'Previous surgery',
          elements: [
            { kind: 'text', name: 'Operation' },
            { kind: 'date', name: 'When' },
          ],
        },
      ],
    },

    {
      name: 'Consent',
      elements: [
        { kind: 'yesno', name: 'Agrees to be contacted' },
        { kind: 'rating', name: 'How easy was this form' },
      ],
    },
  ],
};

/**
 * Version 2, after somebody edited it.
 *
 * Three changes, and each is a different kind of problem:
 *
 *   **renamed** — `Peso (kg)` is now `Peso kg`. The same question, and the
 *   answers to it belong together. Whether they end up together is the
 *   measurement.
 *
 *   **added** — a fourth condition, `coeliac`. Submissions from version 1 did
 *   not offer it, so their answer is *not applicable* rather than *no* — which
 *   is a distinction a single flat table cannot make.
 *
 *   **withdrawn** — `How easy was this form` is no longer asked. The answers
 *   people already gave to it do not stop existing.
 */
export const INTAKE_V2 = {
  name: 'Patient intake',
  pages: [
    {
      name: 'About you',
      elements: [
        { kind: 'text', name: 'Name', label: 'Your name' },
        { kind: 'date', name: 'Date of birth' },
        { kind: 'integer', name: 'Età', label: 'Age' },
        { kind: 'number', name: 'Peso kg', label: 'Weight in kilograms' },
        { kind: 'choice', name: 'Smoker', choices: ['never', 'former', 'current'] },
      ],
    },

    {
      name: 'History',
      elements: [
        {
          kind: 'panel',
          name: 'Conditions',
          elements: [
            {
              kind: 'choices',
              name: 'Diagnosed with',
              choices: [
                { value: 'diabetes', label: 'Diabetes' },
                { value: 'asthma', label: 'Asthma' },
                { value: 'hypertension', label: 'High blood pressure' },
                { value: 'coeliac', label: 'Coeliac disease' },
              ],
            },
            { kind: 'yesno', name: 'Taking medication' },
            { kind: 'paragraph', name: 'Anything else' },
          ],
        },
        {
          kind: 'matrix',
          name: 'Symptoms by week',
          rows: ['week 1', 'week 2', 'week 3', 'week 4'],
          columns: [
            { name: 'pain', kind: 'rating' },
            { name: 'sleep', kind: 'rating' },
            { name: 'appetite', kind: 'rating' },
          ],
          choices: [1, 2, 3, 4, 5],
        },
        {
          kind: 'repeating',
          name: 'Previous surgery',
          elements: [
            { kind: 'text', name: 'Operation' },
            { kind: 'date', name: 'When' },
          ],
        },
      ],
    },

    {
      name: 'Consent',
      elements: [{ kind: 'yesno', name: 'Agrees to be contacted' }],
    },
  ],
};

/**
 * A second form, which exists to be awkward in the ways the first is not.
 *
 * Two questions whose names differ only in punctuation — so they flatten to the
 * same loose key and any loose match between them has to be **refused** rather
 * than guessed. And a question whose name is nothing but punctuation, which
 * cannot become a column at all.
 */
export const AWKWARD = {
  name: 'A form somebody typed in a hurry',
  pages: [
    {
      name: 'One',
      elements: [
        { kind: 'number', name: 'Peso-kg' },
        { kind: 'number', name: 'Peso kg' },
        { kind: 'text', name: '???' },
        { kind: 'text', name: 'Note' },
        // A kind nothing knows about. Reported, not silently skipped.
        { kind: 'slider', name: 'How much' },
        // Several answers out of an empty list.
        { kind: 'choices', name: 'Pick some', choices: [] },
      ],
    },
  ],
};

/**
 * A rename that is a rename, rather than a spelling change.
 *
 * `Peso (kg)` becoming `Peso kg` is not really a rename: both flatten to
 * `Peso_kg`, so the column is the same one and nothing is lost. That is the
 * naming rules doing their job, and it is worth knowing they do — but it
 * demonstrates nothing about versioning.
 *
 * This is the other case. `Anything else` becomes `Other notes`: the same
 * question, asked in different words, with **nothing in common that any rule
 * could match on**. Without an id there is no way to know they are the same
 * question, and the answers to it split into two columns — silently, because
 * two columns each holding half the answers is not an error anywhere.
 */
export const INTAKE_V2_RENAMED = renameIn(INTAKE_V2, 'Anything else', 'Other notes');

function renameIn(form: Form, from: string, to: string): Form {
  const walk = (elements: Question[]): Question[] =>
    elements.map((one) =>
      one.elements
        ? { ...one, elements: walk(one.elements) }
        : one.name === from
          ? { ...one, name: to }
          : one
    );

  return {
    ...form,
    pages: (form.pages ?? []).map((page) => ({ ...page, elements: walk(page.elements ?? []) })),
  };
}

/**
 * The same forms, with an id on every question.
 *
 * The ids are derived from what version 1 called each question, and version 2
 * keeps them — which is what a builder does when somebody edits a question
 * rather than deleting it and adding another. It is one field in the
 * definition and it is the difference between a rename that keeps its answers
 * and one that quietly starts again.
 *
 * `npm run measure` reports what it buys, and where it makes no difference at
 * all — which is most questions, most of the time, and is why so many forms in
 * the world do not have one.
 */
export function withIds(form: Form, renames: Record<string, string> = {}): Form {
  const idFor = (name: unknown): string => `q.${String(renames[String(name)] ?? name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  const walk = (elements: Question[]): Question[] =>
    elements.map((one) =>
      one.elements && one.kind === 'panel'
        ? { ...one, elements: walk(one.elements) }
        : { ...one, id: idFor(one.name) }
    );

  return {
    ...form,
    pages: (form.pages ?? []).map((page) => ({ ...page, elements: walk(page.elements ?? []) })),
  };
}

/** Version 1, with ids. */
export const INTAKE_V1_IDS = withIds(INTAKE_V1);

/**
 * Version 2, with ids — and `Other notes` carries the id `Anything else` had,
 * because it is the same question under a new name. That one line is the whole
 * difference.
 */
export const INTAKE_V2_IDS = withIds(INTAKE_V2_RENAMED, { 'Other notes': 'Anything else' });
