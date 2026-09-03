/**
 * The service, and the console it serves.
 *
 * `node:http` and nothing else. A project whose subject is "what a form
 * definition costs you later" would be a strange place to install forty
 * packages, and the whole of it — the flattening, the store, the measurement —
 * runs on the runtime.
 *
 * ── What the console is for ──────────────────────────────────────────────────
 *
 * The argument of this project is a gap: a form is **authored as a tree** and
 * **asked about as a table**, and everything difficult lives in between. That
 * is a sentence, and a sentence is easy to nod at and hard to believe.
 *
 * So the console puts the two side by side and lets somebody move the tree.
 * Edit the definition and the columns it becomes change under it, live —
 * including the two questions that produce no column at all, and the reasons.
 * Then fill the form in and watch each answer arrive in a column, or fail to,
 * with the rung that found it.
 *
 * Every number `npm run measure` prints is also on this page. A recruiter is
 * not going to clone a repository and run a script, and a claim that can only
 * be checked from a terminal is a claim most people take on trust.
 */

import fs from 'node:fs';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { flatten } from '../flatten/attributes.ts';
import { store } from '../store/db.ts';
import { measure, tally } from '../measure/questions.ts';
import { buildWorlds } from '../measure/worlds.ts';
import { whatCanBeAsked, whatCouldNotBePlaced, howAnswersWereMatched } from '../answers/ask.ts';
import {
  AWKWARD,
  INTAKE_V1,
  INTAKE_V1_IDS,
  INTAKE_V2,
  INTAKE_V2_IDS,
  INTAKE_V2_RENAMED,
} from '../fixtures/forms.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', '..', 'public');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/**
 * The definitions the console offers, in the order that tells the story.
 *
 * Each carries what pressing it must produce. The page prints that sentence
 * under the buttons, and `npm run check:screen` presses every one of them and
 * compares it against what the page then shows -- so a button that promises a
 * behaviour is checked against the thing that behaves, rather than against a
 * number somebody typed twice.
 *
 * They are the fixtures the tests and the measurement use — the same objects,
 * not a copy written for the page. A demonstration built on its own data is a
 * demonstration of nothing, and the second time somebody edits the fixtures the
 * two drift apart and only one of them fails.
 */
const PRESETS = [
  {
    key: 'v1',
    expect: { columns: 12, doesNotFit: 2, trouble: 0 },
    name: 'Patient intake, version 1',
    says: 'As somebody first built it. Twelve columns, and two questions that cannot be columns.',
    definition: INTAKE_V1,
  },
  {
    key: 'v2',
    expect: { columns: 12, doesNotFit: 2, trouble: 0 },
    name: 'Version 2 — a choice added, a question withdrawn',
    says: 'A fourth condition, and nobody is asked how easy the form was any more. Save it over version 1 and see what the store decides.',
    definition: INTAKE_V2,
  },
  {
    key: 'v2renamed',
    expect: { columns: 12, doesNotFit: 2, trouble: 0 },
    name: 'Version 2, with a question renamed',
    says: '"Anything else" is now "Other notes". Nothing in the two names is the same, so without an id it is a new column.',
    definition: INTAKE_V2_RENAMED,
  },
  {
    key: 'v1ids',
    expect: { columns: 12, doesNotFit: 2, trouble: 0 },
    name: 'Version 1, with an id on every question',
    says: 'One extra field per question. Save the version below over this one and the rename keeps its answers.',
    definition: INTAKE_V1_IDS,
  },
  {
    key: 'v2ids',
    expect: { columns: 12, doesNotFit: 2, trouble: 0 },
    name: 'Version 2, renamed, with ids',
    says: '"Other notes" carries the id "Anything else" had. That one line is the difference between a rename and a fresh start.',
    definition: INTAKE_V2_IDS,
  },
  {
    key: 'awkward',
    expect: { columns: 3, doesNotFit: 0, trouble: 4 },
    name: 'A form somebody typed in a hurry',
    says: 'Two questions that collide, one that cannot become a column, a kind nobody knows and an empty list of choices. Four kinds of trouble, all reported.',
    definition: AWKWARD,
  },
];

const FORM = 'Patient intake';

/**
 * The measurement, computed once.
 *
 * It builds three stores and fills three hundred and sixty submissions into
 * them, which takes long enough to notice and produces exactly the same answer
 * every time — the fixtures are deterministic and there is no clock in them. A
 * page that recomputed it per request would be slower for no difference at all.
 */
