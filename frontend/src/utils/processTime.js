import { formatNumberWithCommas } from './numberFormat';

export const DEFAULT_TIME_REF_QUANTITY = 1000;
const AT_RELIABILITY_SETUP_SHARE_THRESHOLD = 0.03;
const AT_RELIABILITY_ATTENDANCE_FALLBACK_PENALTY_MAX = 18;
const AT_RELIABILITY_SAMPLE_REFERENCE_COUNT = 24;
const AT_RELIABILITY_SAMPLE_SCORE_BASE = 18;
const AT_RELIABILITY_SAMPLE_SCORE_MAX = 72;
const AT_RELIABILITY_TRAINED_PERIOD_BONUS = 6;
const AT_RELIABILITY_VERSION_BONUS_MAX = 8;
const AT_RELIABILITY_LOW_SENSITIVITY_PENALTY_MAX = 6;
const AT_RELIABILITY_RAW_SCORE_MAX =
  AT_RELIABILITY_SAMPLE_SCORE_MAX +
  AT_RELIABILITY_TRAINED_PERIOD_BONUS +
  AT_RELIABILITY_VERSION_BONUS_MAX;
const AT_RELIABILITY_MEANINGFUL_PERCENT_THRESHOLD = 65;
const AT_RELIABILITY_USABLE_PERCENT_THRESHOLD = 75;
const AT_RELIABILITY_TRUSTED_PERCENT_THRESHOLD = 85;
const AT_RELIABILITY_VERIFIED_PERCENT_THRESHOLD = 95;
const AT_RELIABILITY_MIN_OBSERVATION_COUNT_MEANINGFUL = 4;
const AT_RELIABILITY_MIN_OBSERVATION_COUNT_USABLE = 8;
const AT_RELIABILITY_MIN_OBSERVATION_COUNT_TRUSTED = 16;
const AT_RELIABILITY_MIN_OBSERVATION_COUNT_VERIFIED = 24;
const AT_RELIABILITY_MAX_FALLBACK_SHARE_MEANINGFUL = 0.5;
const AT_RELIABILITY_MAX_FALLBACK_SHARE_USABLE = 0.35;
const AT_RELIABILITY_MAX_FALLBACK_SHARE_TRUSTED = 0.2;
const AT_RELIABILITY_MAX_FALLBACK_SHARE_VERIFIED = 0.08;
export const AT_RELIABILITY_STATUS = {
  COLLECTING: 'COLLECTING',
  UNRELIABLE: 'UNRELIABLE',
  INSUFFICIENT: 'INSUFFICIENT',
  USABLE: 'USABLE',
  TRUSTED: 'TRUSTED',
  VERIFIED: 'VERIFIED',
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
const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const resolveObservationScore = (observationCount) => {
  const count = toNonNegativeInt(observationCount, 0);
  if (count <= 0) return 0;
  const progress = clamp(
    count / AT_RELIABILITY_SAMPLE_REFERENCE_COUNT,
    0,
    1
  );
  return (
    AT_RELIABILITY_SAMPLE_SCORE_BASE +
    (AT_RELIABILITY_SAMPLE_SCORE_MAX - AT_RELIABILITY_SAMPLE_SCORE_BASE) *
      Math.sqrt(progress)
  );
};

const resolveVersionScore = (version) => {
  const normalized = Number(version);
  if (!Number.isFinite(normalized) || normalized <= 0) return 0;
  return clamp(Math.log2(Math.max(1, normalized)) * 2, 0, AT_RELIABILITY_VERSION_BONUS_MAX);
};

const resolveLowSensitivityPenalty = ({ setupShare, observationCount }) => {
  if (!Number.isFinite(setupShare) || setupShare >= AT_RELIABILITY_SETUP_SHARE_THRESHOLD) {
    return 0;
  }
  const count = toNonNegativeInt(observationCount, 0);
  const sampleMaturity = clamp(count / AT_RELIABILITY_SAMPLE_REFERENCE_COUNT, 0, 1);
  const sensitivityGap = clamp(
    (AT_RELIABILITY_SETUP_SHARE_THRESHOLD - setupShare) /
      AT_RELIABILITY_SETUP_SHARE_THRESHOLD,
    0,
    1
  );
  return (
    sensitivityGap *
    (1 - sampleMaturity) *
    AT_RELIABILITY_LOW_SENSITIVITY_PENALTY_MAX
  );
};

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
  const attendanceCoverageRaw = Number(raw.attendanceCoverage);
  const attendanceCoverage =
    Number.isFinite(attendanceCoverageRaw) && attendanceCoverageRaw >= 0
      ? clamp(attendanceCoverageRaw, 0, 1)
      : null;
  const attendanceFallbackShareRaw = Number(raw.attendanceFallbackShare);
  const attendanceFallbackShare =
    Number.isFinite(attendanceFallbackShareRaw) && attendanceFallbackShareRaw >= 0
      ? clamp(attendanceFallbackShareRaw, 0, 1)
      : attendanceCoverage == null
        ? null
        : clamp(1 - attendanceCoverage, 0, 1);
  const observationCountRaw = Number(raw.observationCount);
  const observationCount =
    Number.isFinite(observationCountRaw) && observationCountRaw >= 0
      ? Math.trunc(observationCountRaw)
      : null;
  return {
    ...params,
    version,
    trainedPeriod,
    attendanceCoverage,
    attendanceFallbackShare,
    observationCount,
  };
};

