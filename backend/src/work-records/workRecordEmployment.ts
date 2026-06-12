export type WorkRecordEmploymentCoverage = {
  originalStartDate: string;
  originalEndDate: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  joinedDateKey: string;
  leftDateKey: string;
  adjusted: boolean;
  valid: boolean;
};

export type WorkRecordEmploymentAdjustment = WorkRecordEmploymentCoverage & {
  workerId: number;
  workerName: string;
};

export const WORK_LOG_EMPLOYMENT_AUTO_NOTE_PREFIX = "[재직기간 자동 조정]";
const WORK_LOG_EMPLOYMENT_AUTO_NOTE_MARKER =
  `\n\n${WORK_LOG_EMPLOYMENT_AUTO_NOTE_PREFIX}\n`;

const normalizeDateKey = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
};

export const resolveWorkRecordEmploymentCoverage = ({
  coverageStartDate,
  coverageEndDate,
  joinedDateKey,
  leftDateKey,
}: {
  coverageStartDate: string;
  coverageEndDate: string;
  joinedDateKey?: string | null;
  leftDateKey?: string | null;
}): WorkRecordEmploymentCoverage => {
  const originalStartDate = normalizeDateKey(coverageStartDate);
  const originalEndDate = normalizeDateKey(coverageEndDate);
  const normalizedJoinedDateKey = normalizeDateKey(joinedDateKey);
  const normalizedLeftDateKey = normalizeDateKey(leftDateKey);
  const effectiveStartDate =
    normalizedJoinedDateKey && normalizedJoinedDateKey > originalStartDate
      ? normalizedJoinedDateKey
      : originalStartDate;
  const effectiveEndDate =
    normalizedLeftDateKey && normalizedLeftDateKey < originalEndDate
      ? normalizedLeftDateKey
      : originalEndDate;
  const valid = Boolean(
    originalStartDate &&
      originalEndDate &&
      originalStartDate <= originalEndDate &&
      effectiveStartDate <= effectiveEndDate
  );

  return {
    originalStartDate,
    originalEndDate,
    effectiveStartDate,
    effectiveEndDate,
    joinedDateKey: normalizedJoinedDateKey,
    leftDateKey: normalizedLeftDateKey,
    adjusted:
      valid &&
      (effectiveStartDate !== originalStartDate ||
        effectiveEndDate !== originalEndDate),
    valid,
  };
};

export const stripWorkLogEmploymentAutoNote = (value: unknown) => {
  const text = typeof value === "string" ? value : "";
  const leadingPrefix = `${WORK_LOG_EMPLOYMENT_AUTO_NOTE_PREFIX}\n`;
  if (text.startsWith(leadingPrefix)) return "";
  const markerIndex = text.indexOf(WORK_LOG_EMPLOYMENT_AUTO_NOTE_MARKER);
  if (markerIndex >= 0) return text.slice(0, markerIndex).trimEnd();
  const prefixIndex = text.indexOf(leadingPrefix);
  return prefixIndex >= 0 ? text.slice(0, prefixIndex).trimEnd() : text.trimEnd();
};

const formatAdjustmentReason = (
  adjustment: WorkRecordEmploymentAdjustment
) => {
  const reasons: string[] = [];
  if (
    adjustment.joinedDateKey &&
    adjustment.effectiveStartDate !== adjustment.originalStartDate
  ) {
    reasons.push(`입사일 ${adjustment.joinedDateKey}`);
  }
  if (
    adjustment.leftDateKey &&
    adjustment.effectiveEndDate !== adjustment.originalEndDate
  ) {
    reasons.push(`퇴사일 ${adjustment.leftDateKey}`);
  }
  return reasons.join(", ");
};

export const buildWorkLogNoteWithEmploymentAdjustments = ({
  note,
  adjustments,
}: {
  note: unknown;
  adjustments: WorkRecordEmploymentAdjustment[];
}) => {
  const baseNote = stripWorkLogEmploymentAutoNote(note);
  const autoNote = adjustments
    .filter((adjustment) => adjustment.adjusted && adjustment.valid)
    .map((adjustment) => {
      const workerLabel =
        adjustment.workerName.trim() || `작업자 #${adjustment.workerId}`;
      const reason = formatAdjustmentReason(adjustment);
      return `- ${workerLabel}: ${adjustment.originalStartDate}~${adjustment.originalEndDate} → ${adjustment.effectiveStartDate}~${adjustment.effectiveEndDate}${reason ? ` (${reason})` : ""}`;
    })
    .join("\n");

  if (!autoNote) return baseNote || null;
  if (!baseNote) {
    return `${WORK_LOG_EMPLOYMENT_AUTO_NOTE_PREFIX}\n${autoNote}`;
  }
  return `${baseNote}${WORK_LOG_EMPLOYMENT_AUTO_NOTE_MARKER}${autoNote}`;
};