function theMeasurement() {
  const worlds = buildWorlds();
  const rows = measure(worlds);
  const counts = tally(rows);

  const columns = worlds.flatWithIds.kept
    .run('SELECT name, question, kind, choice, first_seen, last_seen FROM attributes WHERE form_id = ? ORDER BY id', [
      worlds.flatWithIds.formId,
    ]);

  const unplaced = whatCouldNotBePlaced(worlds.flatWithIds.kept, worlds.flatWithIds.formId);
  const matched = howAnswersWereMatched(worlds.flatWithIds.kept, worlds.flatWithIds.formId);

  worlds.documents.close();
  worlds.flat.kept.close();
  worlds.flatWithIds.kept.close();

  return {
    rows,
    counts,
    columns,
    unplaced: unplaced.map((one) => ({ ...one, n: Number(one.n) })),
    matched: matched.map((one) => ({ ...one, n: Number(one.n) })),
  };
}

export type Log = (level: string, message: string, detail?: Record<string, unknown>) => void;

export function service({ log = () => {} }: { log?: Log } = {}) {
  const measured = theMeasurement();

  /**
   * The store the console writes into, which is a different thing from the
   * three the measurement built.
   *
   * In memory, thrown away when the process stops, and resettable from the
   * page. Somebody is going to save a nonsense version and fill in half a form
   * to see what happens, and they should be able to put it back.
   */
  let live = fresh();

  function fresh() {
    const kept = store();
    const first = kept.save(FORM, INTAKE_V1, { note: 'as first built', at: '2026-01-10' });
    return { kept, formId: first.formId, versions: [first], filled: [] as number[] };
  }

  const server = http.createServer((request, response) => {
    const at = new URL(request.url ?? '/', 'http://127.0.0.1');

    try {
      if (at.pathname.startsWith('/api/')) return api(at, request, response);
      return serve(at, response);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);

      log('error', 'the request could not be handled', { where: at.pathname, why });
      json(response, 500, { error: why });
    }
  });

  return { server, close: () => live.kept.close() };

  // -------------------------------------------------------------------------

  function api(at: URL, request: IncomingMessage, response: ServerResponse): void {
    if (at.pathname === '/api/health') {
      return json(response, 200, {
        ok: true,
        presets: PRESETS.length,
        questions: measured.rows.length,
        claim: `the flattened store with ids answers ${measured.counts.flatWithIds.right} of ${measured.rows.length}`,
        dependencies: 'none at runtime — node:http and node:sqlite',
      });
    }

    /** The definitions, so the page never carries a copy of its own. */
    if (at.pathname === '/api/presets') {
      return json(response, 200, { presets: PRESETS });
    }

    if (at.pathname === '/api/measure') {
      return json(response, 200, measured);
    }

    /** What the live store looks like now. */
    if (at.pathname === '/api/state') {
      return json(response, 200, state());
    }

    if (request.method !== 'POST') {
      return json(response, 405, { error: 'that route wants a POST', you_used: request.method });
    }

    return body(request, (sent: Record<string, unknown> | null, why?: string) => {
      if (why) return json(response, 400, { error: why });

      /**
       * The tree, and the table it becomes. No store, no submission, nothing
       * kept — this is what the page calls on every keystroke.
       */
      if (at.pathname === '/api/flatten') {
        if (!sent?.definition) return json(response, 400, { error: 'send a definition' });

        const { attributes, doesNotFit, trouble } = flatten(sent.definition);

        return json(response, 200, {
          attributes,
          doesNotFit,
          trouble,
          counted: {
            questions: attributes.length + doesNotFit.length,
            columns: attributes.length,
            doesNotFit: doesNotFit.length,
            trouble: trouble.length,
          },
        });
      }

      /** Save a version over what the live store already has. */
      if (at.pathname === '/api/save') {
        if (!sent?.definition) return json(response, 400, { error: 'send a definition' });

        const said = live.kept.save(FORM, sent.definition, {
          note: String(sent.note ?? '').slice(0, 200),
          at: '2026-03-20',
        });

        live.versions.push(said);

        return json(response, 200, { saved: said, state: state() });
      }

      /** Fill the form in, and say what happened to every answer. */
      if (at.pathname === '/api/fill') {
        const version = live.versions[live.versions.length - 1];

        const said = live.kept.fill(
          live.formId,
          version!.versionId,
          (sent?.answers ?? {}) as Record<string, unknown>,
          {
            at: '2026-04-01',
            reference: `C${1000 + live.filled.length}`,
          }
        );

        const landed = live.kept.run(
          `SELECT t.name AS column_name, a.matched,
                  COALESCE(a.as_text, CAST(a.as_number AS TEXT), CAST(a.as_boolean AS TEXT), a.as_date) AS value
             FROM answers a
             JOIN attributes t ON t.id = a.attribute_id
            WHERE a.submission_id = ?
            ORDER BY t.id`,
          [said.submissionId]
        );

        live.filled.push(said.submissionId);

        return json(response, 200, { filled: said, landed, state: state() });
      }

      /** Put it back the way it started. */
      if (at.pathname === '/api/reset') {
        live.kept.close();
        live = fresh();
        return json(response, 200, { state: state() });
      }

      return json(response, 404, { error: 'no such route', you_asked_for: at.pathname });
    });
  }

  function state() {
    const current = live.versions[live.versions.length - 1];

    return {
      /**
       * The definition the live store is currently on.
       *
       * The page renders the form from this rather than from whatever is in the
       * editor, because the answers go into this version. A form rendered from
       * one definition and submitted against another is a demonstration of
       * something nobody asked about.
       */
      definition: JSON.parse(
        live.kept.run<{ definition: string }>('SELECT definition FROM versions WHERE id = ?', [
          current.versionId,
        ])[0]!.definition
      ),

      versions: live.versions.map((one, at) => ({
        number: one.number,
        // `note` is what the caller passed to save(); the report does not carry
        // it back, so the page shows the version number instead of inventing one.
        note: '',
        added: one.added,
        renamed: one.renamed,
        gone: one.gone,
        trouble: one.trouble,
        doesNotFit: one.doesNotFit,
        first: at === 0,
      })),

      columns: whatCanBeAsked(live.kept, live.formId),

      submissions: Number(
        live.kept.run('SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?', [live.formId])[0].n
      ),

      unplaced: whatCouldNotBePlaced(live.kept, live.formId).map((one) => ({ ...one, n: Number(one.n) })),

      matched: howAnswersWereMatched(live.kept, live.formId).map((one) => ({ ...one, n: Number(one.n) })),

      keptWhole: live.kept
        .run(
          `SELECT k.called, k.kind, COUNT(*) AS n
             FROM kept_whole k JOIN submissions s ON s.id = k.submission_id
            WHERE s.form_id = ?
            GROUP BY k.called, k.kind`,
          [live.formId]
        )
        .map((one) => ({ ...one, n: Number(one.n) })),
    };
  }
}

