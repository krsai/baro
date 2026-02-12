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

export const normalizeProcess = (process = {}, index = 0) => ({
  ...process,
  instanceId:
    typeof process.instanceId === 'string' && process.instanceId.trim()
      ? process.instanceId
      : `${process.code || 'PROC'}-${process.id || index}-${index}`,
  quantity: toPositiveInt(process.quantity, 1),
  pt: toOptionalNumber(process.pt),
  st: toOptionalNumber(process.st),
});

export const normalizeProcesses = (processes) => {
  if (!Array.isArray(processes)) return [];
  return processes.map((process, index) => normalizeProcess(process, index));
};

export const calculateStandardTime = ({
  actualTime = null,
  qualityFactor = null,
  fallbackSt = null,
}) => {
  const at = toOptionalNumber(actualTime);
  const qf = toOptionalNumber(qualityFactor);
  if (at === null || qf === null) {
    return toOptionalNumber(fallbackSt);
  }
  return Math.round(at * qf);
};

// Foundation hook: connect work log AT/QF aggregation here once Work domain is integrated.
export const resolveProcessStandardTime = ({ existingSt = null, workStats = null }) => {
  if (workStats && typeof workStats === 'object') {
    return calculateStandardTime({
      actualTime: workStats.actualTime,
      qualityFactor: workStats.qualityFactor,
      fallbackSt: existingSt,
    });
  }
  return toOptionalNumber(existingSt);
};

export const calculateProcessLineTotal = (process, key) => {
  if (!process || (key !== 'pt' && key !== 'st')) return null;
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
  return `${parsed}초`;
};
