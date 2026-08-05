import { formatNumberWithCommas } from './numberFormat';

export const DEFAULT_TIME_REF_QUANTITY = 1000;
export const ST_STANDARD_BUCKETS = Object.freeze([
  1,
  3,
  5,
  10,
  30,
  50,
  100,
  300,
  500,
  1000,
  3000,
  5000,
  10000,
]);
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
const toBucketQuantity = (value, fallback = ST_STANDARD_BUCKETS[0]) => {
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
const toNonNegativeIntOrNull = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};
const toPositiveNumberSamples = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => toOptionalNumber(item))
    .filter((item) => item !== null && item > 0)
    .map((item) => roundToScale(item, 4))
    .slice(0, 10);
const clampProcessSeconds = (value) => {
  const parsed = toOptionalNumber(value);
  if (parsed === null) return null;
  if (parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed));
};

export const resolveStBucketQuantity = (
  orderQuantity = 1,
  bucketQuantities
) => {
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const quantities = [...new Set((Array.isArray(bucketQuantities) ? bucketQuantities : [])
    .map((bucket) => toBucketQuantity(bucket, 0))
    .filter((bucket) => bucket > 0))]
    .sort((left, right) => left - right);
  if (quantities.length === 0) return null;
  let resolvedBucket = quantities[0];
  quantities.forEach((bucket) => {
    if (resolvedOrderQuantity >= bucket) {
      resolvedBucket = bucket;
    }
  });
  return resolvedBucket;
};

export const formatStBucketQuantityLabel = (bucketQuantity, locale = 'ko-KR') => {
  const resolvedBucket = toBucketQuantity(bucketQuantity, ST_STANDARD_BUCKETS[0]);
  const displayQuantity = resolvedBucket <= 1 ? 0 : resolvedBucket;
  return displayQuantity.toLocaleString(locale);
};

const normalizeProcessStBucket = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const bucketQuantity = toBucketQuantity(value.bucketQuantity ?? value.quantity, 0);
  const bucketStSeconds = clampProcessSeconds(value.bucketStSeconds ?? value.seconds);
  if (bucketQuantity <= 0 || bucketStSeconds === null) return null;
  return {
    bucketQuantity,
    bucketStSeconds,
    setBy: typeof value.setBy === 'string' && value.setBy.trim() ? value.setBy.trim() : null,
    setAt: typeof value.setAt === 'string' && value.setAt.trim() ? value.setAt.trim() : null,
    updatedAt:
      typeof value.updatedAt === 'string' && value.updatedAt.trim()
        ? value.updatedAt.trim()
        : null,
  };
};

const normalizeProcessStBuckets = (values) => {
  const byQuantity = new Map();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = normalizeProcessStBucket(value);
    if (!normalized) return;
    byQuantity.set(normalized.bucketQuantity, normalized);
  });

  return Array.from(byQuantity.values()).sort(
    (left, right) => left.bucketQuantity - right.bucketQuantity
  );
};

const hasStructuredProcessComposition = (process) => {
  const composition = process?.processComposition;
  if (!composition || typeof composition !== 'object' || Array.isArray(composition)) {
    return false;
  }
  const locations = Array.isArray(composition.locations)
    ? composition.locations.filter(Boolean)
    : Array.isArray(composition.parts)
      ? composition.parts.filter(Boolean)
      : [];
  const targetPairs = Array.isArray(composition.targetPairs)
    ? composition.targetPairs.filter((pair) => pair?.target)
    : [];
  const actionPairs = Array.isArray(composition.actionPairs)
    ? composition.actionPairs.filter((pair) => pair?.action)
    : [];
  return locations.length > 0 || targetPairs.length > 0 || actionPairs.length > 0;
};

const findExactProcessStBucket = (
  stBuckets = [],
  orderQuantity = 1,
  bucketQuantities = ST_STANDARD_BUCKETS
) => {
  const resolvedOrderQuantity = resolveStBucketQuantity(
    orderQuantity,
    bucketQuantities
  );
  return (Array.isArray(stBuckets) ? stBuckets : []).find(
    (value) => toBucketQuantity(value?.bucketQuantity ?? value?.quantity, 0) === resolvedOrderQuantity
  ) || null;
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
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const a = toOptionalNumber(raw.a);
    const b = toOptionalNumber(raw.b);
    if (a !== null && b !== null) {
      return { a, b };
    }
  }
  return null;
};

