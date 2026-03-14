export const calculateCardLoad = ({ totalSeconds }) => {
  const resolvedSeconds = Number(totalSeconds);
  if (!Number.isFinite(resolvedSeconds) || resolvedSeconds <= 0) return 0;
  return resolvedSeconds;
};

export const calculateRemainingCapacity = ({ capacitySeconds, usedSeconds }) => {
  return Math.max(capacitySeconds - usedSeconds, 0);
};
