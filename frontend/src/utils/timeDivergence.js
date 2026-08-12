import { ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT } from '../constants/timeThresholds';

export const TIME_DIVERGENCE_SEVERITY = {
  NORMAL: 'NORMAL',
  REVIEW: 'REVIEW',
  CRITICAL: 'CRITICAL',
};

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const calculateDivergencePercent = (current, base) => {
  const currentValue = Number(current);
  const baseValue = Number(base);
  if (!Number.isFinite(currentValue) || !Number.isFinite(baseValue) || baseValue <= 0) {
    return null;
  }
  return ((currentValue - baseValue) / baseValue) * 100;
};

export const formatDivergencePercentLabel = (value, fallback = '-') => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const sign = parsed > 0 ? '+' : '';
  return `${sign}${parsed.toFixed(1)}%`;
};

export const resolveDivergenceMeta = (
  value,
  {
    reviewThresholdPercent = ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT,
    criticalThresholdPercent = ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT * 2,
  } = {}
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return {
      percent: null,
      absolutePercent: null,
      severity: TIME_DIVERGENCE_SEVERITY.NORMAL,
      needsReview: false,
    };
  }

  const safeReviewThreshold = toPositiveNumber(
    reviewThresholdPercent,
    ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT
  );
  const safeCriticalThreshold = Math.max(
    safeReviewThreshold,
    toPositiveNumber(criticalThresholdPercent, safeReviewThreshold * 2)
  );
  const absolutePercent = Math.abs(parsed);

  let severity = TIME_DIVERGENCE_SEVERITY.NORMAL;
  if (absolutePercent >= safeCriticalThreshold) {
    severity = TIME_DIVERGENCE_SEVERITY.CRITICAL;
  } else if (absolutePercent >= safeReviewThreshold) {
    severity = TIME_DIVERGENCE_SEVERITY.REVIEW;
  }

  return {
    percent: parsed,
    absolutePercent,
    severity,
    needsReview: absolutePercent >= safeReviewThreshold,
  };
};

const DIVERGENCE_COLOR_PALETTE = {
  positive: {
    [TIME_DIVERGENCE_SEVERITY.NORMAL]: { bg: '#FDECEC', text: '#C2413B' },
    [TIME_DIVERGENCE_SEVERITY.REVIEW]: { bg: '#F8CCCC', text: '#B42318' },
    [TIME_DIVERGENCE_SEVERITY.CRITICAL]: { bg: '#EFA5A5', text: '#861414' },
  },
  negative: {
    [TIME_DIVERGENCE_SEVERITY.NORMAL]: { bg: '#E8F2FD', text: '#2F6FAE' },
    [TIME_DIVERGENCE_SEVERITY.REVIEW]: { bg: '#C9E0F7', text: '#1F5F9D' },
    [TIME_DIVERGENCE_SEVERITY.CRITICAL]: { bg: '#9FC7EE', text: '#174A7E' },
  },
  neutral: { bg: '#ECEFF3', text: '#5F6B7A' },
};

export const resolveDivergenceColor = (meta) => {
  const percent = Number(meta?.percent);
  if (!Number.isFinite(percent) || percent === 0) return DIVERGENCE_COLOR_PALETTE.neutral;
  const directionPalette = percent > 0
    ? DIVERGENCE_COLOR_PALETTE.positive
    : DIVERGENCE_COLOR_PALETTE.negative;
  return directionPalette[meta?.severity] || directionPalette[TIME_DIVERGENCE_SEVERITY.NORMAL];
};
