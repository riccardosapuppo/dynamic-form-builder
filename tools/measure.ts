#!/usr/bin/env node
/**
 * `npm run measure` — the same submissions, stored three ways, asked the same
 * eight questions.
 *
 * Prints a table, then the rows worth reading in full. Exits non-zero if the
 * flattened store with ids gets anything wrong, because that is the claim this
 * project makes, and a claim that can fail in CI is worth more than one in a
 * README.
 */

import { buildWorlds, closeWorlds } from '../src/measure/worlds.ts';
import { measure, tally } from '../src/measure/questions.ts';
import type { Row, Which } from '../src/measure/questions.ts';

const MARK = { right: '  ok  ', wrong: ' WRONG', cannot: 'cannot' };

const pad = (text: unknown, width: number): string =>
  String(text) + ' '.repeat(Math.max(0, width - String(text).length));

/** The prose in `questions.ts` is written for a README as well as for this. */
const plain = (text: string): string => text.split('**').join('').split('`').join('"');

const worlds = buildWorlds();
const rows = measure(worlds);
const counts = tally(rows);

// Every column as wide as its widest cell. The first version fixed the truth
// column at six characters, which fits a count and not an average, and the
// table came out ragged the moment a mean appeared in it.
const ASKS = Math.max(...rows.map((r) => plain(r.asks).length));
const TRUTH = Math.max(5, ...rows.map((r) => r.truth.length));
const MARKS = 9;

const RULE = '  ' + '─'.repeat(ASKS + TRUTH + 3 * (MARKS + 2) + 2);

console.log('');
console.log(`  ${pad('', ASKS)}  ${pad('truth', TRUTH)}  ${pad('documents', MARKS)}  ${pad('flat', MARKS)}  flat+ids`);
console.log(RULE);

for (const row of rows) {
  const marks = (['documents', 'flat', 'flatWithIds'] as Which[]).map((which) =>
    pad(MARK[row[which].verdict], MARKS)
  );
  console.log(`  ${pad(plain(row.asks), ASKS)}  ${pad(row.truth, TRUTH)}  ${marks.join('  ')}`);
}

console.log(RULE);
console.log('');

for (const [which, label] of [
  ['documents', 'documents'],
  ['flat', 'flat'],
  ['flatWithIds', 'flat+ids'],
] as Array<[Which, string]>) {
  const c = counts[which];
  console.log(`  ${pad(label, 12)} right ${c.right}   wrong ${c.wrong}   cannot answer ${c.cannot}`);
}

// ── the rows worth reading ──────────────────────────────────────────────────
//
// A wrong answer and an unanswerable question are different findings, and a
// column of six characters cannot say which is which — so they are printed
// underneath in words. The wrong ones are the point: every one of them came
// back from a query nobody could fault, on data where nothing failed.

const notes = (row: Row, which: Which, label: string): string | null => {
  const said = row[which];
  if (said.verdict === 'right') return null;

  return said.verdict === 'cannot'
    ? `      ${pad(label, 10)} cannot answer it. ${said.why}`
    : `      ${pad(label, 10)} says ${said.said}, and the answer is ${said.instead}. Nothing about the result says so.`;
};

console.log('');

for (const row of rows) {
  const lines = [
    notes(row, 'documents', 'documents'),
    notes(row, 'flat', 'flat'),
    notes(row, 'flatWithIds', 'flat+ids'),
  ].filter(Boolean);

  if (!lines.length) continue;

  console.log(`  ${plain(row.asks)}`);
  console.log(`      ${plain(row.matters)}`);
  console.log('');
  for (const line of lines) console.log(line);
  console.log('');
}

const failed = counts.flatWithIds.wrong;

if (failed) {
  console.log(`  The flattened store with ids got ${failed} wrong. That is the claim, so this is a failure.`);
} else {
  console.log(`  The flattened store with ids answered all ${rows.length} correctly.`);
}

console.log('');

closeWorlds(worlds);
process.exit(failed ? 1 : 0);