const resolveAtParamsMeta = (process) => {
  if (!process || typeof process !== 'object') return null;
  const raw = process.atParams;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const legacyParams = resolveAtParams(process);
    if (!legacyParams) return null;
    return {
      ...legacyParams,
      version: 1,
      trainedPeriod: null,
      attendanceCoverage: null,
      attendanceFallbackShare: null,
      observationCount: null,
      fitStatus: null,
      isProvisional: false,
      fallbackReason: null,
      weightedPointCount: null,
      distinctQuantityCount: null,
      distinctEventCount: null,
      distinctSourceGroupCount: null,
      minQuantity: null,
      maxQuantity: null,
      minEventCount: null,
      maxEventCount: null,
      quantitySamples: [],
      eventCountSamples: [],
    };
  }
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
  const fitStatus = typeof raw.fitStatus === 'string' && raw.fitStatus.trim()
    ? raw.fitStatus.trim()
    : null;
  const fallbackReason = typeof raw.fallbackReason === 'string' && raw.fallbackReason.trim()
    ? raw.fallbackReason.trim()
    : null;
  const minQuantity = toOptionalNumber(raw.minQuantity);
  const maxQuantity = toOptionalNumber(raw.maxQuantity);
  const minEventCount = toOptionalNumber(raw.minEventCount);
  const maxEventCount = toOptionalNumber(raw.maxEventCount);
  return {
    ...params,
    version,
    trainedPeriod,
    attendanceCoverage,
    attendanceFallbackShare,
    observationCount,
    fitStatus,
    isProvisional: raw.isProvisional === true || fitStatus === 'USED_PROVISIONAL',
    fallbackReason,
    weightedPointCount: toNonNegativeIntOrNull(raw.weightedPointCount),
    distinctQuantityCount: toNonNegativeIntOrNull(raw.distinctQuantityCount),
    distinctEventCount: toNonNegativeIntOrNull(raw.distinctEventCount),
    distinctSourceGroupCount: toNonNegativeIntOrNull(raw.distinctSourceGroupCount),
    minQuantity: minQuantity === null ? null : roundToScale(minQuantity, 4),
    maxQuantity: maxQuantity === null ? null : roundToScale(maxQuantity, 4),
    minEventCount: minEventCount === null ? null : roundToScale(minEventCount, 4),
    maxEventCount: maxEventCount === null ? null : roundToScale(maxEventCount, 4),
    quantitySamples: toPositiveNumberSamples(raw.quantitySamples),
    eventCountSamples: toPositiveNumberSamples(raw.eventCountSamples),
  };
};

const resolveAtObservedBucketRange = (atParams, bucketQuantities) => {
  if (!atParams || typeof atParams !== 'object') return null;
  const minQuantity = toOptionalNumber(atParams.minQuantity);
  const maxQuantity = toOptionalNumber(atParams.maxQuantity);
  if (minQuantity === null || maxQuantity === null) return null;
  const lowerQuantity = Math.min(minQuantity, maxQuantity);
  const upperQuantity = Math.max(minQuantity, maxQuantity);
  const minBucket = resolveStBucketQuantity(lowerQuantity, bucketQuantities);
  const maxBucket = resolveStBucketQuantity(upperQuantity, bucketQuantities);
  if (minBucket === null || maxBucket === null) return null;
  return {
    minQuantity: lowerQuantity,
    maxQuantity: upperQuantity,
    minBucket,
    maxBucket,
  };
};

const AT_V2_MIN_EXTRAPOLATION_FACTOR = 2;
const AT_V2_MAX_EXTRAPOLATION_FACTOR = 4;
const AT_V2_MIN_ST_RATIO = 0.2;

