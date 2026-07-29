// FSRS (Free Spaced Repetition Scheduler) — the memory-model scheduler that
// modern Anki uses by default. This is a clean-room implementation of
// FSRS-4.5 with the published default parameters.
//
// The model tracks two hidden variables per card:
//   - stability (S): days for retrievability to fall from 100% to ~90%.
//   - difficulty (D): 1..10, how hard the card is to raise in stability.
// Retrievability R(t,S) follows a power-law forgetting curve. On each review
// the grade (1 Again / 2 Hard / 3 Good / 4 Easy) updates D and S, and the next
// interval is the number of days after which R falls to the target retention.
//
// Default parameters can later be optimised on the user's own review log; the
// defaults below already schedule sensibly (at 90% retention the interval is
// approximately equal to the stability, in days).

const W = [
  0.4197, 1.1869, 3.0412, 15.2441, 7.1434, 0.6477, 1.0007, 0.0674, 1.6597,
  0.1712, 1.1178, 2.0225, 0.0904, 0.3025, 2.1214, 0.2498, 2.9466,
];

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81
const REQUEST_RETENTION = 0.9;
const MIN_D = 1;
const MAX_D = 10;
const MIN_S = 0.1;
const MAX_INTERVAL = 36500; // ~100 years

// Grades
export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
export const EASY = 4;

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

function initStability(g) {
  return Math.max(W[g - 1], MIN_S);
}

function initDifficulty(g) {
  return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, MIN_D, MAX_D);
}

/** Power-law retrievability after `t` days at stability `s`. */
export function retrievability(t, s) {
  return Math.pow(1 + (FACTOR * Math.max(0, t)) / s, DECAY);
}

/** Days until retrievability drops to the target retention. ≈ stability. */
function nextInterval(stability) {
  const ivl = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(ivl), 1, MAX_INTERVAL);
}

function nextDifficulty(d, g) {
  const next = d - W[6] * (g - 3);
  // Mean-reversion toward the difficulty an "Easy" first answer would give.
  const reverted = W[7] * initDifficulty(EASY) + (1 - W[7]) * next;
  return clamp(reverted, MIN_D, MAX_D);
}

function stabilityAfterRecall(d, s, r, g) {
  const hardPenalty = g === HARD ? W[15] : 1;
  const easyBonus = g === EASY ? W[16] : 1;
  const inc =
    Math.exp(W[8]) *
    (11 - d) *
    Math.pow(s, -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return s * (1 + inc);
}

function stabilityAfterForget(d, s, r) {
  return W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
}

/**
 * Schedule a review.
 * @param prev  previous FSRS state {stability, difficulty, reps, lapses} or
 *              null/uninitialised for a card's first review.
 * @param grade 1 Again | 2 Hard | 3 Good | 4 Easy.
 * @param elapsedDays days since the last review (ignored on first review).
 * @returns {stability, difficulty, reps, lapses, interval}
 */
export function schedule(prev, grade, elapsedDays) {
  const g = clamp(Math.round(grade), AGAIN, EASY);
  let stability;
  let difficulty;
  let reps;
  let lapses;

  if (!prev || !prev.stability) {
    stability = initStability(g);
    difficulty = initDifficulty(g);
    reps = 1;
    lapses = g === AGAIN ? 1 : 0;
  } else {
    const r = retrievability(elapsedDays, prev.stability);
    difficulty = nextDifficulty(prev.difficulty, g);
    if (g === AGAIN) {
      stability = stabilityAfterForget(prev.difficulty, prev.stability, r);
      lapses = (prev.lapses || 0) + 1;
    } else {
      stability = stabilityAfterRecall(prev.difficulty, prev.stability, r, g);
      lapses = prev.lapses || 0;
    }
    reps = (prev.reps || 0) + 1;
  }

  stability = Math.max(stability, MIN_S);
  return { stability, difficulty, reps, lapses, interval: nextInterval(stability) };
}
