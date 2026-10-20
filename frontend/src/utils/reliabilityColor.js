import { getLabelPalette } from '../theme/labelPalette';

// Shared thresholds for style list and process detail labels.
export const RELIABILITY_HIGH_PERCENT = 90;
export const RELIABILITY_MEDIUM_PERCENT = 70;
export const resolveReliabilityRiskColor = (value) => {
  const percent = value == null ? NaN : Number(value);
  const tone = Number.isFinite(percent) && percent >= RELIABILITY_HIGH_PERCENT ? 'green'
    : Number.isFinite(percent) && percent >= RELIABILITY_MEDIUM_PERCENT ? 'yellow' : 'gray';
  const palette = getLabelPalette(tone);
  return { bg: palette.background, text: palette.text };
};
