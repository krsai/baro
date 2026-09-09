export const simulateAssign = ({ factoryId, dayIndex, cardId }) => {
  return {
    factoryId,
    dayIndex,
    cardId,
    status: 'preview',
  };
};