const resolveAtReliabilityPercent = ({
  setupShare,
  version,
  hasTrainedPeriod,
  attendanceFallbackShare,
  observationCount,
}) => {
  const normalizedObservationCount = toNonNegativeInt(observationCount, 0);
  const normalizedFallbackShare = Number.isFinite(attendanceFallbackShare)
    ? clamp(Number(attendanceFallbackShare), 0, 1)
    : null;
  const fallbackPenalty = Number.isFinite(attendanceFallbackShare)
    ? clamp(
      Number(attendanceFallbackShare) * AT_RELIABILITY_ATTENDANCE_FALLBACK_PENALTY_MAX,
      0,
      AT_RELIABILITY_ATTENDANCE_FALLBACK_PENALTY_MAX
    )
    : 0;
  const observationScore = resolveObservationScore(observationCount);
  const versionScore = resolveVersionScore(version);
  const trainedScore = hasTrainedPeriod ? AT_RELIABILITY_TRAINED_PERIOD_BONUS : 0;
  const lowSensitivityPenalty = resolveLowSensitivityPenalty({
    setupShare,
    observationCount,
  });
  const rawScore = clamp(
    observationScore + versionScore + trainedScore - fallbackPenalty - lowSensitivityPenalty,
    0,
    AT_RELIABILITY_RAW_SCORE_MAX
  );
  let percent = Math.round(clamp((rawScore / AT_RELIABILITY_RAW_SCORE_MAX) * 100, 0, 100));

  if (
    !hasTrainedPeriod ||
    normalizedObservationCount < AT_RELIABILITY_MIN_OBSERVATION_COUNT_MEANINGFUL ||
    normalizedFallbackShare === null ||
    normalizedFallbackShare > AT_RELIABILITY_MAX_FALLBACK_SHARE_MEANINGFUL
  ) {
    return Math.min(percent, AT_RELIABILITY_MEANINGFUL_PERCENT_THRESHOLD - 1);
  }

  if (
    normalizedObservationCount < AT_RELIABILITY_MIN_OBSERVATION_COUNT_USABLE ||
    normalizedFallbackShare > AT_RELIABILITY_MAX_FALLBACK_SHARE_USABLE
  ) {
    return Math.min(percent, AT_RELIABILITY_USABLE_PERCENT_THRESHOLD - 1);
  }

  if (
    normalizedObservationCount < AT_RELIABILITY_MIN_OBSERVATION_COUNT_TRUSTED ||
    normalizedFallbackShare > AT_RELIABILITY_MAX_FALLBACK_SHARE_TRUSTED
  ) {
    return Math.min(percent, AT_RELIABILITY_TRUSTED_PERCENT_THRESHOLD - 1);
  }

  if (
    normalizedObservationCount < AT_RELIABILITY_MIN_OBSERVATION_COUNT_VERIFIED ||
    normalizedFallbackShare > AT_RELIABILITY_MAX_FALLBACK_SHARE_VERIFIED ||
    resolveVersionScore(version) <= 0
  ) {
    return Math.min(percent, AT_RELIABILITY_VERIFIED_PERCENT_THRESHOLD - 1);
  }

  return percent;
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
  const attendanceCoverage =
    Number.isFinite(options.attendanceCoverage) && options.attendanceCoverage >= 0
      ? clamp(Number(options.attendanceCoverage), 0, 1)
      : null;
  const attendanceFallbackShare =
    Number.isFinite(options.attendanceFallbackShare) && options.attendanceFallbackShare >= 0
      ? clamp(Number(options.attendanceFallbackShare), 0, 1)
      : null;
  const observationCount =
    Number.isFinite(Number(options.observationCount)) && Number(options.observationCount) >= 0
      ? Math.trunc(Number(options.observationCount))
      : null;
  const overridePercent = Number(options.percent);
  const percent = Number.isFinite(overridePercent)
    ? Math.round(clamp(overridePercent, 0, 100))
    : resolveAtReliabilityPercent({
      setupShare,
      version,
      hasTrainedPeriod,
      attendanceFallbackShare,
      observationCount,
    });
  return {
    status,
    setupShare,
    version,
    hasTrainedPeriod,
    attendanceCoverage,
    attendanceFallbackShare,
    observationCount,
    percent,
  };
};

