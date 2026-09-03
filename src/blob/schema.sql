-- The other way: one JSON document per submission.
--
-- Two columns of metadata and everything else in one text column. That is
-- the whole schema, which is exactly the appeal of it -- and the reason
-- every question in src/measure/questions.ts is harder to ask of it.
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
