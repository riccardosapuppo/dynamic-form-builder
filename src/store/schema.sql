-- The schema this project is about: a form's questions, flattened into
-- attributes that belong to the FORM rather than to a version of it.
--
-- In its own file rather than a template literal in db.ts, and not only so
-- that a reader can open it in something that knows SQL. A schema is the
-- part of a system people argue about, and an argument goes better over a
-- file you can diff line by line than over a string embedded in a module.
CREATE TABLE forms (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE
);

CREATE TABLE versions (
  id          INTEGER PRIMARY KEY,
  form_id     INTEGER NOT NULL REFERENCES forms(id),
  number      INTEGER NOT NULL,
  saved_at    TEXT NOT NULL,
  note        TEXT,
  -- The definition, kept whole. It is a tree and it belongs as one: this
  -- column is what the form was, and the tables beside it are what can be
  -- asked about it. Neither replaces the other.
  definition  TEXT NOT NULL,
  UNIQUE (form_id, number)
);

-- Against the FORM, not the version. See the note at the top of this file.
CREATE TABLE attributes (
  id            INTEGER PRIMARY KEY,
  form_id       INTEGER NOT NULL REFERENCES forms(id),
  name          TEXT NOT NULL,
  question      TEXT NOT NULL,
  -- The id the definition gave the question, if it gave one.
  --
  -- It is the only thing that survives a real rename. Peso (kg) to Peso kg
  -- is a spelling change, and the column name catches it because both
  -- become Peso_kg. Peso (kg) to Weight is the same question with nothing
  -- in common, and without an id there is no way to know that and no way
  -- to keep the answers together.
  --
  -- Nullable, because most forms in the world do not have one -- and the
  -- measurement says what that costs.
  question_id   TEXT,
  kind          TEXT NOT NULL,
  type          TEXT NOT NULL,
  choice        TEXT,
  page          TEXT,
  allowed       TEXT,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL,
  UNIQUE (form_id, name)
);

-- Which version offered which question. "Was this asked in March" and "did
-- anybody answer it" are different questions, and one table cannot tell them
-- apart.
CREATE TABLE version_attributes (
  version_id    INTEGER NOT NULL REFERENCES versions(id),
  attribute_id  INTEGER NOT NULL REFERENCES attributes(id),
  called        TEXT NOT NULL,
  PRIMARY KEY (version_id, attribute_id)
);

CREATE TABLE submissions (
  id          INTEGER PRIMARY KEY,
  form_id     INTEGER NOT NULL REFERENCES forms(id),
  version_id  INTEGER NOT NULL REFERENCES versions(id),
  at          TEXT NOT NULL,
  reference   TEXT NOT NULL
);

-- One row per answer, typed on the way in.
--
-- Four columns rather than one, because a value stored as text is a value
-- that has to be cast before it can be summed -- and a cast in a WHERE clause
-- is an index nobody can use and a failure nobody sees when one row of forty
-- thousand is not a number.
CREATE TABLE answers (
  id             INTEGER PRIMARY KEY,
  submission_id  INTEGER NOT NULL REFERENCES submissions(id),
  attribute_id   INTEGER NOT NULL REFERENCES attributes(id),
  as_text        TEXT,
  as_number      REAL,
  as_boolean     INTEGER,
  as_date        TEXT,
  matched        TEXT NOT NULL
);

-- What could not be placed, and why. The point of the whole thing.
CREATE TABLE unplaced (
  id             INTEGER PRIMARY KEY,
  submission_id  INTEGER NOT NULL REFERENCES submissions(id),
  called         TEXT NOT NULL,
  raw            TEXT,
  why            TEXT NOT NULL
);

-- The answers to a matrix or a repeating group, kept whole because they do
-- not fit in a cell. Readable, and not something anybody can put in a WHERE
-- clause -- which is said rather than hidden.
CREATE TABLE kept_whole (
  id             INTEGER PRIMARY KEY,
  submission_id  INTEGER NOT NULL REFERENCES submissions(id),
  -- "called", not "question", and for the same reason as in the table
  -- above: this is the key the answer ARRIVED under. Nothing here matched
  -- it against the form, so calling it a question would be claiming
  -- something the code never checked.
  --
  -- The name it first had cost a backtick inside a template literal, which
  -- closed the schema string in the middle of a comment. The whole schema
  -- is one template literal; no backticks in it.
  called         TEXT NOT NULL,
  kind           TEXT NOT NULL,
  raw            TEXT NOT NULL
);

CREATE INDEX ix_answers_attribute ON answers (attribute_id);
CREATE INDEX ix_answers_submission ON answers (submission_id);
CREATE INDEX ix_unplaced_submission ON unplaced (submission_id);