const median = (values) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const fitConstrainedAtCurve = (observations) => {
  if (!Array.isArray(observations) || observations.length < 2) return null;
  const medianQuantity = median(observations.map((row) => row.quantity));
  if (!Number.isFinite(medianQuantity) || medianQuantity <= 0) return null;
  const samples = observations.map((row) => {
    const hasAttendanceCoverage = row.attendanceCoverage != null;
    const attendanceCoverage = Number(row.attendanceCoverage);
    const attendanceWeight = hasAttendanceCoverage && Number.isFinite(attendanceCoverage)
      ? 0.4 + 0.6 * clamp(attendanceCoverage, 0, 1)
      : 1;
    const hasSingleProcessLaborShare = row.singleProcessLaborShare != null;
    const singleProcessLaborShare = Number(row.singleProcessLaborShare);
    const allocationWeight = hasSingleProcessLaborShare && Number.isFinite(singleProcessLaborShare)
      ? 1 - 0.5 * clamp(singleProcessLaborShare, 0, 1)
      : 1;
    const quantityWeight = Math.min(
      2,
      Math.sqrt(row.quantity / medianQuantity)
    );
    return {
      x: 1 / row.quantity,
      y: row.perPieceSeconds,
      baseWeight: clamp(
        quantityWeight * attendanceWeight * allocationWeight,
        0.25,
        2
      ),
    };
  });

  const solve = (robustWeights = samples.map(() => 1)) => {
    const weightedSamples = samples.map((sample, index) => ({
      ...sample,
      weight: sample.baseWeight * robustWeights[index],
    }));
  const sumWeight = weightedSamples.reduce((sum, sample) => sum + sample.weight, 0);
  const sumWeightX = weightedSamples.reduce(
    (sum, sample) => sum + sample.weight * sample.x,
    0
  );
  const sumWeightY = weightedSamples.reduce(
    (sum, sample) => sum + sample.weight * sample.y,
    0
  );
  const sumWeightXX = weightedSamples.reduce(
    (sum, sample) => sum + sample.weight * sample.x * sample.x,
    0
  );
  const sumWeightXY = weightedSamples.reduce(
    (sum, sample) => sum + sample.weight * sample.x * sample.y,
    0
  );
  if (!Number.isFinite(sumWeight) || sumWeight <= 0) return null;

  const candidates = [];
  const denominator = sumWeight * sumWeightXX - sumWeightX ** 2;
  if (Number.isFinite(denominator) && denominator > Number.EPSILON) {
    const b =
      (sumWeight * sumWeightXY - sumWeightX * sumWeightY) / denominator;
    const a = (sumWeightY - b * sumWeightX) / sumWeight;
    if (Number.isFinite(a) && a > 0 && Number.isFinite(b) && b >= 0) {
      candidates.push({ a, b });
    }
  }
  candidates.push({ a: sumWeightY / sumWeight, b: 0 });

  const minimumA = Number.EPSILON;
  if (sumWeightXX > 0) {
    candidates.push({
      a: minimumA,
      b: Math.max(0, (sumWeightXY - minimumA * sumWeightX) / sumWeightXX),
    });
  }
  return candidates
    .filter(({ a, b }) => Number.isFinite(a) && a > 0 && Number.isFinite(b) && b >= 0)
    .map((candidate) => ({
      ...candidate,
      error: weightedSamples.reduce(
        (sum, sample) =>
          sum +
          sample.weight *
            (sample.y - candidate.a - candidate.b * sample.x) ** 2,
        0
      ),
    }))
    .sort((left, right) => left.error - right.error)[0] || null;
  };

  let fitted = solve();
  for (let iteration = 0; fitted && iteration < 8; iteration += 1) {
    const residuals = samples.map(
      (sample) => sample.y - fitted.a - fitted.b * sample.x
    );
    const center = median(residuals) ?? 0;
    const scale = (median(residuals.map((value) => Math.abs(value - center))) ?? 0) * 1.4826;
    if (!Number.isFinite(scale) || scale <= 1e-6) break;
    const threshold = 1.345 * scale;
    const next = solve(
      residuals.map((residual) =>
        Math.abs(residual) <= threshold ? 1 : threshold / Math.abs(residual)
      )
    );
    if (!next) break;
    const converged =
      Math.abs(next.a - fitted.a) <= 1e-6 &&
      Math.abs(next.b - fitted.b) <= 1e-6;
    fitted = next;
    if (converged) break;
  }
  return fitted;
};

const resolveAtV2Points = (process) => {
  const observations = [];
  const grouped = new Map();
  (Array.isArray(process?.atV2Observations) ? process.atV2Observations : [])
    .forEach((observation) => {
      const quantity = toOptionalNumber(observation?.quantity);
      const laborInputSeconds = toOptionalNumber(
        observation?.allocatedLaborInputSeconds
      );
      if (
        quantity === null ||
        quantity <= 0 ||
        laborInputSeconds === null ||
        laborInputSeconds <= 0
      ) {
        return;
      }
      observations.push({
        quantity,
        perPieceSeconds: laborInputSeconds / quantity,
        attendanceCoverage: observation?.attendanceCoverage,
        singleProcessLaborShare: observation?.singleProcessLaborShare,
      });
      const current = grouped.get(quantity) || {
        quantity,
        producedQuantity: 0,
        laborInputSeconds: 0,
        sourceCount: 0,
      };
      current.producedQuantity += quantity;
      current.laborInputSeconds += laborInputSeconds;
      current.sourceCount += 1;
      grouped.set(quantity, current);
    });
  const points = Array.from(grouped.values())
    .map((point) => {
      const perPieceSeconds =
        point.laborInputSeconds / point.producedQuantity;
      return {
        ...point,
        perPieceSeconds,
        representativeTotalSeconds: perPieceSeconds * point.quantity,
      };
    })
    .filter(
      (point) =>
        Number.isFinite(point.perPieceSeconds) && point.perPieceSeconds > 0
    )
    .sort((left, right) => left.quantity - right.quantity);
  const fitted = fitConstrainedAtCurve(observations);
  if (!fitted) return points;
  return points.map((point) => {
    const perPieceSeconds = fitted.a + fitted.b / point.quantity;
    return {
      ...point,
      perPieceSeconds,
      representativeTotalSeconds: perPieceSeconds * point.quantity,
    };
  });
};

