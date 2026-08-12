const clampPercent = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
};

// Low confidence is a strong red warning. As confidence approaches 100%,
// both saturation and contrast fade into a quiet, pale stable-state label.
export const resolveReliabilityRiskColor = (value) => {
  const percent = clampPercent(value);
  const progress = percent / 100;
  const risk = 1 - progress;
  // Keep low and medium confidence visibly red. Only the stable range begins
  // shifting toward green, while the label continues fading toward 100%.
  const stableProgress = Math.max(0, (percent - 70) / 30);
  const hue = Math.round(stableProgress * 112);
  const backgroundSaturation = Math.round(24 + risk * 48);
  const backgroundLightness = Math.round(97 - risk * 20);
  const textSaturation = Math.round(18 + risk * 58);
  const textLightness = Math.round(48 - risk * 20);

  return {
    bg: `hsl(${hue} ${backgroundSaturation}% ${backgroundLightness}%)`,
    text: `hsl(${hue} ${textSaturation}% ${textLightness}%)`,
  };
};
