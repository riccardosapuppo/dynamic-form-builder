/**
 * The same submissions, stored three ways.
 *
 * They receive **identical input**: the same forms, the same edits between
 * versions, the same hundred and twenty submissions in the same order. So any
 * difference in what they can answer is a difference between the three ways of
 * storing, and nothing else.
 *
 *   `documents`   one JSON document per submission. What anybody builds first.
 *   `flat`        the tree walked into columns, on definitions with no ids.
 *   `flatWithIds` the same, on definitions that give every question an id.
 *
 * The third exists because of what the second cannot do, and being honest about
 * that is more of the point than the comparison with the first. Without an id,
 * a question renamed from `Anything else` to `Other notes` starts a second
 * column, and the answers to it split — silently, exactly the way they do in
 * the documents. **The flattening does not fix versioning. An id fixes
 * versioning, and the flattening is what makes the id worth having.**
 */

import { documents } from '../blob/documents.ts';
import { store } from '../store/db.ts';
import {
  AWKWARD,
  INTAKE_V1,
  INTAKE_V1_IDS,
  INTAKE_V2_IDS,
  INTAKE_V2_RENAMED,
} from '../fixtures/forms.ts';
import { SUBMISSIONS } from '../fixtures/submissions.ts';

export const FORM = 'Patient intake';

/**
 * The answers as the person filling in that version would have given them.
 *
 * Version 2 asks `Other notes` where version 1 asked `Anything else`, so a
 * submission against version 2 is keyed that way. Nobody typed a key that was
 * not on the form in front of them.
 */
export function asAnsweredOn(submission: { onV2: boolean; answers: Record<string, unknown> }): Record<string, unknown> {
  if (!submission.onV2) return submission.answers;

  const { 'Anything else': notes, ...rest } = submission.answers;
  return notes === undefined ? rest : { ...rest, 'Other notes': notes };
}

import type { Form } from '../flatten/attributes.ts';
import type { Store, Saved, Filled } from '../store/db.ts';
import type { Documents } from '../blob/documents.ts';

export type FlatWorld = {
  kept: Store;
  formId: number;
  versions: [Saved, Saved];
  awkward: Saved;
  filling: Filled[];
};

export type Worlds = { documents: Documents; flat: FlatWorld; flatWithIds: FlatWorld };

/** One flattened world, built from a pair of definitions. */
function flatWorld(v1: Form, v2: Form): FlatWorld {
  const kept = store();

  const first = kept.save(FORM, v1, { note: 'as first built', at: '2026-01-10' });
  const second = kept.save(FORM, v2, { note: 'renamed, added, withdrew', at: '2026-03-20' });

  // The awkward form as well, so the trouble it produces is in the world rather
  // than only in a test — a screen showing "what this form could not do" needs
  // a form that could not do something.
  const awkward = kept.save(AWKWARD.name, AWKWARD, { at: '2026-02-01' });

  const filling = [];

  for (const one of SUBMISSIONS) {
    filling.push(
      kept.fill(first.formId, one.onV2 ? second.versionId : first.versionId, asAnsweredOn(one), {
        at: one.at,
        reference: one.reference,
      })
    );
  }

  return { kept, formId: first.formId, versions: [first, second], awkward, filling };
}

export function buildWorlds(): Worlds {
  const kept = documents();

  for (const one of SUBMISSIONS) {
    kept.keep(FORM, one.onV2 ? 2 : 1, { ...one, answers: asAnsweredOn(one) });
  }

  return {
    documents: kept,
    flat: flatWorld(INTAKE_V1, INTAKE_V2_RENAMED),
    flatWithIds: flatWorld(INTAKE_V1_IDS, INTAKE_V2_IDS),
  };
}

export function closeWorlds(worlds: Worlds): void {
  worlds.documents.close();
  worlds.flat.kept.close();
  worlds.flatWithIds.kept.close();
}
