const DEFAULT_ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT = 10;

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT = toPositiveNumber(
  import.meta.env.VITE_ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT,
  DEFAULT_ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT
);
