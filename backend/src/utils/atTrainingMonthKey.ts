const normalizeDateKey = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};

export const normalizeMonthKey = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}$/.test(trimmed) ? trimmed : "";
};

export const parseDateKeyParts = (
  dateKey: string
): { year: number; month: number; day: number } | null => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) return null;
  const [yearText, monthText, dayText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
};

export const formatMonthKey = (year: number, month: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;

export const shiftMonthKey = (monthKey: string, offset: number): string => {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return "";
  const [yearText, monthText] = normalized.split("-");
  let year = Number(yearText);
  let month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";

  let remain = Math.trunc(offset);
  while (remain !== 0) {
    if (remain > 0) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      remain -= 1;
      continue;
    }
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    remain += 1;
  }
  return formatMonthKey(year, month);
};

export const toDateKeyInTimeZone = (
  input: unknown,
  timeZone = "Asia/Seoul"
): string => {
  const date = input instanceof Date ? input : new Date(input as any);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return "";
    return `${year}-${month}-${day}`;
  } catch (_error) {
    return date.toISOString().slice(0, 10);
  }
};

export const resolveAtTrainingMonthKey = ({
  now = new Date(),
  timeZone = "Asia/Seoul",
  cutoffDay = 5,
}: {
  now?: Date;
  timeZone?: string;
  cutoffDay?: number;
} = {}): string => {
  const safeCutoffDay = Number.isFinite(cutoffDay)
    ? Math.min(31, Math.max(1, Math.trunc(cutoffDay)))
    : 5;
  const today =
    toDateKeyInTimeZone(now, timeZone) || now.toISOString().slice(0, 10);
  const parts = parseDateKeyParts(today);
  if (!parts) return normalizeMonthKey(today.slice(0, 7));
  const currentMonthKey = formatMonthKey(parts.year, parts.month);
  const monthOffset = parts.day >= safeCutoffDay ? -1 : -2;
  return shiftMonthKey(currentMonthKey, monthOffset) || currentMonthKey;
};

