const DEFAULT_TIME_ZONE = 'Asia/Seoul';

const formatterCache = new Map();

const buildFormatter = (timeZone) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

const getFormatter = (timeZone) => {
  const normalizedTimeZone = String(timeZone || DEFAULT_TIME_ZONE);
  if (!formatterCache.has(normalizedTimeZone)) {
    formatterCache.set(normalizedTimeZone, buildFormatter(normalizedTimeZone));
  }
  return formatterCache.get(normalizedTimeZone);
};

const extractDateParts = (date, timeZone) => {
  try {
    const parts = getFormatter(timeZone).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) return '';
    return `${year}-${month}-${day}`;
  } catch (_error) {
    return '';
  }
};

export const formatDateKeyInTimeZone = (input = new Date(), timeZone = DEFAULT_TIME_ZONE) => {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const byZone = extractDateParts(date, timeZone);
  if (byZone) return byZone;
  return date.toISOString().slice(0, 10);
};

export const todayDateKey = (timeZone = DEFAULT_TIME_ZONE, now = new Date()) =>
  formatDateKeyInTimeZone(now, timeZone);

// Local-timezone (not zoned/Intl) YYYY-MM-DD key for a calendar Date object,
// e.g. schedule/board day cells built from getFullYear/getMonth/getDate.
// Returns '' (never a substituted "today" or a silent "NaN-NaN-NaN") when
// `date` is not a genuinely valid Date - callers must treat '' as "unknown"
// rather than defaulting it to today or index 0.
export const buildLocalDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export { DEFAULT_TIME_ZONE };