const resolveAtV2RepeatVariation = (observations) => {
  const grouped = new Map();
  (Array.isArray(observations) ? observations : []).forEach((observation) => {
    const quantity = toOptionalNumber(observation?.quantity);
    const laborInputSeconds = toOptionalNumber(
      observation?.allocatedLaborInputSeconds
    );
    if (
      quantity === null ||
      quantity <= 0 ||
      laborInputSeconds === null ||
      laborInputSeconds <= 0
    ) {
      return;
    }
    const values = grouped.get(quantity) || [];
    values.push(laborInputSeconds / quantity);
    grouped.set(quantity, values);
  });

  let relativeSquaredDeviationSum = 0;
  let repeatedObservationCount = 0;
  grouped.forEach((values) => {
    if (values.length < 2) return;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (!Number.isFinite(mean) || mean <= 0) return;
    values.forEach((value) => {
      relativeSquaredDeviationSum += ((value - mean) / mean) ** 2;
      repeatedObservationCount += 1;
    });
  });
  if (repeatedObservationCount === 0) {
    return { coefficient: null, penalty: 0 };
  }
  const coefficient = Math.sqrt(
    relativeSquaredDeviationSum / repeatedObservationCount
  );
  return {
    coefficient,
    penalty: Math.min(20, Math.round(coefficient * 40)),
  };
};

const resolveAtV2ModelStatus = (process, points) => {
  const observations = (Array.isArray(process?.atV2Observations)
    ? process.atV2Observations
    : []
  ).filter((observation) => {
    const quantity = Number(observation?.quantity);
    const laborInputSeconds = Number(observation?.allocatedLaborInputSeconds);
    return quantity > 0 && laborInputSeconds > 0;
  });
  if (observations.length === 0 || points.length === 0) return 'INSUFFICIENT';
  const quantities = observations.map((row) => Number(row.quantity));
  const distinctQuantityCount = new Set(quantities).size;
  const minQuantity = Math.min(...quantities);
  const maxQuantity = Math.max(...quantities);
  const knownCoverage = observations
    .filter((row) => row.attendanceCoverage != null)
    .map((row) => Number(row.attendanceCoverage))
    .filter(Number.isFinite);
  const averageCoverage = knownCoverage.length > 0
    ? knownCoverage.reduce((sum, value) => sum + value, 0) / knownCoverage.length
    : null;
  const provisional =
    observations.length < 5 ||
    distinctQuantityCount < 3 ||
    maxQuantity / minQuantity < 2 ||
    (averageCoverage !== null && averageCoverage < 0.7);
  const constant =
    points.length > 1 &&
    Math.abs(points[0].perPieceSeconds - points[points.length - 1].perPieceSeconds) <=
      1e-6;
  return `${provisional ? 'PROVISIONAL' : 'SUPPORTED'}_${
    constant ? 'CONSTANT' : 'CURVE'
  }`;
};

const resolveProcessAtV2PerPieceSeconds = (process, quantity) => {
  const points = resolveAtV2Points(process);
  const resolvedQuantity = toPositiveInt(quantity, 1);
  if (points.length === 0) {
    return { value: null, tone: 'empty', observedRange: null };
  }
  const minQuantity = points[0].quantity;
  const maxQuantity = points[points.length - 1].quantity;
  const observedRange = { minQuantity, maxQuantity };
  const modelStatus = resolveAtV2ModelStatus(process, points);
  const isProvisional = modelStatus.startsWith('PROVISIONAL') || modelStatus === 'INSUFFICIENT';
  const exact = points.find((point) => point.quantity === resolvedQuantity);
  if (exact) {
    return {
      value: exact.perPieceSeconds,
      tone: isProvisional ? 'provisional' : 'fitted',
      observedRange,
      modelStatus,
    };
  }
  if (points.length === 1) {
    const bucketQuantities = (Array.isArray(process?.stBuckets)
      ? process.stBuckets
      : []
    )
      .map((bucket) => toOptionalNumber(bucket?.bucketQuantity))
      .filter((bucketQuantity) => bucketQuantity !== null);
    const renderedBucket = resolveStBucketQuantity(
      resolvedQuantity,
      bucketQuantities
    );
    const observedBucket = resolveStBucketQuantity(
      points[0].quantity,
      bucketQuantities
    );
    return {
      value:
        renderedBucket !== null && renderedBucket === observedBucket
          ? points[0].perPieceSeconds
          : null,
      tone: 'provisional',
      observedRange,
      modelStatus,
    };
  }
  const upperIndex = points.findIndex(
    (point) => point.quantity > resolvedQuantity
  );
  if (upperIndex > 0) {
    const lower = points[upperIndex - 1];
    const upper = points[upperIndex];
    const a =
      (upper.representativeTotalSeconds - lower.representativeTotalSeconds) /
      (upper.quantity - lower.quantity);
    if (!Number.isFinite(a) || a <= 0) {
      return { value: null, tone: isProvisional ? 'provisional' : 'fitted', observedRange, modelStatus };
    }
    const b = lower.representativeTotalSeconds - a * lower.quantity;
    const totalSeconds = a * resolvedQuantity + b;
    const value = totalSeconds / resolvedQuantity;
    const stSeconds = resolveProcessStPerPieceSeconds(
      process,
      resolvedQuantity
    );
    const minimumSeconds =
      Number.isFinite(stSeconds) && stSeconds > 0
        ? Math.max(1, stSeconds * AT_V2_MIN_ST_RATIO)
        : 1;
    return {
      value:
        Number.isFinite(value) && value >= minimumSeconds ? value : null,
      tone: isProvisional ? 'provisional' : 'fitted',
      observedRange,
      modelStatus,
    };
  }
  const outsideLimit =
    resolvedQuantity < minQuantity / AT_V2_MIN_EXTRAPOLATION_FACTOR ||
    resolvedQuantity > maxQuantity * AT_V2_MAX_EXTRAPOLATION_FACTOR;
  if (outsideLimit) {
    return { value: null, tone: 'extrapolated', observedRange, modelStatus };
  }
  const nearestPoint =
    resolvedQuantity < minQuantity ? points[0] : points[points.length - 1];
  const value = nearestPoint.perPieceSeconds;
  const stSeconds = resolveProcessStPerPieceSeconds(process, resolvedQuantity);
  const minimumSeconds =
    Number.isFinite(stSeconds) && stSeconds > 0
      ? Math.max(1, stSeconds * AT_V2_MIN_ST_RATIO)
      : 1;
  return {
    value:
      Number.isFinite(value) && value >= minimumSeconds ? value : null,
    tone: isProvisional ? 'provisional-extrapolated' : 'extrapolated',
    observedRange,
    modelStatus,
  };
};

