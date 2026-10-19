// String formatting preserves decimal precision, trailing zeros and an unfinished decimal point.
export const formatEditableDecimal = value => {
  const [whole, fraction] = String(value ?? '').split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction);
};
