// Mirrors COMMIT_FLAGS in importer/parse_commit_message.mjs for client-side views.

export const COMMIT_FLAGS = {
  AI:              1 << 0,
  REVERT:          1 << 1,
  RELAND:          1 << 2,
  ROLL:            1 << 3,
  FIX:             1 << 4,
  NO_TRY:          1 << 5,
  NO_PRESUBMIT:    1 << 6,
  NO_TREE_CHECKS:  1 << 7,
  OWNERS_OVERRIDE: 1 << 8,
  BYPASS:          1 << 9,
  BOT_COMMIT:      1 << 10,
  CO_AUTHORED:     1 << 11,
} as const;

export const MSG_EXCLUDE_MASK = COMMIT_FLAGS.REVERT | COMMIT_FLAGS.ROLL;
export const BYPASS_MASK =
  COMMIT_FLAGS.NO_TRY |
  COMMIT_FLAGS.NO_PRESUBMIT |
  COMMIT_FLAGS.NO_TREE_CHECKS |
  COMMIT_FLAGS.OWNERS_OVERRIDE |
  COMMIT_FLAGS.BYPASS;

export const medianOf = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export const meanOf = (values: number[]): number | null => {
  if (!values.length) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
};