export const resolveProcessAtCellState = (process, quantity = 1, bucketQuantities) => {
  if (Array.isArray(process?.atV2Observations)) {
    const v2 = resolveProcessAtV2PerPieceSeconds(process, quantity);
    return {
      tone: v2.tone,
      isProvisional:
        v2.tone === 'provisional' || v2.tone === 'provisional-extrapolated',
      isOutsideObservedBucketRange:
        v2.tone === 'extrapolated' || v2.tone === 'provisional-extrapolated',
      observedBucketRange: v2.observedRange,
      shouldDisplayValue: v2.value !== null,
      modelStatus: v2.modelStatus ?? null,
    };
  }
  return {
    tone: 'empty',
    isProvisional: false,
    isOutsideObservedBucketRange: false,
    observedBucketRange: null,
    shouldDisplayValue: false,
  };
};

const resolveAtReliabilityPercent = ({
  setupShare,
  version,
  hasTrainedPeriod,
  attendanceFallbackShare,
  observationCount,
  fitStatus,
  isProvisional,
  distinctQuantityCount,
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
    isProvisional ||
    (fitStatus && fitStatus !== 'FITTED') ||
    toNonNegativeInt(distinctQuantityCount, 0) < 2 ||
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

const applyAttendanceFallbackReliability = (percentValue, attendanceFallbackShare) => {
  const percent = Math.round(clamp(Number(percentValue) || 0, 0, 100));
  if (!Number.isFinite(attendanceFallbackShare)) return percent;

  const fallbackShare = clamp(Number(attendanceFallbackShare), 0, 1);
  let adjustedPercent = Math.max(
    0,
    percent - Math.round(fallbackShare * AT_RELIABILITY_ATTENDANCE_FALLBACK_PENALTY_MAX)
  );
  if (fallbackShare > AT_RELIABILITY_MAX_FALLBACK_SHARE_MEANINGFUL) {
    adjustedPercent = Math.min(
      adjustedPercent,
      AT_RELIABILITY_MEANINGFUL_PERCENT_THRESHOLD - 1
    );
  } else if (fallbackShare > AT_RELIABILITY_MAX_FALLBACK_SHARE_USABLE) {
    adjustedPercent = Math.min(
      adjustedPercent,
      AT_RELIABILITY_USABLE_PERCENT_THRESHOLD - 1
    );
  } else if (fallbackShare > AT_RELIABILITY_MAX_FALLBACK_SHARE_TRUSTED) {
    adjustedPercent = Math.min(
      adjustedPercent,
      AT_RELIABILITY_TRUSTED_PERCENT_THRESHOLD - 1
    );
  } else if (fallbackShare > AT_RELIABILITY_MAX_FALLBACK_SHARE_VERIFIED) {
    adjustedPercent = Math.min(
      adjustedPercent,
      AT_RELIABILITY_VERIFIED_PERCENT_THRESHOLD - 1
    );
  }
  return adjustedPercent;
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
  const repeatVariationCoefficient =
    Number.isFinite(options.repeatVariationCoefficient) &&
    options.repeatVariationCoefficient >= 0
      ? Number(options.repeatVariationCoefficient)
      : null;
  const repeatVariationPenalty =
    Number.isFinite(options.repeatVariationPenalty) &&
    options.repeatVariationPenalty >= 0
      ? Math.round(Number(options.repeatVariationPenalty))
      : 0;
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
    repeatVariationCoefficient,
    repeatVariationPenalty,
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
    const weight =
      Number.isFinite(atPerPieceSeconds) && atPerPieceSeconds > 0
        ? atPerPieceSeconds
        : toPositiveInt(process?.timesPerPiece ?? process?.quantity, 1);
    return {
      reliability: resolveProcessAtReliability(process, referenceQuantity),
      weight,
    };
  });

  return aggregateAtReliability(entries);
};

