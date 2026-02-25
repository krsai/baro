import { formatNumberWithCommas } from './numberFormat';

export const DEFAULT_TIME_REF_QUANTITY = 1000;
const AT_RELIABILITY_SETUP_SHARE_THRESHOLD = 0.03;
export const AT_RELIABILITY_STATUS = {
  COLLECTING: 'COLLECTING',
  FALLBACK: 'FALLBACK',
  LOW_SENSITIVITY: 'LOW_SENSITIVITY',
  LEARNING: 'LEARNING',
  STABLE: 'STABLE',
};

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
const roundToScale = (value, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const resolveAtParams = (process) => {
  if (!process || typeof process !== 'object') return null;
  const raw = process.atParams;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const a = toOptionalNumber(raw.a);
  const b = toOptionalNumber(raw.b);
  if (a === null || b === null) return null;
  return { a, b };
};

const resolveAtParamsMeta = (process) => {
  if (!process || typeof process !== 'object') return null;
  const raw = process.atParams;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const params = resolveAtParams(process);
  if (!params) return null;

  const versionRaw = Number(raw.version);
  const version =
    Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1;
  const trainedPeriod =
    typeof raw.trainedPeriod === 'string' && /^\d{4}-\d{2}$/.test(raw.trainedPeriod)
      ? raw.trainedPeriod
      : null;
  return {
    ...params,
    version,
    trainedPeriod,
  };
};

const resolveAtReliabilityPercent = ({
  status,
  setupShare,
  version,
  hasTrainedPeriod,
}) => {
  if (status === AT_RELIABILITY_STATUS.COLLECTING) return 0;
  if (status === AT_RELIABILITY_STATUS.FALLBACK) return 35;

  if (status === AT_RELIABILITY_STATUS.LOW_SENSITIVITY) {
    const setupScore = Number.isFinite(setupShare)
      ? clamp((setupShare / AT_RELIABILITY_SETUP_SHARE_THRESHOLD) * 25, 0, 25)
      : 0;
    return Math.round(clamp(35 + setupScore, 0, 100));
  }

  if (status === AT_RELIABILITY_STATUS.LEARNING) {
    const versionScore = clamp((Number(version) - 1) * 6, 0, 24);
    const trainedScore = hasTrainedPeriod ? 8 : 0;
    return Math.round(clamp(58 + versionScore + trainedScore, 0, 100));
  }

  if (status === AT_RELIABILITY_STATUS.STABLE) {
    const versionScore = clamp((Number(version) - 2) * 2, 0, 8);
    const trainedScore = hasTrainedPeriod ? 2 : 0;
    return Math.round(clamp(90 + versionScore + trainedScore, 0, 100));
  }

  return 0;
};

const toAtReliabilityResult = (status, options = {}) => {
  const setupShare =
    Number.isFinite(options.setupShare) && options.setupShare >= 0
      ? Number(options.setupShare)
      : null;
  const version =
    Number.isFinite(Number(options.version)) && Number(options.version) > 0
      ? Math.trunc(Number(options.version))
      : 0;
  const hasTrainedPeriod = Boolean(options.hasTrainedPeriod);
  return {
    status,
    setupShare,
    version,
    hasTrainedPeriod,
    percent: resolveAtReliabilityPercent({
      status,
      setupShare,
      version,
      hasTrainedPeriod,
    }),
  };
};

export const normalizeProcess = (process = {}, index = 0) => {
  const { st: _legacySt, ...safeProcess } = process || {};
  const normalizedCt = toOptionalNumber(safeProcess.ct);
  const normalizedAt = toOptionalNumber(safeProcess.at);
  const isLikelyAutoCt =
    hasTime(normalizedCt) &&
    hasTime(normalizedAt) &&
    Math.abs(normalizedCt - normalizedAt) < 1e-4;
  const normalizedStManual =
    typeof safeProcess.stManual === 'boolean'
      ? safeProcess.stManual
      : hasTime(normalizedCt) && !isLikelyAutoCt;

  return {
    ...safeProcess,
    instanceId:
      typeof safeProcess.instanceId === 'string' && safeProcess.instanceId.trim()
        ? safeProcess.instanceId
        : `${safeProcess.code || 'PROC'}-${safeProcess.id || index}-${index}`,
    quantity: toPositiveInt(safeProcess.quantity, 1),
    timeRefQuantity: toPositiveInt(
      safeProcess.timeRefQuantity ?? safeProcess.referenceQuantity,
      DEFAULT_TIME_REF_QUANTITY
    ),
    stManual: normalizedStManual,
    pt: toOptionalNumber(safeProcess.pt),
    at: normalizedAt,
    ct: normalizedCt,
  };
};

export const normalizeProcesses = (processes) => {
  if (!Array.isArray(processes)) return [];
  return processes.map((process, index) => normalizeProcess(process, index));
};

// AT is now calculated via work records. If there is an override payload from
// analytics, prefer it; otherwise keep the existing AT value.
export const resolveProcessActualTime = ({ existingAt = null, workStats = null }) => {
  if (workStats && typeof workStats === 'object' && workStats.actualTime != null) {
    return toOptionalNumber(workStats.actualTime);
  }
  return toOptionalNumber(existingAt);
};

export const calculateProcessLineTotal = (process, key) => {
  if (!process || (key !== 'pt' && key !== 'at' && key !== 'ct')) return null;
  const time = toOptionalNumber(process[key]);
  if (time === null) return null;
  const quantity = toPositiveInt(process.quantity, 1);
  return quantity * time;
};

// Calculate total seconds for an order quantity.
// - pt/ct: linear (processTime * process.quantity * orderQuantity)
// - at: if atParams({a,b}) exists, use a*q + b model; otherwise linear AT fallback
export const resolveProcessAtTotalSecondsForOrderQuantity = (process, orderQuantity = 1) => {
  const normalized = normalizeProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const processQuantity = toPositiveInt(normalized?.quantity, 1);

  const atParams = resolveAtParams(normalized);
  if (atParams) {
    return processQuantity * (atParams.a * resolvedOrderQuantity + atParams.b);
  }

  const at = toOptionalNumber(normalized?.at);
  if (at === null) return null;
  return processQuantity * at * resolvedOrderQuantity;
};

export const resolveProcessAtPerPieceSeconds = (process, orderQuantity = 1) => {
  const normalized = normalizeProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const processQuantity = toPositiveInt(normalized?.quantity, 1);
  const totalAt = resolveProcessAtTotalSecondsForOrderQuantity(normalized, resolvedOrderQuantity);
  if (!Number.isFinite(totalAt) || totalAt <= 0) return null;
  return totalAt / (processQuantity * resolvedOrderQuantity);
};

export const resolveProcessAtReliability = (process, orderQuantity = 1) => {
  const normalized = normalizeProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const atPerPieceSeconds = resolveProcessAtPerPieceSeconds(
    normalized,
    resolvedOrderQuantity
  );
  if (atPerPieceSeconds == null) {
    return toAtReliabilityResult(AT_RELIABILITY_STATUS.COLLECTING);
  }

  const atParams = resolveAtParamsMeta(normalized);
  if (!atParams) {
    return toAtReliabilityResult(AT_RELIABILITY_STATUS.FALLBACK);
  }

  const setupShare =
    atPerPieceSeconds > 0
      ? (atParams.b / resolvedOrderQuantity) / atPerPieceSeconds
      : null;
  const hasLowSensitivity =
    atParams.b <= 0 ||
    (Number.isFinite(setupShare) && setupShare < AT_RELIABILITY_SETUP_SHARE_THRESHOLD);
  if (hasLowSensitivity) {
    return toAtReliabilityResult(AT_RELIABILITY_STATUS.LOW_SENSITIVITY, {
      setupShare,
      version: atParams.version,
      hasTrainedPeriod: Boolean(atParams.trainedPeriod),
    });
  }

  if (atParams.version >= 2 && atParams.trainedPeriod) {
    return toAtReliabilityResult(AT_RELIABILITY_STATUS.STABLE, {
      setupShare,
      version: atParams.version,
      hasTrainedPeriod: true,
    });
  }

  return toAtReliabilityResult(AT_RELIABILITY_STATUS.LEARNING, {
    setupShare,
    version: atParams.version,
    hasTrainedPeriod: Boolean(atParams.trainedPeriod),
  });
};

export const resolveProcessStPerPieceSeconds = (process, orderQuantity = 1) => {
  const normalized = normalizeProcess(process);
  const ct = toOptionalNumber(normalized?.ct);
  if (normalized?.stManual === true && ct !== null) {
    return ct;
  }

  const atPerPiece = resolveProcessAtPerPieceSeconds(normalized, orderQuantity);
  if (atPerPiece !== null) return atPerPiece;

  if (ct !== null) return ct;

  const pt = toOptionalNumber(normalized?.pt);
  if (pt !== null) return pt;
  return null;
};

export const resolveProcessStTotalSecondsForOrderQuantity = (
  process,
  orderQuantity = 1
) => {
  const normalized = normalizeProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const processQuantity = toPositiveInt(normalized?.quantity, 1);
  const stPerPiece = resolveProcessStPerPieceSeconds(normalized, resolvedOrderQuantity);
  if (stPerPiece === null) return null;
  return processQuantity * stPerPiece * resolvedOrderQuantity;
};

export const calculateProcessTotalForOrderQuantity = (processes, key, orderQuantity = 1) => {
  if (key !== 'pt' && key !== 'at' && key !== 'ct') return 0;
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);

  return normalizeProcesses(processes).reduce((acc, process) => {
    const processQuantity = toPositiveInt(process?.quantity, 1);

    if (key === 'at') {
      const atTotal = resolveProcessAtTotalSecondsForOrderQuantity(
        process,
        resolvedOrderQuantity
      );
      return atTotal == null ? acc : acc + atTotal;
    }

    const time = toOptionalNumber(process?.[key]);
    if (time === null) return acc;
    return acc + processQuantity * time * resolvedOrderQuantity;
  }, 0);
};

// Official CT baseline priority: ct -> at -> pt.
export const resolveProcessCtBaseSeconds = (process, orderQuantity = 1) => {
  if (!process) return null;
  return resolveProcessStPerPieceSeconds(process, orderQuantity);
};

export const calculateProcessTotal = (processes, key) =>
  normalizeProcesses(processes).reduce((acc, process) => {
    const lineTotal = calculateProcessLineTotal(process, key);
    return lineTotal === null ? acc : acc + lineTotal;
  }, 0);

export const hasAnyProcessTime = (processes, key) =>
  normalizeProcesses(processes).some((process) => hasTime(process?.[key]));

export const hasAnyCt = (processes) =>
  normalizeProcesses(processes).some((process) => hasTime(process?.ct));

export const parseOptionalSecondsInput = (value) => {
  const parsed = toOptionalNumber(value);
  return parsed === null ? null : roundToScale(parsed, 4);
};

export const formatSeconds = (value) => {
  const parsed = toOptionalNumber(value);
  if (parsed === null) return '-';
  return `${formatNumberWithCommas(parsed)}\uCD08`;
};
