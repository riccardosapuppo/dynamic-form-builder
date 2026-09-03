#!/usr/bin/env node
/**
 * Starts the service and opens the console.
 *
 *     npm start
 *     npm start -- --port 4001 --no-open
 *
 * Localhost only, with no default that reaches further. Nothing here is
 * anybody's data — every form and every submission is invented in
 * `src/fixtures/` — but a tool that binds every interface the moment it starts
 * has made that decision on behalf of whoever runs it next.
 *
 * 4000, and not 3000. That is the port every project on a machine uses in turn,
 * and a browser remembers service workers, storage and permissions per origin —
 * so two projects sharing a port share state neither knows about.
 */

import { openInABrowser } from './open-a-browser.js';
import { service } from './http/api.js';

function argument(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const PORT = Number(argument('port', process.env.PORT ?? 4000));
const HOST = argument('host', process.env.HOST ?? '127.0.0.1');

function log(level, message, detail = {}) {
  // One JSON object per line: a log a person greps and a log a machine parses
  // are the same log, and the moment they are not, one of them stops being kept.
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), level, message, ...detail })}\n`);
}

const { server, close } = service({ log });

server.listen(PORT, HOST, () => {
  log('info', 'listening', {
    console: `http://${HOST}:${PORT}`,
    holds: 'everything in memory, thrown away when this stops',
    forms: 'invented — no clinic, no patient, no real form anywhere in this repository',
  });

  const browser = openInABrowser(`http://${HOST}:${PORT}/`);
  log('info', browser.opened ? 'the console is open' : 'the console was not opened', { why: browser.why });
});

/**
 * A port that is already taken is a sentence, not a stack trace.
 *
 * Node's default is eleven lines ending in EADDRINUSE, which says what happened
 * to somebody who already knows and nothing to anybody else. It happens on
 * every second start during development, and what the reader needs is the flag
 * that fixes it.
 */
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    log('error', `something is already listening on ${HOST}:${PORT}`, {
      likely: 'another copy of this, or another project using the same port',
      try: `npm start -- --port ${PORT + 1}`,
    });

    process.exit(1);
  }

  log('error', 'the service stopped', { why: error.message });
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('info', 'stopping');
    server.close(() => {
      close();
      process.exit(0);
    });
  });
}
