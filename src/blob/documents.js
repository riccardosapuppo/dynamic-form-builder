/**
 * The other way: one JSON document per submission.
 *
 * This is the baseline, and it is not a straw man. It is what anybody sensible
 * builds first, it takes an afternoon, it never loses an answer, and it is
 * **right about a great deal**. SQLite has `json_extract` and `json_each`, so a
 * surprising number of questions can be answered straight out of the documents
 * without any of the machinery this project is about.
 *
 * The measurement exists to say precisely which questions those are, and which
 * ones it gets wrong — and, more importantly, **which of the wrong ones look
 * right**.
 *
 * Three things it cannot do, and one it can do badly:
 *
 *   - **types.** A document keeps whatever the browser sent. A number typed
 *     into a form is `7` on one submission and `"7"` on the next, and an
 *     average over the column averages the ones that happened to be numbers.
 *   - **renames.** Two versions of a form, two keys, and any query naming one
 *     of them silently gets half the answers.
 *   - **what was even asked.** A key that is absent might mean "did not answer"
 *     or "was never offered the question", and a document cannot tell them
 *     apart.
 *   - **sets**, badly: a checkbox is an array, so counting who ticked one
 *     choice needs `json_each` and a guess about the shape, and returns nothing
 *     rather than an error when the guess is wrong.
 */

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  CREATE TABLE documents (
    id          INTEGER PRIMARY KEY,
    form        TEXT NOT NULL,
    version     INTEGER NOT NULL,
    at          TEXT NOT NULL,
    reference   TEXT NOT NULL,
    -- Everything, as it arrived. Nothing is lost and nothing is understood.
    answers     TEXT NOT NULL
  );

  CREATE INDEX ix_documents_form ON documents (form);
`;

export function documents() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);

  const put = db.prepare('INSERT INTO documents (form, version, at, reference, answers) VALUES (?, ?, ?, ?, ?)');

  return {
    db,

    close() {
      db.close();
    },

    keep(form, version, submission) {
      put.run(form, version, submission.at, submission.reference, JSON.stringify(submission.answers));
    },

    run(sql, params = []) {
      return db.prepare(sql).all(...params);
    },

    /**
     * The count of documents whose answer to `key` is not empty.
     *
     * This is the query anybody writes, and it is right — for one key. What it
     * cannot know is that the question was called something else last quarter.
     */
    answered(key) {
      return Number(
        this.run(
          `SELECT COUNT(*) AS n FROM documents
            WHERE json_extract(answers, '$.' || ?) IS NOT NULL
              AND json_extract(answers, '$.' || ?) != ''`,
          [key, key]
        )[0].n
      );
    },

    /**
     * The average of a numeric answer.
     *
     * `CAST(... AS REAL)` in SQLite turns anything unparseable into 0 rather
     * than failing, so a column with three text answers in it comes back lower
     * and nothing says so. That is the type problem, exactly as it arrives.
     */
    average(key) {
      const said = this.run(
        `SELECT AVG(CAST(json_extract(answers, '$.' || ?) AS REAL)) AS avg,
                COUNT(json_extract(answers, '$.' || ?)) AS n
           FROM documents`,
        [key, key]
      )[0];

      return { average: said.avg === null ? null : Number(said.avg), of: Number(said.n) };
    },

    /**
     * How many ticked one choice of a checkbox.
     *
     * `json_each` over the array, which works — and only because the shape was
     * guessed correctly. An implementation that stored the same answer as a
     * comma-separated string would need entirely different SQL, and the query
     * cannot tell which it is looking at without opening one and checking.
     */
    ticked(key, choice) {
      return Number(
        this.run(
          `SELECT COUNT(DISTINCT d.id) AS n
             FROM documents d, json_each(json_extract(d.answers, '$.' || ?)) AS one
            WHERE one.value = ?`,
          [key, choice]
        )[0].n
      );
    },

    /** Every key any document has, which is the closest thing to a schema. */
    keys() {
      return this.run(
        `SELECT DISTINCT one.key AS key
           FROM documents d, json_each(d.answers) AS one
          ORDER BY one.key`
      ).map((row) => row.key);
    },
  };
}
