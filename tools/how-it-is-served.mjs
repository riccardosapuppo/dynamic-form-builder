#!/usr/bin/env node
/**
 * Nobody can be handed yesterday's page.
 *
 *     npm run check:serving
 *
 * A caching header is right in the source and wrong in the response more often
 * than anything else in a small service, and the failure is invisible from
 * inside: everything works, on the machine that has never had an old copy.
 *
 * The specific trap this exists for — met in a sibling project and worth
 * carrying — is that `etag` and `lastModified` are **separate** options in
 * every static file server, and both default to on. Turning off only the first
 * leaves the revalidation that serves somebody a stale page.
 *
 * There is no framework here, so the serving is thirty lines in
 * `src/http/api.js`. That does not make it right; it makes it checkable.
 *
 * It starts its own service on a port nothing else uses, so it can never go
 * green having measured a stranger's process.
 */

import { startTheService } from './with-the-service.mjs';

let checks = 0;
let bad = 0;

function must(what, condition, detail) {
  checks += 1;

  if (condition) return console.log(`  ok    ${what}`);

  bad += 1;
  console.log(`  NO    ${what}`);
  if (detail) console.log(`          ${detail}`);
}

const service = await startTheService();

try {
  console.log(`\nHow ${service.base} serves what it serves\n`);

  for (const path of ['/', '/console.js', '/console.css', '/mark.svg']) {
    const response = await fetch(`${service.base}${path}`);
    const cache = response.headers.get('cache-control') ?? '';

    must(`${path} is served`, response.status === 200, `status ${response.status}`);
    must(`${path} says no-store`, /no-store/.test(cache), cache || '(no Cache-Control at all)');
    must(`${path} carries no ETag`, !response.headers.get('etag'), response.headers.get('etag'));
    must(
      `${path} carries no Last-Modified`,
      !response.headers.get('last-modified'),
      response.headers.get('last-modified')
    );
  }

  // The types, because a module served as text/plain is a module the browser
  // refuses to run — with a console message about MIME types that says nothing
  // about which file.
  const types = {
    '/': 'text/html',
    '/console.js': 'text/javascript',
    '/console.css': 'text/css',
    '/mark.svg': 'image/svg+xml',
  };

  for (const [path, wanted] of Object.entries(types)) {
    const response = await fetch(`${service.base}${path}`);
    const got = response.headers.get('content-type') ?? '';

    must(`${path} is ${wanted}`, got.startsWith(wanted), got);
  }

  // A file that is not there is not the page. A static server that falls back
  // to index.html for everything answers 200 for a typo, and the console then
  // tries to run HTML as JavaScript.
  const missing = await fetch(`${service.base}/nothing-here.js`);
  must('a file that does not exist is a 404', missing.status === 404, String(missing.status));
  must(
    'and not the page in disguise',
    !(missing.headers.get('content-type') ?? '').startsWith('text/html'),
    missing.headers.get('content-type')
  );

  // Nothing above the folder, whatever the request says. `path.join` resolves
  // `..` quite happily, so this is the check that the refusal happens before
  // the disk is touched.
  for (const climb of ['/../package.json', '/..%2Fpackage.json', '/%2e%2e/package.json']) {
    const response = await fetch(`${service.base}${climb}`);
    const body = await response.text();

    must(`${climb} gets nothing`, !body.includes('"name": "dynamic-form-builder"'), `status ${response.status}`);
  }

  // ── the API says what it is ───────────────────────────────────────────────

  const health = await (await fetch(`${service.base}/api/health`)).json();

  // Parsed, not searched for. A step that greps a JSON body for `"ok":true`
  // goes red the day somebody indents the response — a red that costs an hour,
  // because it sends you looking at the service rather than at the check.
  must('health says it is ok', health.ok === true, JSON.stringify(health));
  must('and how many questions the measurement asks', health.questions === 8, String(health.questions));
  must('and what the claim is', /8 of 8/.test(health.claim ?? ''), health.claim);

  const nowhere = await fetch(`${service.base}/api/nothing`, { method: 'POST' });
  const said = await nowhere.json();
  must('an unknown endpoint is a 404', nowhere.status === 404, String(nowhere.status));
  must('and it says what was asked for', said.you_asked_for === '/api/nothing', JSON.stringify(said));

  // A GET where a POST is meant says so, rather than falling through to the
  // static server and answering with the page.
  const wrongMethod = await fetch(`${service.base}/api/flatten`);
  must('a GET on a POST route is a 405', wrongMethod.status === 405, String(wrongMethod.status));

  // A definition that is not a definition is a sentence, not a stack trace.
  const notJson = await fetch(`${service.base}/api/flatten`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ "definition": ',
  });

  const complaint = await notJson.json();
  must('a half-typed body is a 400', notJson.status === 400, String(notJson.status));
  must('and says it is not JSON', /not JSON/i.test(complaint.error ?? ''), complaint.error);

  // A body nobody should be sending is refused rather than buffered.
  const huge = await fetch(`${service.base}/api/flatten`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ definition: { pages: [], padding: 'x'.repeat(1_100_000) } }),
  }).catch((error) => ({ status: 0, error }));

  must('a body over a megabyte does not get buffered', huge.status !== 200, String(huge.status));

  // ── and the demonstration survives being driven from outside the page ─────

  const flattened = await (
    await fetch(`${service.base}/api/flatten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        definition: { pages: [{ name: 'p', elements: [{ kind: 'text', name: 'Peso (kg)' }] }] },
      }),
    })
  ).json();

  must(
    'a definition sent by hand comes back as columns',
    flattened.attributes?.[0]?.name === 'Peso_kg',
    JSON.stringify(flattened.attributes)
  );

  const measured = await (await fetch(`${service.base}/api/measure`)).json();

  must('the measurement is served whole', measured.rows?.length === 8, String(measured.rows?.length));
  must(
    'and the claim it carries is the one the header shows',
    measured.counts?.flatWithIds?.right === 8,
    JSON.stringify(measured.counts)
  );
} finally {
  await service.stop();
}

console.log('');

if (bad > 0) {
  console.log(`${bad} of ${checks} checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`All ${checks} checks passed.`);
}
