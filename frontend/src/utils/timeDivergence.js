import { getLabelPalette } from '../theme/labelPalette';
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

// Small deviations remain neutral; review severity is calculated independently.
export const DIVERGENCE_NEUTRAL_THRESHOLD_PERCENT = 1;
export const resolveDivergenceColor = (meta) => {
  const percent = meta?.percent == null ? NaN : Number(meta.percent);
  const tone = !Number.isFinite(percent) || Math.abs(percent) < DIVERGENCE_NEUTRAL_THRESHOLD_PERCENT
    ? 'gray' : percent > 0 ? 'orange' : 'blue';
  const palette = getLabelPalette(tone);
  return { bg: palette.background, text: palette.text };
};
