export type AtAttendanceDaySource = "ACTUAL" | "FALLBACK" | "NONE";

export type AtAttendanceDayResolution = {
  seconds: number;
  source: AtAttendanceDaySource;
};

export const isAtAttendanceFallbackWorkday = ({
  workDate,
  isOrganizationHoliday,
}: {
  workDate: unknown;
  isOrganizationHoliday: boolean;
}) => {
  const normalizedWorkDate =
    typeof workDate === "string" ? workDate.trim() : "";
  if (
    isOrganizationHoliday ||
    !/^\d{4}-\d{2}-\d{2}$/.test(normalizedWorkDate)
  ) {
    return false;
  }
  const parsedDate = new Date(`${normalizedWorkDate}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.getUTCDay() !== 0;
};

export const resolveAtAttendanceQueryDateRange = (
  dateKeys: unknown[]
): { gte: string; lte: string } | null => {
  const normalized = dateKeys
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  if (normalized.length === 0) return null;
  return {
    gte: normalized[0]!,
    lte: normalized[normalized.length - 1]!,
  };
};

export const resolveAtAttendanceDay = ({
  actualEntryExists,
  actualWorkedSeconds,
  isEligibleWorker,
  isOnLeave,
  isWorkingDay,
  fallbackWorkSeconds,
}: {
  actualEntryExists: boolean;
  actualWorkedSeconds: number | null;
  isEligibleWorker: boolean;
  isOnLeave: boolean;
  isWorkingDay: boolean;
  fallbackWorkSeconds: number;
}): AtAttendanceDayResolution => {
  if (actualEntryExists && actualWorkedSeconds !== null) {
    const seconds = Number(actualWorkedSeconds);
    return {
      seconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0,
      source: "ACTUAL",
    };
  }
  if (!isEligibleWorker || isOnLeave || !isWorkingDay) {
    return { seconds: 0, source: "NONE" };
  }
  const fallbackSeconds = Number(fallbackWorkSeconds);
  return {
    seconds:
      Number.isFinite(fallbackSeconds) && fallbackSeconds > 0
        ? Math.round(fallbackSeconds)
        : 0,
    source: "FALLBACK",
  };
};