export const normalizeProcess = (process = {}, index = 0) => {
  const {
    st: _legacySt,
    at: _legacyAt,
    atParams: _rawAtParams,
    processQuantity: _legacyProcessQuantity,
    referenceQuantity: _legacyReferenceQuantity,
    quantity: _legacyQuantity,
    timesPerPiece: _rawTimesPerPiece,
    stValues: _legacyStValues,
    stBuckets: _rawStBuckets,
    ...safeProcess
  } = process || {};
  const normalizedStBuckets = normalizeProcessStBuckets(_rawStBuckets ?? _legacyStValues);
  const resolvedTimeRefQuantity = toPositiveInt(
    process?.timeRefQuantity ??
      process?.referenceQuantity ??
      normalizedStBuckets[0]?.bucketQuantity,
    DEFAULT_TIME_REF_QUANTITY
  );
  const exactStValue = findExactProcessStBucket(normalizedStBuckets, resolvedTimeRefQuantity);
  const normalizedCt = exactStValue?.bucketStSeconds ?? clampProcessSeconds(safeProcess.ct);
  const normalizedAtParams = resolveAtParamsMeta(process);
  const normalizedStManual =
    exactStValue != null ||
    (typeof safeProcess.stManual === 'boolean'
      ? safeProcess.stManual && normalizedStBuckets.length > 0
      : false);

  return {
    ...safeProcess,
    instanceId:
      typeof safeProcess.instanceId === 'string' && safeProcess.instanceId.trim()
        ? safeProcess.instanceId
        : `${safeProcess.code || 'PROC'}-${safeProcess.id || index}-${index}`,
    timesPerPiece: hasStructuredProcessComposition(process)
      ? toPositiveInt(_rawTimesPerPiece ?? _legacyQuantity ?? _legacyProcessQuantity, 1)
      : 1,
    timeRefQuantity: resolvedTimeRefQuantity,
    stManual: normalizedStManual,
    pt: clampProcessSeconds(safeProcess.pt),
    ...(normalizedAtParams ? { atParams: normalizedAtParams } : {}),
    ...(normalizedStBuckets.length > 0 ? { stBuckets: normalizedStBuckets } : {}),
    ct: normalizedCt,
  };
};

export const normalizeProcesses = (processes) => {
  if (!Array.isArray(processes)) return [];
  return processes.map((process, index) => normalizeProcess(process, index));
};

export const applyMonotonicStBucketEdit = (
  stBuckets,
  quantity,
  seconds
) => {
  const normalizedBuckets = normalizeProcessStBuckets(stBuckets);
  const bucketQuantity = resolveStBucketQuantity(
    quantity,
    normalizedBuckets.map((bucket) => bucket.bucketQuantity)
  );
  const bucketByQuantity = new Map(
    normalizedBuckets.map((bucket) => [bucket.bucketQuantity, bucket])
  );
  const changedQuantities = new Set([bucketQuantity]);

  if (seconds === null || seconds === undefined || seconds === '') {
    bucketByQuantity.delete(bucketQuantity);
  } else {
    const bucketStSeconds = clampProcessSeconds(seconds);
    if (bucketStSeconds === null) {
      return { stBuckets: normalizedBuckets, changedQuantities: [] };
    }
    const writeBucket = (targetQuantity, targetSeconds) => {
      const current = bucketByQuantity.get(targetQuantity);
      bucketByQuantity.set(targetQuantity, {
        ...(current || {}),
        bucketQuantity: targetQuantity,
        bucketStSeconds: targetSeconds,
        setBy: 'MANUAL',
        setAt: null,
        updatedAt: null,
      });
      changedQuantities.add(targetQuantity);
    };

    writeBucket(bucketQuantity, bucketStSeconds);
    const orderedQuantities = Array.from(bucketByQuantity.keys()).sort((left, right) => left - right);
    const editedIndex = orderedQuantities.indexOf(bucketQuantity);

    let boundarySeconds = bucketStSeconds;
    for (let index = editedIndex - 1; index >= 0; index -= 1) {
      const currentQuantity = orderedQuantities[index];
      const currentSeconds = bucketByQuantity.get(currentQuantity)?.bucketStSeconds;
      if (currentSeconds < boundarySeconds) {
        writeBucket(currentQuantity, boundarySeconds);
      } else {
        boundarySeconds = currentSeconds;
      }
    }

    boundarySeconds = bucketStSeconds;
    for (let index = editedIndex + 1; index < orderedQuantities.length; index += 1) {
      const currentQuantity = orderedQuantities[index];
      const currentSeconds = bucketByQuantity.get(currentQuantity)?.bucketStSeconds;
      if (currentSeconds > boundarySeconds) {
        writeBucket(currentQuantity, boundarySeconds);
      } else {
        boundarySeconds = currentSeconds;
      }
    }
  }

  return {
    stBuckets: Array.from(bucketByQuantity.values()).sort(
      (left, right) => left.bucketQuantity - right.bucketQuantity
    ),
    changedQuantities: Array.from(changedQuantities).sort((left, right) => left - right),
  };
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
  if (key === 'at') {
    const normalized = normalizeProcess(process);
    const referenceQuantity = toPositiveInt(
      normalized?.timeRefQuantity,
      DEFAULT_TIME_REF_QUANTITY
    );
    const atPerPiece = resolveProcessAtPerPieceSeconds(normalized, referenceQuantity);
    if (atPerPiece === null) return null;
    return atPerPiece;
  }
  const time = toOptionalNumber(process[key]);
  if (time === null) return null;
  return time;
};