/**
 * Read a JSON body, with a size it will not go past.
 *
 * A definition is a few kilobytes. Anything above a megabyte is either a
 * mistake or somebody being interesting, and a server that buffers whatever
 * arrives is a server that can be stopped by one request.
 */
function body(
  request: IncomingMessage,
  then: (sent: Record<string, unknown> | null, why?: string) => void
): void {
  const parts: Buffer[] = [];
  let size = 0;

  request.on('data', (chunk: Buffer) => {
    size += chunk.length;

    if (size > 1_000_000) {
      request.destroy();
      return then(null, 'that body is larger than a megabyte, which no form definition is');
    }

    parts.push(chunk);
  });

  request.on('end', () => {
    if (size > 1_000_000) return;

    try {
      then(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {});
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      then(null, `that is not JSON: ${why}`);
    }
  });
}

/**
 * The page and its files.
 *
 * `no-store` on everything. These files carry no hash in their names, so a
 * cached copy is one that never updates — and a browser remembers per origin,
 * so somebody who ran a different project on this port has that project's
 * answers in the same drawer.
 */
function serve(at: URL, response: ServerResponse): void {
  const name = at.pathname === '/' ? 'index.html' : at.pathname.slice(1);
  const file = path.join(PUBLIC, name);

  // Refuse anything that climbs out, before touching the disk. `path.join`
  // resolves `..` quite happily, and a static server that did not check is a
  // static server that serves whatever is above it.
  if (!file.startsWith(PUBLIC + path.sep)) {
    return json(response, 403, { error: 'no' });
  }

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return json(response, 404, { error: 'no such file', you_asked_for: at.pathname });
  }

  response.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });

  response.end(fs.readFileSync(file));
}

function json(response: ServerResponse, status: number, sent: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });

  response.end(JSON.stringify(sent, null, 2));
}
