import { formatNumberWithCommas } from './numberFormat';

const toOptionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 0 ? 0 : parsed;
};

const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const hasTime = (value) => typeof value === 'number' && Number.isFinite(value);

export const normalizeProcess = (process = {}, index = 0) => {
  const { st: _legacySt, ...safeProcess } = process || {};

  return {
    ...safeProcess,
    instanceId:
      typeof safeProcess.instanceId === 'string' && safeProcess.instanceId.trim()
        ? safeProcess.instanceId
        : `${safeProcess.code || 'PROC'}-${safeProcess.id || index}-${index}`,
    quantity: toPositiveInt(safeProcess.quantity, 1),
    pt: toOptionalNumber(safeProcess.pt),
    at: toOptionalNumber(safeProcess.at),
  };
};

export const normalizeProcesses = (processes) => {
  if (!Array.isArray(processes)) return [];
  return processes.map((process, index) => normalizeProcess(process, index));
};

// AT is now calculated via regression analysis from work records.
// Legacy ST keys are ignored and stripped during normalization.
// AT represents actual work time including sub-tasks (thread tangles, adjustments, rework).
// Foundation hook: connect work log regression-based AT here once Work domain is integrated.
export const resolveProcessActualTime = ({ existingAt = null, workStats = null }) => {
  if (workStats && typeof workStats === 'object' && workStats.actualTime != null) {
    return toOptionalNumber(workStats.actualTime);
  }
  return toOptionalNumber(existingAt);
};

export const calculateProcessLineTotal = (process, key) => {
  if (!process || (key !== 'pt' && key !== 'at')) return null;
  const time = toOptionalNumber(process[key]);
  if (time === null) return null;
  const quantity = toPositiveInt(process.quantity, 1);
  return quantity * time;
};

export const calculateProcessTotal = (processes, key) =>
  normalizeProcesses(processes).reduce((acc, process) => {
    const lineTotal = calculateProcessLineTotal(process, key);
    return lineTotal === null ? acc : acc + lineTotal;
  }, 0);

export const hasAnyProcessTime = (processes, key) =>
  normalizeProcesses(processes).some((process) => hasTime(process?.[key]));

export const parseOptionalSecondsInput = (value) => {
  const parsed = toOptionalNumber(value);
  return parsed === null ? null : Math.round(parsed);
};

export const formatSeconds = (value) => {
  const parsed = toOptionalNumber(value);
  if (parsed === null) return '-';
  return `${formatNumberWithCommas(parsed)}초`;
};
