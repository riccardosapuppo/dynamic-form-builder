#!/usr/bin/env node
/**
 * Every path the README names is a path in the repository.
 *
 *     npm run check:paths
 *
 * The map under "How it is put together" was written when these files ended in
 * `.js`, and the day the runtime learned to read the types they were all
 * renamed at once. Eleven paths in the prose went on naming files that were no
 * longer there — nothing imports the README, so nothing failed, and the only
 * reader the mistake reached was somebody opening the repository for the first
 * time and typing one of them.
 *
 * So the paths are looked up rather than believed. Everything the README points
 * at — the map, a filename in a sentence, the picture behind a link — is found
 * on disk or the build is red. The alternative is a second copy of the list
 * kept in step by remembering, and the copy is always the one that goes stale.
 *
 * What is not a path: a URL, a package name (`@types/node`), a route the
 * service answers (`/api/health`), and anything carrying a colon —
 * `node:sqlite`, `:memory:`, and every `npm run check:…` in the prose. They sit
 * in backticks like the paths do, and a check that reported them would be a
 * check somebody switches off rather than reads.
 *
 * It fails when it finds nothing to look up. An extractor that quietly stopped
 * matching would otherwise announce a repository in perfect order.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

/**
 * What makes a bare word a filename.
 *
 * A path is obvious once it has a slash in it; `match.ts` in the middle of a
 * sentence is not, and neither is `24.x` or `71.895`, which are also a word
 * with a dot in it. Naming the endings is what keeps the two apart.
 */
const ENDINGS = new Set(['ts', 'js', 'json', 'sql', 'css', 'html', 'svg', 'png', 'md', 'yml']);

type Named = { what: string; line: number };

function candidate(word: string): string | null {
  const token = word.replace(/^[("'*]+/, '').replace(/[).,;:"'*]+$/, '');

  if (!token) return null;

  // One colon disposes of most of what is not a path: every URL, `node:sqlite`,
  // `:memory:`, `127.0.0.1:4000` and every `npm run check:…`. Then a package, a
  // flag, an anchor — and a route, which is the one that looks most like a file
  // and is answered by the service rather than found on disk.
  if (token.includes(':')) return null;
  if (token.startsWith('@') || token.startsWith('-') || token.startsWith('#') || token.startsWith('/')) return null;

  // The dot has to be in the word, not assumed. Reading the ending off the last
  // segment of a word without one made `JSON` in "one JSON document per
  // submission" a missing file, which is a check crying about English.
  const dot = token.lastIndexOf('.');
  const ending = dot > 0 ? token.slice(dot + 1) : '';

  if (!token.includes('/') && !ENDINGS.has(ending.toLowerCase())) return null;

  return token;
}

const named: Named[] = [];
const already = new Set<string>();

function name(what: string | null, line: number): void {
  if (!what || already.has(what)) return;

  already.add(what);
  named.push({ what, line });
}

let fenced = false;

readme.split('\n').forEach((text, index) => {
  const line = index + 1;

  if (text.startsWith('```')) {
    fenced = !fenced;
    return;
  }

  // A link target is a path whatever it looks like: `LICENSE` has no slash and
  // no ending, and the README still promises the file is there.
  for (const link of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = link[1] ?? '';

    if (target.includes('://') || target.startsWith('#') || target.startsWith('mailto')) continue;

    name(target, line);
  }

  // In a fenced block every word is a candidate — the map is a block, and so is
  // the list of commands. Outside one, only what is in backticks: prose calls a
  // file `src/measure/truth.ts` and calls a fortnight two weeks.
  const words = fenced
    ? text.split(/\s+/)
    : [...text.matchAll(/`([^`]+)`/g)].flatMap((span) => (span[1] ?? '').split(/\s+/));

  for (const word of words) name(candidate(word), line);
});

if (named.length === 0) {
  console.error('Nothing in README.md looked like a path, which is not a README this project has.');
  console.error('The check found nothing to look up, so it is reporting that rather than a pass.');
  process.exit(1);
}

/** Everything the repository holds, so a filename named without its folder can still be found. */
function everything(folder: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;

    const full = path.join(folder, entry.name);

    if (entry.isDirectory()) everything(full, found);
    else found.push(path.relative(root, full).split(path.sep).join('/'));
  }

  return found;
}

const files = everything(root);

let bad = 0;

console.log(`\nEvery path README.md names, looked up on disk\n`);

for (const { what, line } of named) {
  const at = `README.md:${line}`;
  const full = path.join(root, what);

  let found: string | null = null;

  if (what.endsWith('/')) {
    // A folder is named as a folder, and a file standing where one is promised
    // is still the README being wrong about the shape of the repository.
    found = fs.existsSync(full) && fs.statSync(full).isDirectory() ? what : null;
  } else if (what.includes('/')) {
    found = fs.existsSync(full) ? what : null;
  } else {
    found = files.find((one) => one === what || one.endsWith(`/${what}`)) ?? null;
  }

  if (found) {
    console.log(`  ok    ${what.padEnd(28)}${at}${found === what ? '' : `  → ${found}`}`);
  } else {
    bad += 1;
    console.log(`  NO    ${what.padEnd(28)}${at}  nothing of that name is in the repository`);
  }
}

console.log('');

if (bad > 0) {
  console.log(`${bad} of ${named.length} paths the README names are not there.`);
  process.exitCode = 1;
} else {
  console.log(`All ${named.length} paths the README names are in the repository.`);
}
