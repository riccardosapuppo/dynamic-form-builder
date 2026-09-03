/**
 * Putting an answer back with the question it answers.
 *
 * ── Why this is a problem at all ─────────────────────────────────────────────
 *
 * A submission arrives keyed by question name. The columns were worked out when
 * the form was **saved**. Those two lists ought to be identical and routinely
 * are not, for reasons none of which is anybody's fault:
 *
 *   - the form was edited, and a question was renamed. `Peso (kg)` became
 *     `Peso kg`, or somebody fixed a typo;
 *   - the answer came from a copy of the form filled in before that edit;
 *   - the accents were stripped on one side and not the other;
 *   - somebody exported the answers through a system that turned every
 *     non-alphanumeric into a space.
 *
 * **And the failure is silent.** An answer whose question cannot be found is not
 * an error: it is one fewer row. The total still adds up, the page still draws,
 * and the count is quietly low. That is the failure this whole file exists for,
 * and it is why nothing here throws — it returns what it did and what it could
 * not do, so a caller can report it.
 *
 * ── The ladder ───────────────────────────────────────────────────────────────
 *
 * Three rungs, tried in order, each looser than the last:
 *
 *   1. **exactly**, which is almost always enough and costs nothing;
 *   2. **normalised** — accents off, lowercased, whitespace collapsed;
 *   3. **loosely** — plus every dash and underscore and punctuation mark
 *      treated as a space.
 *
 * The third rung is where it gets dangerous, and where the interesting rule is:
 * **a loose match is refused when more than one question answers to it.**
 * `Peso-kg` and `Peso kg` both loosen to `peso kg`, and guessing between them
 * would put somebody's weight against the wrong question — which is worse than
 * not recording it, because it is wrong rather than absent.
 */

/** Rung two: accents off, lowercased, whitespace collapsed. */
/** The least an attribute has to have for the ladder to index it. */
export type Matchable = {
  name: string;
  question: string;
  alsoCalled?: string[];
  [more: string]: unknown;
};

export type Found<T extends Matchable = Matchable> =
  | { found: T; how: 'exactly' | 'normalised' | 'loosely'; why?: undefined }
  | { found: null; how?: undefined; why: string };

export type Finder<T extends Matchable = Matchable> = {
  readonly size: number;
  readonly ambiguous: string[];
  find(name: string): Found<T>;
};

export function normalised(name: unknown): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Rung three: and every separator is a space.
 *
 * The dash range matters. A form filled in by somebody who typed in a word
 * processor has en dashes and non-breaking hyphens in it, which are different
 * characters from the hyphen on a keyboard and look identical on a screen.
 */
export function loosely(name: unknown): string {
  const base = normalised(name);
  if (!base) return '';

  return base
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * An index over a form's attributes, able to find one by whatever a submission
 * happened to call it.
 *
 * Built once per form rather than per answer: a submission with forty answers
 * against a form with sixty columns is otherwise two thousand comparisons, and
 * the loop that does that is the one somebody finds in a profiler.
 */
export function index<T extends Matchable>(attributes: T[]): Finder<T> {
  const exactly = new Map();
  const byNormal = new Map();
  const byLoose = new Map();

  /** Loose keys that more than one question answers to, and are therefore refused. */
  const ambiguous = new Set<string>();

  for (const attribute of attributes) {
    // Its column name, the question it came from, and every name it has ever
    // had.
    //
    // The first two because a submission keyed by the question — which is what
    // a person writes — has to find the column, and one keyed by the column has
    // to as well.
    //
    // The last of those is not a nicety. When a question is renamed the
    // column is renamed with it -- which is what keeps the answers together --
    // and the answers given before the rename arrive under the old name. An
    // index built only from what it is called today cannot place a single one
    // of them, so a rename that was handled perfectly still loses half the
    // data. It cost sixty answers to find, in a run where nothing errored.
    const every = new Set([attribute.name, attribute.question, ...(attribute.alsoCalled ?? [])]);

    for (const known of every) {
      if (!known) continue;

      if (!exactly.has(known)) exactly.set(known, attribute);

      const normal = normalised(known);
      if (normal && !byNormal.has(normal)) byNormal.set(normal, attribute);

      const loose = loosely(known);
      if (!loose) continue;

      const already = byLoose.get(loose);

      // Ambiguous only if it loosens onto a DIFFERENT attribute. The same
      // attribute reached twice — once by its column name and once by its
      // question — is one attribute, not a conflict.
      if (already && already !== attribute) ambiguous.add(loose);
      else if (!already) byLoose.set(loose, attribute);
    }
  }

  return {
    get size() {
      return exactly.size;
    },

    get ambiguous() {
      return [...ambiguous];
    },

    /**
     * @returns {{found: Attribute, how: 'exactly'|'normalised'|'loosely'}
     *   | {found: null, why: string}}
     */
    find(name: string): Found<T> {
      const exact = exactly.get(name);
      if (exact) return { found: exact, how: 'exactly' };

      const normal = byNormal.get(normalised(name));
      if (normal) return { found: normal, how: 'normalised' };

      const loose = loosely(name);

      if (ambiguous.has(loose)) {
        return {
          found: null,
          // Named rather than silent: this is a question that needs a person,
          // and it is one that no amount of retrying will resolve.
          why: `"${name}" could be more than one question, so it is not guessed`,
        };
      }

      const looseMatch = byLoose.get(loose);
      if (looseMatch) return { found: looseMatch, how: 'loosely' };

      return { found: null, why: `nothing in this form is called "${name}"` };
    },
  };
}
