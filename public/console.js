/**
 * The console.
 *
 * No framework and no build step: the page is served as it is written, which
 * for a demonstration of about six hundred lines is the arrangement with the
 * fewest things in it that can be wrong.
 *
 * Every fact on this page comes from the service. The definitions, the numbers
 * each preset promises, the measurement, the prose explaining a wrong answer —
 * all of it is fetched. Nothing here is a second copy of something in `src/`,
 * because a page holding its own copy of the fixtures is a page that keeps
 * agreeing with itself after the fixtures change.
 */

const $ = (what) => document.querySelector(what);

const at = {
  presets: $('[data-presets]'),
  presetSays: $('[data-preset-says]'),
  editor: $('[data-editor]'),
  editorTally: $('[data-editor-tally]'),
  editorBad: $('[data-editor-bad]'),
  columns: $('[data-columns] tbody'),
  columnsTally: $('[data-columns-tally]'),
  notFit: $('[data-notfit]'),
  trouble: $('[data-trouble]'),
  save: $('[data-save]'),
  reset: $('[data-reset]'),
  storeTally: $('[data-store-tally]'),
  changes: $('[data-changes]'),
  form: $('[data-form]'),
  formTally: $('[data-form-tally]'),
  fill: $('[data-fill]'),
  stray: $('[data-stray]'),
  landed: $('[data-landed] tbody'),
  landedTally: $('[data-landed-tally]'),
  aftermath: $('[data-aftermath]'),
  measure: $('[data-measure] tbody'),
  findings: $('[data-findings]'),
  claimFigure: $('[data-claim-figure]'),
};

