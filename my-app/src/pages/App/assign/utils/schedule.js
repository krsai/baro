export const calculateCardLoad = ({ totalSeconds, quantity }) => {
  if (!totalSeconds || !quantity) return 0;
  return totalSeconds * quantity;
};

export const calculateRemainingCapacity = ({ capacitySeconds, usedSeconds }) => {
  return Math.max(capacitySeconds - usedSeconds, 0);
};