// Calculate total seconds for an order quantity.
// - pt/ct/st: linear (processRowTime * orderQuantity)
// - at: always use v2 observations; legacy atParams are never an operational fallback
export const resolveProcessAtTotalSecondsForOrderQuantity = (process, orderQuantity = 1) => {
  const normalized = normalizeProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  if (Array.isArray(normalized?.atV2Observations)) {
    const v2 = resolveProcessAtV2PerPieceSeconds(
      normalized,
      resolvedOrderQuantity
    );
    return v2.value === null ? null : v2.value * resolvedOrderQuantity;
  }
  return null;
};

export const resolveProcessAtPerPieceSeconds = (process, orderQuantity = 1) => {
  const normalized = normalizeProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const totalAt = resolveProcessAtTotalSecondsForOrderQuantity(normalized, resolvedOrderQuantity);
  if (!Number.isFinite(totalAt) || totalAt <= 0) return null;
  return totalAt / resolvedOrderQuantity;
};

export const resolveProcessAtDisplayPerPieceSeconds = (
  process,
  orderQuantity = 1,
  bucketQuantities
) => {
  const cellState = resolveProcessAtCellState(process, orderQuantity, bucketQuantities);
  if (cellState.shouldDisplayValue) {
    return resolveProcessAtPerPieceSeconds(process, orderQuantity);
  }
  const hasValidObservation = (
    Array.isArray(process?.atV2Observations) ? process.atV2Observations : []
  ).some(
    (row) => Number(row?.quantity) > 0 && Number(row?.allocatedLaborInputSeconds) > 0
  );
  if (hasValidObservation) return null;
  const stPerPieceSeconds = resolveProcessStPerPieceSeconds(
    process,
    orderQuantity,
    bucketQuantities
  );
  return Number.isFinite(stPerPieceSeconds) && stPerPieceSeconds > 0
    ? stPerPieceSeconds
    : null;
};

export const calculateProcessDisplayAtTotalForOrderQuantity = (
  processes,
  orderQuantity = 1,
  bucketQuantities
) => {
  const normalizedProcesses = normalizeProcesses(processes);
  if (normalizedProcesses.length === 0) return null;
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  let total = 0;
  for (const process of normalizedProcesses) {
    const atPerPiece = resolveProcessAtDisplayPerPieceSeconds(
      process,
      resolvedOrderQuantity,
      bucketQuantities
    );
    if (atPerPiece == null) return null;
    total += atPerPiece * resolvedOrderQuantity;
  }
  return total;
};

export const hasCompleteDisplayableProcessAtTime = (
  processes,
  orderQuantity = 1,
  bucketQuantities
) => {
  const normalizedProcesses = normalizeProcesses(processes);
  return normalizedProcesses.length > 0 && normalizedProcesses.every(
    (process) =>
      resolveProcessAtDisplayPerPieceSeconds(
        process,
        orderQuantity,
        bucketQuantities
      ) != null
  );
};

