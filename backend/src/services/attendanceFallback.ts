export type AtAttendanceDaySource = "ACTUAL" | "FALLBACK" | "NONE";

export type AtAttendanceDayResolution = {
  seconds: number;
  source: AtAttendanceDaySource;
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
  if (actualEntryExists) {
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