export const resolveAtReliabilityStatusFromPercent = (percentValue) => {
  const percent = Number(percentValue);
  if (!Number.isFinite(percent) || percent <= 0) {
    return AT_RELIABILITY_STATUS.COLLECTING;
  }
  if (percent < AT_RELIABILITY_MEANINGFUL_PERCENT_THRESHOLD) {
    return AT_RELIABILITY_STATUS.UNRELIABLE;
  }
  if (percent < AT_RELIABILITY_USABLE_PERCENT_THRESHOLD) {
    return AT_RELIABILITY_STATUS.INSUFFICIENT;
  }
  if (percent < AT_RELIABILITY_TRUSTED_PERCENT_THRESHOLD) {
    return AT_RELIABILITY_STATUS.USABLE;
  }
  if (percent < AT_RELIABILITY_VERIFIED_PERCENT_THRESHOLD) {
    return AT_RELIABILITY_STATUS.TRUSTED;
  }
  return AT_RELIABILITY_STATUS.VERIFIED;
};

export const aggregateAtReliability = (entries = []) => {
  const candidates = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const reliability = entry?.reliability ?? entry;
      const percent = Number(reliability?.percent);
      if (!Number.isFinite(percent)) return null;
      const weightRaw = Number(entry?.weight);
      const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 1;
      return { percent: clamp(percent, 0, 100), weight };
    })
    .filter(Boolean);
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const weightedPercentRaw =
    totalWeight > 0
      ? candidates.reduce(
        (sum, candidate) => sum + candidate.percent * candidate.weight,
        0
      ) / totalWeight
      : candidates.reduce((sum, candidate) => sum + candidate.percent, 0) /
      candidates.length;
  const percent = Math.round(clamp(weightedPercentRaw, 0, 100));
  return {
    status: resolveAtReliabilityStatusFromPercent(percent),
    setupShare: null,
    version: 0,
    hasTrainedPeriod: false,
    attendanceCoverage: null,
    attendanceFallbackShare: null,
    observationCount: null,
    percent,
  };
};

export const resolveStyleAtReliability = (processes = []) => {
  const normalized = normalizeProcesses(processes);
  if (normalized.length === 0) return null;

  const entries = normalized.map((process) => {
    const referenceQuantity = toPositiveInt(
      process?.timeRefQuantity,
      DEFAULT_TIME_REF_QUANTITY
    );
    const atPerPieceSeconds = resolveProcessAtPerPieceSeconds(process, referenceQuantity);
    const processQuantity = toPositiveInt(process?.quantity, 1);
    const weight =
      Number.isFinite(atPerPieceSeconds) && atPerPieceSeconds > 0
        ? atPerPieceSeconds * processQuantity
        : processQuantity;
    return {
      reliability: resolveProcessAtReliability(process, referenceQuantity),
      weight,
    };
  });

  return aggregateAtReliability(entries);
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
  const reliabilityReferenceQuantity = toPositiveInt(
    normalized?.timeRefQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const atPerPieceSeconds = resolveProcessAtPerPieceSeconds(
    normalized,
    reliabilityReferenceQuantity
  );
  if (atPerPieceSeconds == null) {
    return toAtReliabilityResult(AT_RELIABILITY_STATUS.COLLECTING, {
      percent: 0,
    });
  }

  const atParams = resolveAtParamsMeta(normalized);
  if (!atParams) {
    const percent = 18;
    return toAtReliabilityResult(resolveAtReliabilityStatusFromPercent(percent), {
      percent,
    });
  }

  const setupShare =
    atPerPieceSeconds > 0
      ? (atParams.b / reliabilityReferenceQuantity) / atPerPieceSeconds
      : null;
  const fallbackShare = atParams.attendanceFallbackShare;
  const percent = resolveAtReliabilityPercent({
    setupShare,
    version: atParams.version,
    hasTrainedPeriod: Boolean(atParams.trainedPeriod),
    attendanceFallbackShare: fallbackShare,
    observationCount: atParams.observationCount,
  });
  const status = resolveAtReliabilityStatusFromPercent(percent);

  return toAtReliabilityResult(status, {
    setupShare,
    version: atParams.version,
    hasTrainedPeriod: Boolean(atParams.trainedPeriod),
    attendanceCoverage: atParams.attendanceCoverage,
    attendanceFallbackShare: fallbackShare,
    observationCount: atParams.observationCount,
    percent,
  });
};

export const resolveProcessStPerPieceSeconds = (process, orderQuantity = 1) => {
  const normalized = normalizeProcess(process);
  const ct = toOptionalNumber(normalized?.ct);
  if (normalized?.stManual === true && ct !== null) {
    return ct;
  }

  const pt = toOptionalNumber(normalized?.pt);
  if (pt !== null) return pt;

  // Legacy fallback: keep existing ct when pt is empty.
  if (ct !== null) return ct;
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

// Official ST baseline priority: manual ct -> pt -> legacy ct.
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
  return `${formatNumberWithCommas(Math.round(parsed))}\uCD08`;
};
