/**
 * The submissions, invented, and generated deterministically.
 *
 * Half of them answer version 1 and half version 2, which is the point: the
 * question that was renamed between them is answered under **two different
 * names**, and whether those answers end up together is the whole measurement.
 *
 * Everything downstream — the expected answers, the two ways of storing them,
 * the comparison — is worked out from this array. It is the only truth here.
 */

/** Mulberry32: thirty-two bits of state, and the same forms every time. */
function rolls(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  'A. Bianchi', 'B. Rossi', 'C. Verdi', 'D. Neri', 'E. Gallo', 'F. Costa',
  'G. Fontana', 'H. Marino', 'I. Greco', 'J. Bruno', 'K. Ferrari', 'L. Russo',
];

const SMOKING = ['never', 'former', 'current'];
const CONDITIONS = ['diabetes', 'asthma', 'hypertension'];
const OPERATIONS = ['appendix', 'knee', 'cataract', 'gallbladder'];

const HOW_MANY = 120;

/** Where the split falls: everything before this answered version 1. */
export const FIRST_ON_V2 = 60;

function build() {
  const roll = rolls(20260904);
  const out = [];

  for (let n = 0; n < HOW_MANY; n += 1) {
    const onV2 = n >= FIRST_ON_V2;

    const age = 19 + Math.floor(roll() * 62);
    const weight = Math.round((48 + roll() * 55) * 10) / 10;
    const smoker = SMOKING[Math.floor(roll() * SMOKING.length)];

    const conditions = CONDITIONS.filter(() => roll() < 0.28);

    // Only version 2 offers it, so a version 1 submission cannot have answered
    // it. That is "not applicable", which is not the same as "no".
    if (onV2 && roll() < 0.12) conditions.push('coeliac');

    const surgeries = Array.from({ length: Math.floor(roll() * 3) }, () => ({
      Operation: OPERATIONS[Math.floor(roll() * OPERATIONS.length)],
      When: `20${String(15 + Math.floor(roll() * 10)).padStart(2, '0')}-0${1 + Math.floor(roll() * 9)}-1${Math.floor(roll() * 9)}`,
    }));

    const answers = {
      Name: NAMES[n % NAMES.length],
      'Date of birth': `${2026 - age}-0${1 + Math.floor(roll() * 9)}-1${Math.floor(roll() * 9)}`,
      // Written without its accent, the way an export through a system that
      // strips them arrives. The ladder has to find it.
      Eta: age,
      Smoker: smoker,
      'Diagnosed with': conditions,
      'Taking medication': roll() < 0.4,
      'Anything else': roll() < 0.3 ? 'nothing to add' : '',
      'Agrees to be contacted': roll() < 0.85,
      'Symptoms by week': {
        'week 1': { pain: 1 + Math.floor(roll() * 5), sleep: 1 + Math.floor(roll() * 5), appetite: 1 + Math.floor(roll() * 5) },
        'week 2': { pain: 1 + Math.floor(roll() * 5), sleep: 1 + Math.floor(roll() * 5), appetite: 1 + Math.floor(roll() * 5) },
      },
    };

    // The renamed question, answered under whichever name the version used.
    if (onV2) answers['Peso kg'] = weight;
    else answers['Peso (kg)'] = weight;

    // Withdrawn in version 2, so only the earlier submissions have it.
    if (!onV2) answers['How easy was this form'] = 1 + Math.floor(roll() * 5);

    if (surgeries.length) answers['Previous surgery'] = { entries: surgeries };

    /**
     * One submission in twenty carries an answer to a question that is not in
     * the form at all.
     *
     * That is not contrived. It is what an import from a spreadsheet somebody
     * kept alongside looks like, and what a form that used to have a question
     * leaves behind — and it is the thing that has to be recorded rather than
     * dropped, because dropping it is one fewer row and no error.
     */
    /**
     * And some arrive with the question typed by hand.
     *
     * A spreadsheet somebody kept alongside, re-imported later: the same
     * questions, with the capitalisation, the spacing and the hyphen of
     * whoever typed the header row. These are the rungs of the ladder below
     * the exact one, and without them the measurement reports a hundred per
     * cent exact matches and says nothing about what happens when a name is
     * close rather than equal.
     *
     * Each REPLACES the proper key rather than sitting beside it. Two
     * answers to one question is a different problem, and mixing it in here
     * would make both harder to read.
     */
    if (n % 20 === 3) {
      delete answers['Date of birth'];
      answers['  date of birth'] = `${2026 - age}-01-11`;
    }

    if (n % 20 === 17) {
      const key = onV2 ? 'Peso kg' : 'Peso (kg)';
      delete answers[key];
      // U+2010, which is what a word processor makes of a typed hyphen.
      answers[`Peso${String.fromCharCode(0x2010)}kg`] = weight;
    }

    const strays = {};
    if (n % 20 === 7) strays['Fiscal code'] = 'RSSMRA80A01H501U';
    if (n % 20 === 13) strays['Peso'] = weight;

    out.push({
      reference: `S${String(1000 + n)}`,
      onV2,
      at: `2026-0${onV2 ? 4 : 2}-${String(1 + (n % 27)).padStart(2, '0')}`,
      // What the person actually answered, which is the truth.
      truth: { age, weight, smoker, conditions, surgeries: surgeries.length, onV2 },
      answers: { ...answers, ...strays },
    });
  }

  return out;
}

export const SUBMISSIONS = build();
