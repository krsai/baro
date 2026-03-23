import { MIN_PROCESS_SECONDS } from './processTime';

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

const toOptionalProcessSeconds = (value, fallback = null) => {
  const parsed = toOptionalPositiveNumber(value, fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(MIN_PROCESS_SECONDS, parsed);
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
  const processKey =
    String(process.processKey || process.code || process.id || `PROCESS-${index + 1}`).trim();
  if (!processKey) return null;

  const quantity = Math.max(1, Math.round(toOptionalNumber(process.quantity, 1) || 1));
  const ctSeconds = toOptionalProcessSeconds(
    process.ctSeconds ??
      process.agreedSeconds ??
      process.requestedSeconds ??
      process.proposedSeconds ??
      process.stSeconds
  );
  if (ctSeconds == null) return null;

  return {
    processKey,
    name: String(process.name || process.processName || `공정 ${index + 1}`).trim() || `공정 ${index + 1}`,
    quantity,
    basis: String(process.basis || '').trim() || null,
    stSeconds: toOptionalProcessSeconds(process.stSeconds),
    ctSeconds,
    ctPerPieceSeconds:
      toOptionalPositiveNumber(process.ctPerPieceSeconds ?? process.agreedPerPieceSeconds) ??
      ctSeconds * quantity,
  };
};

export const normalizeAssignmentCtSnapshot = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const processes = (Array.isArray(value.processes) ? value.processes : [])
    .map((process, index) => normalizeSnapshotProcess(process, index))
    .filter(Boolean);
  const quantity = Math.max(
    1,
    Math.round(
      toOptionalPositiveNumber(value.quantity, toOptionalPositiveNumber(value.orderQuantity, 1)) || 1
    )
  );
  const totalCtPerPieceSeconds =
    toOptionalPositiveNumber(value.totalCtPerPieceSeconds ?? value.totalAgreedPerPieceSeconds) ??
    (processes.length > 0
      ? processes.reduce((sum, process) => sum + (Number(process.ctPerPieceSeconds) || 0), 0)
      : null);
  const totalCtSeconds =
    toOptionalPositiveNumber(value.totalCtSeconds ?? value.totalAgreedSeconds) ??
    (totalCtPerPieceSeconds != null ? totalCtPerPieceSeconds * quantity : null);

  return {
    updatedAt: toOptionalDateString(value.updatedAt ?? value.agreedAt),
    updatedBy: String((value.updatedBy ?? value.agreedBy) || '').trim() || null,
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
    totalStPerPieceSeconds: toOptionalPositiveNumber(value.totalStPerPieceSeconds),
    totalCtPerPieceSeconds,
    totalCtSeconds,
    processes,
  };
};

export const resolveAssignmentCtSnapshot = (item) =>
  normalizeAssignmentCtSnapshot(item?.ctSnapshot ?? null);

export const hasAssignmentCtSnapshot = (item) =>
  Boolean(resolveAssignmentCtSnapshot(item)?.totalCtSeconds);

export const resolveAssignmentCtTotalSeconds = (item) => {
  const snapshot = resolveAssignmentCtSnapshot(item);
  if (snapshot?.totalCtSeconds != null) {
    return Math.round(Number(snapshot.totalCtSeconds) || 0);
  }
  const contracted = toOptionalPositiveNumber(item?.contractedSeconds);
  if (contracted != null) return Math.round(contracted);
  const total = toOptionalPositiveNumber(item?.totalSeconds);
  if (total != null) return Math.round(total);
  return 0;
};

export const resolveAssignmentCtUpdatedBy = (item) =>
  String(
    item?.ctUpdatedBy ??
      resolveAssignmentCtSnapshot(item)?.updatedBy ??
      ''
  ).trim() || null;

export const resolveAssignmentCtUpdatedAt = (item) =>
  toOptionalDateString(item?.ctUpdatedAt ?? resolveAssignmentCtSnapshot(item)?.updatedAt);