const send = async (where, body) => {
  const said = await fetch(where, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  return said.json();
};

const text = (tag, className, content) => {
  const made = document.createElement(tag);
  if (className) made.className = className;
  if (content !== undefined) made.textContent = content;
  return made;
};

const empty = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

// ── 1. the tree, and the table it becomes ───────────────────────────────────

let presets = [];
let chosen = null;

/**
 * Re-flatten as somebody types, but not on every keystroke.
 *
 * A definition is small and flattening it is microseconds, so this is not about
 * load. It is that a half-typed JSON document is invalid JSON, and a page that
 * flashed a parse error on every character of a paste would be unusable.
 */
let pending = null;

function whenTheyStopTyping() {
  clearTimeout(pending);
  pending = setTimeout(reflatten, 220);
}

async function reflatten() {
  let definition;

  try {
    definition = JSON.parse(at.editor.value);
  } catch (error) {
    at.editorBad.textContent = `That is not valid JSON — ${error.message}`;
    at.editorBad.hidden = false;
    return;
  }

  at.editorBad.hidden = true;

  const said = await send('/api/flatten', { definition });

  if (said.error) {
    at.editorBad.textContent = said.error;
    at.editorBad.hidden = false;
    return;
  }

  drawColumns(said);
}

function drawColumns(said) {
  empty(at.columns);

  for (const one of said.attributes) {
    const row = text('tr');
    row.dataset.question = one.question;

    const name = text('td');
    name.append(text('span', 'name', one.name));
    if (one.renamedFrom) name.append(text('span', 'soft', ` (was ${one.renamedFrom})`));
    row.append(name);

    const from = text('td');
    from.append(text('span', null, one.question));
    if (one.choice) from.append(text('span', 'choice', one.choice));
    row.append(from);

    row.append(text('td', 'soft', one.kind));
    row.append(text('td', 'soft', one.type + (one.allowed ? ` of ${one.allowed.length}` : '')));

    // Hovering one column of a checkbox lights the rest of them. That a
    // question can be several columns is the first surprising thing here, and
    // it is easier to see than to read.
    row.addEventListener('mouseenter', () => light(one.question));
    row.addEventListener('mouseleave', () => light(null));

    at.columns.append(row);
  }

  at.columnsTally.textContent = `${said.counted.columns} columns`;

  at.editorTally.textContent =
    `${said.counted.questions} questions` +
    (said.counted.doesNotFit ? `, ${said.counted.doesNotFit} of which cannot be columns` : '');

  empty(at.notFit);

  for (const one of said.doesNotFit) {
    at.notFit.append(note(one.question, one.why));
  }

  empty(at.trouble);

  for (const one of said.trouble) {
    at.trouble.append(note('trouble', one));
  }

  if (!said.doesNotFit.length && !said.trouble.length) {
    at.trouble.append(note('nothing', 'Every question in this definition became a column.', true));
  }
}

function light(question) {
  for (const row of at.columns.children) {
    row.classList.toggle('lit', Boolean(question) && row.dataset.question === question);
  }
}

function note(what, why, good) {
  const made = text('div', good ? 'note good' : 'note');
  made.append(text('span', 'note-what', what));
  made.append(text('span', 'note-why', why));
  return made;
}

function drawPresets() {
  empty(at.presets);

  for (const one of presets) {
    const button = text('button', null, one.name);
    button.type = 'button';
    button.dataset.preset = one.key;
    button.setAttribute('aria-pressed', 'false');

    // What pressing it must produce, stated by the service and shown here.
    // `npm run check:screen` presses every one of these and compares the
    // sentence against what the page then displays.
    button.dataset.expectColumns = String(one.expect.columns);
    button.dataset.expectNotfit = String(one.expect.doesNotFit);
    button.dataset.expectTrouble = String(one.expect.trouble);

    button.addEventListener('click', () => choose(one.key));

    at.presets.append(button);
  }
}

function choose(key) {
  const one = presets.find((p) => p.key === key);
  if (!one) return;

  chosen = key;

  for (const button of at.presets.children) {
    button.setAttribute('aria-pressed', String(button.dataset.preset === key));
  }

  at.presetSays.textContent =
    `${one.says} — ${one.expect.columns} columns, ` +
    `${one.expect.doesNotFit} that cannot be, ${one.expect.trouble} reported as trouble.`;

  at.editor.value = JSON.stringify(one.definition, null, 2);
  reflatten();
}

// ── 2. saving a version ─────────────────────────────────────────────────────

/**
 * How many times this has been drawn.
 *
 * Read by `npm run check:screen`, which has to press "save" and then look at
 * the result. Waiting for the panel to have any content at all is waiting for
 * something that was drawn at startup: it returns instantly, and every check
 * after it reads the page before the answer arrives. A counter says what the
 * check actually needs to know, which is that a NEW draw has happened.
 */
let drawnChanges = 0;

function drawChanges(saved, state) {
  empty(at.changes);

  if (saved) {
    at.changes.append(
      list('new columns', saved.added, (one) => text('span', 'name', one)),
      list('renamed, and their answers with them', saved.renamed, (one) => {
        const line = document.createDocumentFragment();
        line.append(text('span', 'was', one.was));
        line.append(text('span', null, ' → '));
        line.append(text('span', 'name', one.now));
        line.append(text('span', 'how', ` matched by ${one.how}`));
        return line;
      }),
      list('no longer asked, and not deleted', saved.gone, (one) => text('span', 'was', one))
    );
  }

  at.changes.append(
    list('answers nothing could place', state.unplaced, (one) => {
      const line = document.createDocumentFragment();
      line.append(text('span', 'name', one.called));
      line.append(text('span', 'how', ` ×${one.n}`));
      return line;
    })
  );

  at.storeTally.textContent =
    `${state.versions.length} version${state.versions.length === 1 ? '' : 's'}, ` +
    `${state.columns.length} columns, ${state.submissions} submission${state.submissions === 1 ? '' : 's'}`;

  drawnChanges += 1;
  at.changes.dataset.drawn = String(drawnChanges);
}

function list(title, items, draw) {
  const made = text('div', 'change');
  made.append(text('h4', null, title));

  const ul = text('ul');

  if (!items || !items.length) {
    ul.append(text('li', 'none', 'nothing'));
  } else {
    for (const one of items) {
      const li = text('li');
      li.append(draw(one));
      ul.append(li);
    }
  }

  made.append(ul);
  return made;
}

// ── 3. the form, rendered from the version the store is on ──────────────────

let liveDefinition = null;
let extras = 0;

function drawForm(definition) {
  liveDefinition = definition;
  empty(at.form);

  let asked = 0;

  const walk = (elements, into) => {
    for (const element of elements ?? []) {
      if (element.kind === 'panel') {
        const box = text('div', 'panelled');
        box.append(text('div', 'legend', element.name));
        walk(element.elements, box);
        into.append(box);
        continue;
      }

      if (element.kind === 'matrix' || element.kind === 'repeating') {
        const said = text('div', 'wont-fit');
        said.append(text('b', null, element.name));
        said.append(
          text(
            'span',
            null,
            element.kind === 'matrix'
              ? ' — a grid of answers, kept whole. None of them is the answer to the matrix.'
              : ' — as many answers as somebody adds, kept whole. A column cannot say how many in advance.'
          )
        );
        into.append(said);
        asked += 1;
        continue;
      }

      into.append(field(element));
      asked += 1;
    }
  };

  for (const page of definition.pages ?? []) {
    walk(page.elements, at.form);
  }

  at.formTally.textContent = `${asked} questions, as this version asks them`;
}

function field(element) {
  const box = text('div', 'question');
  const id = `q-${Math.random().toString(36).slice(2, 9)}`;

  const label = element.kind === 'choices' ? text('div', 'legend') : text('label');
  if (label.tagName === 'LABEL') label.htmlFor = id;
  label.append(text('span', null, element.label ?? element.name));
  label.append(text('span', 'kind', element.kind));
  box.append(label);

  // Every input carries the question name it will be submitted under. That is
  // the key the ladder has to match, so it is the thing worth being explicit
  // about — and it is what makes editing it in the definition visible here.
  const named = (node) => {
    node.name = element.name;
    node.id = id;
    node.dataset.asks = element.name;
    return node;
  };

  if (element.kind === 'choices') {
    const ticks = text('div', 'ticks');

    for (const choice of element.choices ?? []) {
      const value = typeof choice === 'string' ? choice : choice.value;
      const shown = typeof choice === 'string' ? choice : (choice.label ?? choice.value);

      const wrap = text('label', 'tick');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = element.name;
      input.value = value;
      input.dataset.asks = element.name;

      wrap.append(input, text('span', null, shown));
      ticks.append(wrap);
    }

    box.append(ticks);
    return box;
  }

  if (element.kind === 'choice' || element.kind === 'rating') {
    const select = named(document.createElement('select'));
    select.append(text('option', null, ''));

    const choices =
      element.kind === 'rating' ? (element.choices ?? [1, 2, 3, 4, 5]) : (element.choices ?? []);

    for (const choice of choices) {
      const value = typeof choice === 'object' ? choice.value : choice;
      const option = text('option', null, typeof choice === 'object' ? (choice.label ?? value) : String(value));
      option.value = String(value);
      select.append(option);
    }

    box.append(select);
    return box;
  }

  if (element.kind === 'yesno') {
    const select = named(document.createElement('select'));
    for (const one of ['', 'yes', 'no']) select.append(Object.assign(text('option', null, one), { value: one }));
    box.append(select);
    return box;
  }

  if (element.kind === 'paragraph') {
    box.append(named(document.createElement('textarea')));
    return box;
  }

  const input = named(document.createElement('input'));
  input.type = element.kind === 'date' ? 'date' : element.kind === 'number' || element.kind === 'integer' ? 'number' : 'text';
  if (element.kind === 'number') input.step = 'any';
  box.append(input);

  return box;
}

/** What the form says, keyed the way a browser would send it. */
function answersFromTheForm() {
  const answers = {};

  for (const node of at.form.querySelectorAll('[data-asks]')) {
    const asks = node.dataset.asks;

    if (node.type === 'checkbox') {
      if (!answers[asks]) answers[asks] = [];
      if (node.checked) answers[asks].push(node.value);
      continue;
    }

    if (node.value === '') continue;

    answers[asks] = node.value;
  }

  for (const node of at.form.querySelectorAll('[data-stray-field]')) {
    if (node.value !== '') answers[node.dataset.strayField] = node.value;
  }

  return answers;
}

/**
 * An answer to a question the form does not ask.
 *
 * The most useful thing in the store and the easiest thing to lose, so it has
 * its own button. Dropping one of these is one fewer row and no error anywhere.
 */
function addAStray() {
  extras += 1;

  const called = ['Fiscal code', 'Peso', 'Insurance number', 'Referred by'][extras % 4];

  const box = text('div', 'question');
  box.append(text('label', null, `${called} — a question this form does not ask`));

  const input = document.createElement('input');
  input.type = 'text';
  input.value = 'something somebody typed';
  input.dataset.strayField = called;

  box.append(input);
  at.form.append(box);
}

function drawLanded(said) {
  empty(at.landed);

  for (const one of said.landed) {
    const row = text('tr');
    row.append(text('td', 'name', one.column_name));
    row.append(text('td', null, one.value === null ? '—' : String(one.value)));
    row.append(text('td', 'soft', one.matched));
    at.landed.append(row);
  }

  at.landedTally.textContent = `${said.landed.length} answers placed`;

  empty(at.aftermath);

  for (const one of said.filled.unplaced) {
    at.aftermath.append(note(one.called, one.why));
  }

  for (const one of said.filled.wrongType) {
    at.aftermath.append(note(one.called, one.why ?? 'that is not the type this column holds, so it was not cast into it'));
  }

  for (const one of said.filled.keptWhole) {
    at.aftermath.append(note(one, 'kept whole — it does not fit in a cell, and nothing about it is lost'));
  }
}

// ── 4. the measurement ──────────────────────────────────────────────────────

function drawMeasure(measured) {
  empty(at.measure);

  const plain = (what) => what.split('**').join('');

  for (const row of measured.rows) {
    const tr = text('tr');
    tr.append(text('td', null, plain(row.asks)));
    tr.append(text('td', 'name', row.truth));

    for (const which of ['documents', 'flat', 'flatWithIds']) {
      const said = row[which];
      const cell = text('td');

      cell.append(text('span', `verdict ${said.verdict}`, said.verdict));

      if (said.verdict === 'wrong') cell.append(text('span', 'verdict-said', `said ${said.said}`));
      if (said.verdict === 'cannot') cell.append(text('span', 'verdict-said', 'no query says it'));

      tr.append(cell);
    }

    at.measure.append(tr);
  }

  const c = measured.counts.flatWithIds;
  at.claimFigure.textContent = `${c.right} of ${measured.rows.length} right`;

  empty(at.findings);

  for (const row of measured.rows) {
    const lines = [
      ['documents', row.documents],
      ['flattened', row.flat],
      ['with ids', row.flatWithIds],
    ].filter(([, said]) => said.verdict !== 'right');

    if (!lines.length) continue;

    const made = text('div', 'finding');
    made.append(text('h4', null, plain(row.asks)));
    made.append(text('p', null, plain(row.matters).split('`').join('"')));

    const ul = text('ul');

    for (const [who, said] of lines) {
      const li = text('li');
      li.append(text('span', 'who', who));

      li.append(
        text(
          'span',
          null,
          said.verdict === 'cannot'
            ? said.why
            : `says ${said.said}, and the answer is ${said.instead}. Nothing about the result says so.`
        )
      );

      ul.append(li);
    }

    made.append(ul);
    at.findings.append(made);
  }
}

// ── starting ───────────────────────────────────────────────────────────────

at.editor.addEventListener('input', whenTheyStopTyping);

at.save.addEventListener('click', async () => {
  let definition;

  try {
    definition = JSON.parse(at.editor.value);
  } catch (error) {
    at.editorBad.textContent = `That is not valid JSON — ${error.message}`;
    at.editorBad.hidden = false;
    return;
  }

  const said = await send('/api/save', { definition, note: chosen ?? 'edited by hand' });

  if (said.error) {
    at.editorBad.textContent = said.error;
    at.editorBad.hidden = false;
    return;
  }

  drawChanges(said.saved, said.state);
  drawForm(said.state.definition);
});

at.reset.addEventListener('click', async () => {
  const said = await send('/api/reset', {});

  drawChanges(null, said.state);
  drawForm(said.state.definition);

  empty(at.landed);
  empty(at.aftermath);
  at.landedTally.textContent = '';
  extras = 0;
});

at.stray.addEventListener('click', addAStray);

at.fill.addEventListener('click', async () => {
  const said = await send('/api/fill', { answers: answersFromTheForm() });

  drawLanded(said);
  drawChanges(null, said.state);
});

async function start() {
  const [gotPresets, state, measured] = await Promise.all([
    send('/api/presets'),
    send('/api/state'),
    send('/api/measure'),
  ]);

  presets = gotPresets.presets;

  drawPresets();
  choose(presets[0].key);
  drawChanges(null, state);
  drawForm(state.definition);
  drawMeasure(measured);

  // The page says when it is finished drawing, so a check that presses a button
  // presses it after there is something to press. Waiting on a timeout instead
  // is a check that passes on a fast machine and fails on a loaded one.
  document.body.dataset.ready = 'yes';
}

start();
