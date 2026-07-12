const toOptionalNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const toOptionalPositiveNumber = (value, fallback = null) => {
  const parsed = toOptionalNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};
const toOptionalPositiveInt = (value, fallback = null) => {
  const parsed = toOptionalPositiveNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.trunc(parsed));
};
const toOptionalNonNegativeNumber = (value, fallback = null) => {
  const parsed = toOptionalNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const toOptionalProcessSeconds = (value, fallback = null) => {
  const parsed = toOptionalPositiveNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(0, Math.round(parsed));
};

const toOptionalDateString = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const normalizeSnapshotProcess = (process, index = 0) => {
  if (!process || typeof process !== 'object' || Array.isArray(process)) return null;
  const processKey = String(
    process.processKey || process.processCode || process.code || process.id || `PROCESS-${index + 1}`
  ).trim();
  if (!processKey) return null;

  const timesPerPiece = Math.max(
    1,
    Math.round(toOptionalNumber(process.timesPerPiece ?? process.quantity, 1) || 1)
  );
  const rawPieceCtSeconds = toOptionalPositiveNumber(process.pieceCtSeconds ?? process.ctPerPieceSeconds);
  const snapshotCtSeconds =
    toOptionalProcessSeconds(process.snapshotCtSeconds ?? process.ctSeconds) ??
    rawPieceCtSeconds;
  if (snapshotCtSeconds == null) return null;
  const pieceCtSeconds = rawPieceCtSeconds ?? snapshotCtSeconds;

  const fallbackName = `\uACF5\uC815 ${index + 1}`;
  return {
    styleProcessId: toOptionalPositiveInt(
      process.styleProcessId ?? process.processId,
      null
    ),
    processKey,
    processCode: String(process.processCode || process.code || '').trim() || null,
    name: String(process.name || process.processName || fallbackName).trim() || fallbackName,
    nameKo: String(process.nameKo || process.processNameKo || '').trim(),
    nameEn: String(process.nameEn || process.processNameEn || '').trim(),
    nameVi: String(process.nameVi || process.processNameVi || '').trim(),
    timesPerPiece,
    basis: String(process.basis || '').trim() || null,
    snapshotCtSeconds,
    pieceCtSeconds,
  };
};

export const normalizeAssignmentCtSnapshot = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const processes = (Array.isArray(value.processes) ? value.processes : [])
    .map((process, index) => normalizeSnapshotProcess(process, index))
    .filter(Boolean);
  const quantity =
    toOptionalNonNegativeNumber(value.quantity, toOptionalNonNegativeNumber(value.orderQuantity, null)) != null
      ? Math.max(
          0,
          Math.round(
            Number(
              toOptionalNonNegativeNumber(
                value.quantity,
                toOptionalNonNegativeNumber(value.orderQuantity, null)
              ) || 0
            )
          )
        )
      : null;
  const pieceCtTotalSeconds =
    toOptionalNonNegativeNumber(value.pieceCtTotalSeconds ?? value.totalCtPerPieceSeconds) ??
    (processes.length > 0
      ? processes.reduce((sum, process) => sum + (Number(process.pieceCtSeconds) || 0), 0)
      : null);
  const assignmentCtTotalSeconds =
    toOptionalNonNegativeNumber(value.assignmentCtTotalSeconds ?? value.totalCtSeconds) ??
    (pieceCtTotalSeconds != null && quantity != null ? pieceCtTotalSeconds * quantity : null);

  return {
    updatedAt: toOptionalDateString(value.updatedAt),
    updatedBy: String(value.updatedBy || '').trim() || null,
    quantity,
    schedule:
      value.schedule && typeof value.schedule === 'object' && !Array.isArray(value.schedule)
        ? {
            startIndex: toOptionalNumber(value.schedule.startIndex),
            endIndex: toOptionalNumber(value.schedule.endIndex),
            startDayOffsetPercent: toOptionalNumber(value.schedule.startDayOffsetPercent),
            startDayPercent: toOptionalNumber(value.schedule.startDayPercent),
            endDayPercent: toOptionalNumber(value.schedule.endDayPercent),
            startDateKey: String(value.schedule.startDateKey || '').trim() || null,
            endDateKey: String(value.schedule.endDateKey || '').trim() || null,
          }
        : null,
    pieceCtTotalSeconds,
    assignmentCtTotalSeconds,
    processes,
  };
};

export const resolveAssignmentCtSnapshot = (item) =>
  normalizeAssignmentCtSnapshot(item?.assignmentCtSnapshot ?? item?.ctSnapshot ?? null);

const resolveAssignmentCtTotalSecondsOrNull = (item) => {
  const snapshot = resolveAssignmentCtSnapshot(item);
  if (snapshot?.assignmentCtTotalSeconds != null) {
    return Math.round(Number(snapshot.assignmentCtTotalSeconds) || 0);
  }
  const assignmentCtTotalSeconds = toOptionalNonNegativeNumber(
    item?.assignmentCtTotalSeconds ?? item?.ctTotalSeconds
  );
  if (assignmentCtTotalSeconds != null) return Math.round(assignmentCtTotalSeconds);
  return null;
};
export const hasAssignmentCtSnapshot = (item) => {
  const snapshot = resolveAssignmentCtSnapshot(item);
  return Boolean(snapshot) && resolveAssignmentCtTotalSecondsOrNull(item) !== null;
};

export const resolveAssignmentCtTotalSeconds = (item) => {
  return resolveAssignmentCtTotalSecondsOrNull(item) ?? 0;
};

export const resolveAssignmentCtUpdatedBy = (item) =>
  String(item?.ctUpdatedBy ?? resolveAssignmentCtSnapshot(item)?.updatedBy ?? '').trim() || null;

export const resolveAssignmentCtUpdatedAt = (item) =>
  toOptionalDateString(item?.ctUpdatedAt ?? resolveAssignmentCtSnapshot(item)?.updatedAt);