export const resolveProcessAtReliability = (process, orderQuantity = 1) => {
  const normalized = normalizeProcess(process);
  const observations = Array.isArray(normalized?.atV2Observations)
    ? normalized.atV2Observations
    : [];
  const points = resolveAtV2Points(normalized);
  const reliabilityReferenceQuantity = toPositiveInt(
    points[0]?.quantity ?? orderQuantity,
    1
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

  const observationCount = observations.length;
  const independentAssignmentCount = new Set(
    observations
      .map((observation) => toPositiveInt(observation?.assignmentPlanId, 0))
      .filter((assignmentPlanId) => assignmentPlanId > 0)
  ).size;
  const effectiveObservationCount =
    independentAssignmentCount > 0
      ? independentAssignmentCount
      : observationCount;
  const distinctQuantityCount = points.length;
  const repeatVariation = resolveAtV2RepeatVariation(observations);
  const quantityDiversityScore =
    distinctQuantityCount >= 5
      ? 40
      : Math.max(0, distinctQuantityCount - 1) * 10;
  const observedSpanRatio =
    distinctQuantityCount >= 2 && points[0]?.quantity > 0
      ? points[points.length - 1].quantity / points[0].quantity
      : 1;
  const spanScore =
    observedSpanRatio >= 5
      ? 10
      : observedSpanRatio >= 2
        ? 6
        : observedSpanRatio > 1
          ? 3
          : 0;
  const diversityCap =
    distinctQuantityCount <= 1
      ? 25
      : distinctQuantityCount === 2
        ? 55
        : distinctQuantityCount === 3
          ? 75
          : distinctQuantityCount === 4
            ? 85
            : 95;
  const currentCellState = resolveProcessAtCellState(
    normalized,
    orderQuantity,
    normalized?.stBuckets?.map((bucket) => bucket?.bucketQuantity)
  );
  const rangeCap =
    currentCellState.tone === 'extrapolated' ||
    currentCellState.tone === 'provisional-extrapolated'
      ? 50
      : currentCellState.tone === 'provisional'
        ? 25
        : 95;
  const basePercent = Math.min(
    diversityCap,
    rangeCap,
    10 +
      Math.min(35, effectiveObservationCount * 5) +
      quantityDiversityScore +
      spanScore -
      repeatVariation.penalty
  );
  const attendanceCoverage = normalized?.atParams?.attendanceCoverage ?? null;
  const attendanceFallbackShare =
    normalized?.atParams?.attendanceFallbackShare ??
    (Number.isFinite(attendanceCoverage)
      ? clamp(1 - Number(attendanceCoverage), 0, 1)
      : null);
  const percent = applyAttendanceFallbackReliability(
    basePercent,
    attendanceFallbackShare
  );
  const status = resolveAtReliabilityStatusFromPercent(percent);

  return toAtReliabilityResult(status, {
    setupShare: null,
    version: 2,
    hasTrainedPeriod: observations.some(
      (observation) => Boolean(observation?.trainedPeriod)
    ),
    attendanceCoverage,
    attendanceFallbackShare,
    observationCount: effectiveObservationCount,
    repeatVariationCoefficient: repeatVariation.coefficient,
    repeatVariationPenalty: repeatVariation.penalty,
    percent,
  });
};

export const resolveProcessExactStPerPieceSeconds = (
  process,
  orderQuantity = 1,
  bucketQuantities = ST_STANDARD_BUCKETS
) => {
  const normalized = normalizeProcess(process);
  const exactStValue = findExactProcessStBucket(
    normalized?.stBuckets,
    orderQuantity,
    bucketQuantities
  );
  if (exactStValue) return exactStValue.bucketStSeconds;
  return null;
};

export const resolveProcessStPerPieceSeconds = (
  process,
  orderQuantity = 1,
  bucketQuantities = ST_STANDARD_BUCKETS
) => {
  const normalized = normalizeProcess(process);
  const exactSt = resolveProcessExactStPerPieceSeconds(
    normalized,
    orderQuantity,
    bucketQuantities
  );
  if (exactSt !== null) return exactSt;
  return null;
};

export const resolveProcessStTotalSecondsForOrderQuantity = (
  process,
  orderQuantity = 1
) => {
  const normalized = normalizeProcess(process);
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);
  const stPerPiece = resolveProcessStPerPieceSeconds(normalized, resolvedOrderQuantity);
  if (stPerPiece === null) return null;
  return stPerPiece * resolvedOrderQuantity;
};

export const calculateProcessTotalForOrderQuantity = (processes, key, orderQuantity = 1) => {
  if (key !== 'pt' && key !== 'at' && key !== 'ct') return 0;
  const resolvedOrderQuantity = toPositiveInt(orderQuantity, 1);

  return normalizeProcesses(processes).reduce((acc, process) => {
    if (key === 'at') {
      const atTotal = resolveProcessAtTotalSecondsForOrderQuantity(
        process,
        resolvedOrderQuantity
      );
      return atTotal == null ? acc : acc + atTotal;
    }

    const time = toOptionalNumber(process?.[key]);
    if (time === null) return acc;
    return acc + time * resolvedOrderQuantity;
  }, 0);
};

// Official ST baseline priority: exact ST bucket only.
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
  normalizeProcesses(processes).some((process) => {
    if (key === 'at') return resolveAtV2Points(process).length > 0;
    return hasTime(process?.[key]);
  });

export const hasAnyCt = (processes) =>
  normalizeProcesses(processes).some(
    (process) =>
      (Array.isArray(process?.stBuckets) && process.stBuckets.length > 0) || hasTime(process?.ct)
  );

export const parseOptionalSecondsInput = (value) => {
  const parsed = toOptionalNumber(value);
  if (parsed === null) return null;
  if (parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed));
};

export const formatSeconds = (value) => {
  const parsed = toOptionalNumber(value);
  if (parsed === null) return '-';
  const rounded = Math.round(parsed);
  if (parsed > 0 && rounded === 0) return `<1\uCD08`;
  return `${formatNumberWithCommas(rounded)}\uCD08`;
};
