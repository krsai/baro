export const calculateCardLoad = ({ stTotalSeconds }) => {
  const resolvedSeconds = Number(stTotalSeconds);
  if (!Number.isFinite(resolvedSeconds) || resolvedSeconds <= 0) return 0;
  return resolvedSeconds;
};

export const calculateRemainingCapacity = ({ capacitySeconds, usedSeconds }) => {
  return Math.max(capacitySeconds - usedSeconds, 0);
};
