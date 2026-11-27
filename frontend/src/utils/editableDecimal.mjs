// String formatting preserves decimal precision, trailing zeros and an unfinished decimal point.
export const normalizeEditableDecimal = value => String(value ?? '').replace(/^([+-]?)0+(?=\d)/, '$1');
export const formatEditableDecimal = value => {
  const [whole, fraction] = normalizeEditableDecimal(value).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : '.' + fraction);
};
