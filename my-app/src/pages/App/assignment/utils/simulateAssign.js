export const simulateAssign = ({ lineId, dayIndex, cardId }) => {
  return {
    lineId,
    dayIndex,
    cardId,
    status: 'preview',
  };
};
