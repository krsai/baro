export type AtMetricObservation = {
  quantity: number;
  eventCount?: number | null;
  sourceGroupKey?: string | null;
  laborInputSeconds: number;
};

export type AtTrainingDayProcessRow = {
  metricKey: string;
  quantity: number;
  eventCount?: number | null;
  sourceGroupKey?: string | null;
  assignmentPlanId?: number | null;
  attendanceCoverage?: number | null;
};

export type AtTrainingDayBucket = {
  dayKey: string;
  order: number;
  workerId?: number | null;
  laborInputSeconds: number;
  processRows: AtTrainingDayProcessRow[];
};

export type AtMetricFitStatus =
  | "FITTED"
  | "USED_PROVISIONAL"
  | "INSUFFICIENT_POINTS"
  | "INSUFFICIENT_INDEPENDENT_SOURCES"
  | "NO_QUANTITY_VARIATION"
  | "FIRST_REGRESSION_FAILED"
  | "SECOND_REGRESSION_FAILED"
  | "NEGATIVE_OR_INVALID_PARAMS"
  | "NORMALIZED_A_MISSING"
  | "IMPLAUSIBLY_LOW_AT_PARAMS";

export type AtMetricFitDiagnostic = {
  metricKey: string;
  styleProcessId: number | null;
  weightedPointCount: number;
  distinctQuantityCount: number;
  distinctEventCount: number;
  distinctSourceGroupCount: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  minEventCount: number | null;
  maxEventCount: number | null;
  quantitySamples: number[];
  eventCountSamples: number[];
  sourceGroupSamples: string[];
  provisionalAvailable: boolean;
  fallbackReason: AtMetricFitStatus | null;
  status: AtMetricFitStatus;
};

export type AtFittedParams = {
  a: number;
  b: number;
  fitStatus: AtMetricFitStatus;
  isProvisional: boolean;
  fallbackReason: AtMetricFitStatus | null;
  weightedPointCount: number;
  distinctQuantityCount: number;
  distinctEventCount: number;
  distinctSourceGroupCount: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  minEventCount: number | null;
  maxEventCount: number | null;
  quantitySamples: number[];
  eventCountSamples: number[];
};

export type AtFittingDiagnostics = {
  metricCount: number;
  weightedPointMetricCount: number;
  provisionalMetricCount: number;
  fittedMetricCount: number;
  rejectedMetricCount: number;
  resetMetricCount: number;
  statusCounts: Record<string, number>;
  metricSamples: AtMetricFitDiagnostic[];
};

export type AtAllocatedObservation = {
  dayKey: string;
  order: number;
  workerId: number | null;
  metricKey: string;
  assignmentPlanId: number | null;
  quantity: number;
  eventCount: number;
  sourceGroupKey: string | null;
  laborInputSeconds: number;
  attendanceCoverage: number | null;
  singleProcessDay: boolean;
};

type WeightedRegressionPoint = {
  quantity: number;
  eventCount: number;
  sourceGroupKey: string | null;
  y: number;
  weight: number;
};

type AtWeightedFitAttempt = {
  params: { a: number; b: number } | null;
  status: AtMetricFitStatus;
  weightedPointCount: number;
  distinctQuantityCount: number;
  distinctEventCount: number;
  distinctSourceGroupCount: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  minEventCount: number | null;
  maxEventCount: number | null;
  quantitySamples: number[];
  eventCountSamples: number[];
  sourceGroupSamples: string[];
};

const toPositiveInt = (value: unknown, fallback = 1): number => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : fallback;
};

const roundToScale = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const ensureArray = <T>(value: unknown): T[] =>
  (Array.isArray(value) ? value : []) as T[];

const toOptionalSeconds = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed < 0 ? 0 : roundToScale(parsed, 4);
};

const normalizeSourceGroupKey = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, 160);
};

const resolveDistinctSourceGroupKeys = (
  points: WeightedRegressionPoint[]
): string[] =>
  Array.from(
    new Set(
      points.map((point) =>
        normalizeSourceGroupKey(point.sourceGroupKey) ?? "missing-source"
      )
    )
  ).sort();

const AT_WLS_DETERMINANT_EPSILON = 1e-9;
const AT_WLS_RESIDUAL_SCALE = 0.35;
const AT_WLS_MIN_WEIGHT = 1e-4;
const AT_FIT_MIN_PER_PIECE_SECONDS = (() => {
  const parsed = Number(process.env.AT_FIT_MIN_PER_PIECE_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
})();
const AT_FIT_MIN_SEED_RATIO = (() => {
  const parsed = Number(process.env.AT_FIT_MIN_SEED_RATIO);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.2;
  return Math.min(parsed, 1);
})();
const AT_PROPORTIONAL_MAX_ITERATIONS = toPositiveInt(
  process.env.AT_PROPORTIONAL_MAX_ITERATIONS,
  8
);
const AT_PROPORTIONAL_MIN_ITERATIONS = toPositiveInt(
  process.env.AT_PROPORTIONAL_MIN_ITERATIONS,
  2
);
const AT_PROPORTIONAL_CONVERGENCE_EPSILON = (() => {
  const parsed = Number(process.env.AT_PROPORTIONAL_CONVERGENCE_EPSILON);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.01;
  return parsed;
})();
const AT_TREND_BASE_WEIGHT = (() => {
  const parsed = Number(process.env.AT_TREND_BASE_WEIGHT);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.25;
  return parsed;
})();
const AT_TREND_STREAK_STEP_WEIGHT = (() => {
  const parsed = Number(process.env.AT_TREND_STREAK_STEP_WEIGHT);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.12;
  return parsed;
})();
const AT_TREND_MAX_WEIGHT = (() => {
  const parsed = Number(process.env.AT_TREND_MAX_WEIGHT);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
})();
export const AT_MONTHLY_A_CLAMP_RATIO = (() => {
  const parsed = Number(process.env.AT_MONTHLY_A_CLAMP_RATIO);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.15;
  return Math.min(parsed, 1);
})();

const toAtRegressionPoints = (
  observations: AtMetricObservation[]
): WeightedRegressionPoint[] =>
  observations
    .map((observation) => {
      const quantity = Number(observation?.quantity);
      const eventCount = Number(observation?.eventCount ?? 1);
      const laborInputSeconds = Number(observation?.laborInputSeconds);
      if (
        !Number.isFinite(quantity) ||
        !Number.isFinite(eventCount) ||
        !Number.isFinite(laborInputSeconds) ||
        quantity <= 0 ||
        eventCount <= 0 ||
        laborInputSeconds <= 0
      ) {
        return null;
      }
      return {
        quantity,
        eventCount,
        sourceGroupKey: normalizeSourceGroupKey(observation?.sourceGroupKey),
        y: laborInputSeconds,
        // Large samples are usually less noisy, but use sqrt to avoid domination.
        weight: Math.max(1, Math.sqrt(quantity) * Math.sqrt(eventCount)),
      };
    })
    .filter((point): point is WeightedRegressionPoint => point !== null);

const fitWeightedLinearRegression = (
  points: WeightedRegressionPoint[]
): { a: number; b: number } | null => {
  let sqq = 0;
  let sqe = 0;
  let see = 0;
  let sqy = 0;
  let sey = 0;

  points.forEach((point) => {
    const { quantity, eventCount, y, weight } = point;
    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(eventCount) ||
      !Number.isFinite(y) ||
      !Number.isFinite(weight)
    ) {
      return;
    }
    if (quantity <= 0 || eventCount <= 0 || weight <= 0) return;
    sqq += weight * quantity * quantity;
    sqe += weight * quantity * eventCount;
    see += weight * eventCount * eventCount;
    sqy += weight * quantity * y;
    sey += weight * eventCount * y;
  });

  if (sqq <= 0 || see <= 0) return null;
  const determinant = sqq * see - sqe * sqe;
  if (Math.abs(determinant) <= AT_WLS_DETERMINANT_EPSILON) return null;

  const a = (sqy * see - sey * sqe) / determinant;
  const b = (sqq * sey - sqe * sqy) / determinant;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
};

const resolveMinimumPlausiblePerPieceSeconds = (
  initialPerPieceSeconds?: number | null
): number => {
  const seed = Number(initialPerPieceSeconds);
  const seedFloor =
    Number.isFinite(seed) && seed > 0 ? seed * AT_FIT_MIN_SEED_RATIO : 0;
  return Math.max(AT_FIT_MIN_PER_PIECE_SECONDS, seedFloor);
};

const resolveAtParamsMagnitudeFailure = (
  params: { a: number; b: number } | null,
  points: WeightedRegressionPoint[],
  options: { initialPerPieceSeconds?: number | null } = {}
): AtMetricFitStatus | null => {
  if (
    !params ||
    !Number.isFinite(params.a) ||
    params.a <= 0 ||
    !Number.isFinite(params.b) ||
    params.b < 0
  ) {
    return "NEGATIVE_OR_INVALID_PARAMS";
  }

  if (params.a < AT_FIT_MIN_PER_PIECE_SECONDS) {
    return "IMPLAUSIBLY_LOW_AT_PARAMS";
  }

  const minimumPerPieceSeconds = resolveMinimumPlausiblePerPieceSeconds(
    options.initialPerPieceSeconds
  );
  const observedPredictions = ensureArray<WeightedRegressionPoint>(points)
    .map((point) => {
      const quantity = Number(point?.quantity);
      const eventCount = Number(point?.eventCount);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      if (!Number.isFinite(eventCount) || eventCount <= 0) return null;
      const predictedTotalSeconds =
        params.a * quantity + params.b * eventCount;
      if (!Number.isFinite(predictedTotalSeconds) || predictedTotalSeconds <= 0) {
        return null;
      }
      return predictedTotalSeconds / quantity;
    })
    .filter((value): value is number => value !== null);

  const appliedPredictions = ensureArray<WeightedRegressionPoint>(points)
    .map((point) => {
      const quantity = Number(point?.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      const predictedTotalSeconds = params.a * quantity + params.b;
      if (!Number.isFinite(predictedTotalSeconds) || predictedTotalSeconds <= 0) {
        return null;
      }
      return predictedTotalSeconds / quantity;
    })
    .filter((value): value is number => value !== null);

  if (
    (observedPredictions.length > 0 &&
      Math.min(...observedPredictions) < minimumPerPieceSeconds) ||
    (appliedPredictions.length > 0 &&
      Math.min(...appliedPredictions) < minimumPerPieceSeconds)
  ) {
    return "IMPLAUSIBLY_LOW_AT_PARAMS";
  }

  return null;
};

const applyResidualMagnitudeWeights = (
  points: WeightedRegressionPoint[],
  model: { a: number; b: number }
): WeightedRegressionPoint[] =>
  points.map((point) => {
    const predicted = model.a * point.quantity + model.b * point.eventCount;
    const residualRatio = Math.abs(point.y - predicted) / Math.max(1, point.y);
    const scaled = residualRatio / AT_WLS_RESIDUAL_SCALE;
    const magnitudeWeight = 1 / (1 + scaled * scaled);
    return {
      ...point,
      weight: Math.max(AT_WLS_MIN_WEIGHT, point.weight * magnitudeWeight),
    };
  });

const fitAtParamsFromWeightedPoints = (
  pointsInput: WeightedRegressionPoint[],
  options: { initialPerPieceSeconds?: number | null } = {}
): { a: number; b: number } | null => {
  const points = ensureArray<WeightedRegressionPoint>(pointsInput).filter(
    (point) =>
      Number.isFinite(point.quantity) &&
      Number.isFinite(point.eventCount) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.weight) &&
      point.quantity > 0 &&
      point.eventCount > 0 &&
      point.y > 0 &&
      point.weight > 0
  );

  const distinctQuantities = Array.from(
    new Set(points.map((point) => roundToScale(point.quantity, 4)))
  ).sort((left, right) => left - right);
  const distinctSourceGroupKeys = resolveDistinctSourceGroupKeys(points);
  if (points.length < 2) {
    return null;
  }
  if (distinctSourceGroupKeys.length < 2) {
    return null;
  }

  const firstFit = fitWeightedLinearRegression(points);
  if (!firstFit) return null;
  const secondPoints =
    applyResidualMagnitudeWeights(points, firstFit);
  const secondFit = fitWeightedLinearRegression(secondPoints);
  if (!secondFit) return null;

  const a = secondFit.a;
  const b = secondFit.b;
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(b) || b < 0) return null;

  const normalizedA = toOptionalSeconds(a);
  const normalizedB = toOptionalSeconds(b);
  if (normalizedA == null) return null;
  const params = { a: normalizedA, b: normalizedB ?? 0 };
  if (resolveAtParamsMagnitudeFailure(params, points, options)) return null;
  return params;
};

const inspectAtFitFromWeightedPoints = (
  pointsInput: WeightedRegressionPoint[],
  options: { initialPerPieceSeconds?: number | null } = {}
): AtWeightedFitAttempt => {
  const points = ensureArray<WeightedRegressionPoint>(pointsInput).filter(
    (point) =>
      Number.isFinite(point.quantity) &&
      Number.isFinite(point.eventCount) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.weight) &&
      point.quantity > 0 &&
      point.eventCount > 0 &&
      point.y > 0 &&
      point.weight > 0
  );

  const distinctQuantities = Array.from(
    new Set(points.map((point) => roundToScale(point.quantity, 4)))
  ).sort((left, right) => left - right);
  const distinctEventCounts = Array.from(
    new Set(points.map((point) => roundToScale(point.eventCount, 4)))
  ).sort((left, right) => left - right);
  const distinctSourceGroupKeys = resolveDistinctSourceGroupKeys(points);
  const quantitySamples = distinctQuantities.slice(0, 10);
  const eventCountSamples = distinctEventCounts.slice(0, 10);
  const sourceGroupSamples = distinctSourceGroupKeys.slice(0, 10);
  const minQuantity =
    distinctQuantities.length > 0 ? distinctQuantities[0] ?? null : null;
  const maxQuantity =
    distinctQuantities.length > 0
      ? distinctQuantities[distinctQuantities.length - 1] ?? null
      : null;
  const minEventCount =
    distinctEventCounts.length > 0 ? distinctEventCounts[0] ?? null : null;
  const maxEventCount =
    distinctEventCounts.length > 0
      ? distinctEventCounts[distinctEventCounts.length - 1] ?? null
      : null;
  const baseDiagnostic = {
    weightedPointCount: points.length,
    distinctQuantityCount: distinctQuantities.length,
    distinctEventCount: distinctEventCounts.length,
    distinctSourceGroupCount: distinctSourceGroupKeys.length,
    minQuantity,
    maxQuantity,
    minEventCount,
    maxEventCount,
    quantitySamples,
    eventCountSamples,
    sourceGroupSamples,
  };

  if (points.length < 2) {
    return {
      params: null,
      status: "INSUFFICIENT_POINTS",
      ...baseDiagnostic,
    };
  }

  if (distinctSourceGroupKeys.length < 2) {
    return {
      params: null,
      status: "INSUFFICIENT_INDEPENDENT_SOURCES",
      ...baseDiagnostic,
    };
  }

  if (distinctQuantities.length < 2) {
    return {
      params: null,
      status: "NO_QUANTITY_VARIATION",
      ...baseDiagnostic,
    };
  }

  const firstFit = fitWeightedLinearRegression(points);
  if (!firstFit) {
    return {
      params: null,
      status: "FIRST_REGRESSION_FAILED",
      ...baseDiagnostic,
    };
  }

  const secondPoints = applyResidualMagnitudeWeights(points, firstFit);
  const secondFit = fitWeightedLinearRegression(secondPoints);
  if (!secondFit) {
    return {
      params: null,
      status: "SECOND_REGRESSION_FAILED",
      ...baseDiagnostic,
    };
  }

  const a = secondFit.a;
  const b = secondFit.b;
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(b) || b < 0) {
    return {
      params: null,
      status: "NEGATIVE_OR_INVALID_PARAMS",
      ...baseDiagnostic,
    };
  }

  const normalizedA = toOptionalSeconds(a);
  const normalizedB = toOptionalSeconds(b);
  if (normalizedA == null) {
    return {
      params: null,
      status: "NORMALIZED_A_MISSING",
      ...baseDiagnostic,
    };
  }

  const params = { a: normalizedA, b: normalizedB ?? 0 };
  const magnitudeFailure = resolveAtParamsMagnitudeFailure(
    params,
    points,
    options
  );
  if (magnitudeFailure) {
    return {
      params: null,
      status: magnitudeFailure,
      ...baseDiagnostic,
    };
  }

  return {
    params,
    status: "FITTED",
    ...baseDiagnostic,
  };
};

const inspectAtFitFromObservations = (
  observations: AtMetricObservation[],
  options: { initialPerPieceSeconds?: number | null } = {}
): AtWeightedFitAttempt => {
  const points = toAtRegressionPoints(observations);
  return inspectAtFitFromWeightedPoints(points, options);
};

const allocateDaySecondsAcrossProcesses = (
  day: AtTrainingDayBucket,
  perPieceByMetricKey: Map<string, number>
): AtAllocatedObservation[] => {
  const validRows = ensureArray<AtTrainingDayProcessRow>(day?.processRows)
    .map((row) => {
      const quantity = Number(row?.quantity);
      const eventCount = Number(row?.eventCount ?? 1);
      const sourceGroupKey = normalizeSourceGroupKey(row?.sourceGroupKey);
      const assignmentPlanId = toPositiveInt(row?.assignmentPlanId, 0) || null;
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      if (!Number.isFinite(eventCount) || eventCount <= 0) return null;
      const metricKey = String(row?.metricKey || "").trim();
      if (!metricKey) return null;
      return {
        metricKey,
        quantity,
        eventCount,
        sourceGroupKey,
        assignmentPlanId,
        attendanceCoverage:
          row?.attendanceCoverage != null &&
          Number.isFinite(Number(row.attendanceCoverage))
            ? Math.min(1, Math.max(0, Number(row.attendanceCoverage)))
            : null,
      };
    })
    .filter((row): row is {
      metricKey: string;
      quantity: number;
      eventCount: number;
      sourceGroupKey: string | null;
      assignmentPlanId: number | null;
      attendanceCoverage: number | null;
    } => Boolean(row));

  if (validRows.length === 0) return [];

  if (validRows.length === 1) {
    const row = validRows[0]!;
    return [
      {
        dayKey: day.dayKey,
        order: day.order,
        workerId: toPositiveInt(day.workerId, 0) || null,
        metricKey: row.metricKey,
        assignmentPlanId: row.assignmentPlanId,
        quantity: row.quantity,
        eventCount: row.eventCount,
        sourceGroupKey: row.sourceGroupKey,
        laborInputSeconds: day.laborInputSeconds,
        attendanceCoverage: row.attendanceCoverage,
        singleProcessDay: true,
      },
    ];
  }

  const withWork = validRows.map((row) => {
    const perPiece = toOptionalSeconds(perPieceByMetricKey.get(row.metricKey));
    if (perPiece === null || perPiece <= 0) return null;
    return {
      ...row,
      work: row.quantity * perPiece,
    };
  }).filter((row): row is {
    metricKey: string;
    quantity: number;
    eventCount: number;
    sourceGroupKey: string | null;
    assignmentPlanId: number | null;
    attendanceCoverage: number | null;
    work: number;
  } => Boolean(row));

  if (withWork.length !== validRows.length) return [];

  let totalWork = withWork.reduce((sum, row) => sum + row.work, 0);
  if (!Number.isFinite(totalWork) || totalWork <= 0) {
    return [];
  }

  return withWork.map((row) => ({
    dayKey: day.dayKey,
    order: day.order,
    workerId: toPositiveInt(day.workerId, 0) || null,
    metricKey: row.metricKey,
    assignmentPlanId: row.assignmentPlanId,
    quantity: row.quantity,
    eventCount: row.eventCount,
    sourceGroupKey: row.sourceGroupKey,
    laborInputSeconds: day.laborInputSeconds * (row.work / totalWork),
    attendanceCoverage: row.attendanceCoverage,
    singleProcessDay: false,
  }));
};

const buildAllocatedObservations = (
  days: AtTrainingDayBucket[],
  perPieceByMetricKey: Map<string, number>
): {
  observations: AtAllocatedObservation[];
  observationsByMetric: Map<string, AtMetricObservation[]>;
} => {
  const observationsByMetric = new Map<string, AtMetricObservation[]>();
  const observations: AtAllocatedObservation[] = [];

  ensureArray<AtTrainingDayBucket>(days).forEach((day) => {
    const allocated = allocateDaySecondsAcrossProcesses(day, perPieceByMetricKey);
    allocated.forEach((row) => {
      observations.push(row);
      const current = observationsByMetric.get(row.metricKey) || [];
      current.push({
        quantity: row.quantity,
        eventCount: row.eventCount,
        sourceGroupKey: row.sourceGroupKey,
        laborInputSeconds: row.laborInputSeconds,
      });
      observationsByMetric.set(row.metricKey, current);
    });
  });

  return { observations, observationsByMetric };
};

const buildProvisionalParamsFromWeightedPoints = (
  pointsInput: WeightedRegressionPoint[],
  options: { initialPerPieceSeconds?: number | null } = {}
): { a: number; b: number } | null => {
  const points = ensureArray<WeightedRegressionPoint>(pointsInput).filter(
    (point) =>
      Number.isFinite(point.quantity) &&
      Number.isFinite(point.eventCount) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.weight) &&
      point.quantity > 0 &&
      point.eventCount > 0 &&
      point.y > 0 &&
      point.weight > 0
  );

  if (points.length === 0) return null;

  let totalWeight = 0;
  let weightedPerPieceSum = 0;
  points.forEach((point) => {
    const perPiece = point.y / point.quantity;
    if (!Number.isFinite(perPiece) || perPiece <= 0) return;
    totalWeight += point.weight;
    weightedPerPieceSum += point.weight * perPiece;
  });

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return null;
  const provisionalA = toOptionalSeconds(weightedPerPieceSum / totalWeight);
  if (provisionalA == null || provisionalA <= 0) return null;
  const params = {
    a: provisionalA,
    b: 0,
  };
  if (resolveAtParamsMagnitudeFailure(params, points, options)) return null;
  return params;
};

const buildDayTrendWeights = (
  days: AtTrainingDayBucket[],
  provisionalParamsByMetric: Map<string, { a: number; b: number }>
): Map<string, number> => {
  const sortedDays = ensureArray<AtTrainingDayBucket>(days)
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));

  const dayWeightByKey = new Map<string, number>();
  let previousSign = 0;
  let currentStreak = 0;

  sortedDays.forEach((day) => {
    const laborInputSeconds = Math.max(1, Number(day?.laborInputSeconds) || 0);
    let hasCompletePrediction = true;
    const predictedLaborInputSeconds = ensureArray<AtTrainingDayProcessRow>(day?.processRows).reduce(
      (sum, row) => {
        const quantity = Number(row?.quantity);
        const eventCount = Number(row?.eventCount ?? 1);
        if (!Number.isFinite(quantity) || quantity <= 0) return sum;
        if (!Number.isFinite(eventCount) || eventCount <= 0) return sum;
        const metricKey = String(row?.metricKey || "").trim();
        if (!metricKey) return sum;
        const fitted = provisionalParamsByMetric.get(metricKey);
        if (fitted) {
          return sum + fitted.a * quantity + fitted.b * eventCount;
        }
        hasCompletePrediction = false;
        return sum;
      },
      0
    );

    if (!hasCompletePrediction || predictedLaborInputSeconds <= 0) {
      dayWeightByKey.set(day.dayKey, AT_TREND_BASE_WEIGHT);
      return;
    }

    const residualRatio = (laborInputSeconds - predictedLaborInputSeconds) / laborInputSeconds;
    const magnitudeScaled =
      Math.abs(residualRatio) / Math.max(AT_WLS_RESIDUAL_SCALE, 1e-6);
    const magnitudeWeight = 1 / (1 + magnitudeScaled * magnitudeScaled);
    const sign = residualRatio > 1e-6 ? 1 : residualRatio < -1e-6 ? -1 : 0;

    if (sign === 0) {
      currentStreak = 0;
    } else if (sign === previousSign) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }

    if (sign !== 0) {
      previousSign = sign;
    }

    const trendWeight =
      sign === 0
        ? AT_TREND_BASE_WEIGHT
        : Math.min(
            AT_TREND_MAX_WEIGHT,
            AT_TREND_BASE_WEIGHT +
              Math.max(0, currentStreak - 1) * AT_TREND_STREAK_STEP_WEIGHT
          );

    const dayWeight = Math.max(
      AT_WLS_MIN_WEIGHT,
      Math.max(magnitudeWeight, trendWeight)
    );
    dayWeightByKey.set(day.dayKey, dayWeight);
  });

  return dayWeightByKey;
};

export const fitAtParamsWithProportionalAllocation = (
  days: AtTrainingDayBucket[],
  options: {
    initialPerPieceByMetricKey?: Map<string, number>;
  } = {}
): {
  paramsByMetric: Map<string, AtFittedParams>;
  allocatedObservations: AtAllocatedObservation[];
  iterationCount: number;
  converged: boolean;
  diagnostics: AtFittingDiagnostics;
} => {
  const metricKeySet = new Set<string>();
  ensureArray<AtTrainingDayBucket>(days).forEach((day) => {
    ensureArray<AtTrainingDayProcessRow>(day?.processRows).forEach((row) => {
      const metricKey = String(row?.metricKey || "").trim();
      if (metricKey) metricKeySet.add(metricKey);
    });
  });

  const metricKeys = Array.from(metricKeySet.values());

  const seededPerPieceByMetricKey = options.initialPerPieceByMetricKey instanceof Map
    ? new Map(
        Array.from(options.initialPerPieceByMetricKey.entries()).filter(
          ([metricKey, value]) =>
            Boolean(String(metricKey || "").trim()) &&
            Number.isFinite(Number(value)) &&
            Number(value) > 0
        ).map(([metricKey, value]) => [String(metricKey).trim(), Number(value)])
      )
    : new Map<string, number>();
  let perPieceByMetricKey = seededPerPieceByMetricKey;

  let iterationCount = 0;
  let converged = false;
  let provisionalParamsByMetric = new Map<string, { a: number; b: number }>();
  const rejectedMetricKeys = new Set<string>();
  const resetMetricKeys = new Set<string>();

  const resetMetricPerPieceToSeed = (
    metricKey: string,
    targetMap: Map<string, number>
  ): number | null => {
    const resetPerPiece = toOptionalSeconds(
      seededPerPieceByMetricKey.get(metricKey)
    );
    if (resetPerPiece === null || resetPerPiece <= 0) return null;
    targetMap.set(metricKey, resetPerPiece);
    return resetPerPiece;
  };

  for (
    let iteration = 1;
    iteration <= AT_PROPORTIONAL_MAX_ITERATIONS;
    iteration += 1
  ) {
    const { observationsByMetric } = buildAllocatedObservations(
      days,
      perPieceByMetricKey
    );
    if (observationsByMetric.size === 0) break;

    const nextPerPieceByMetricKey = new Map(perPieceByMetricKey);
    const nextParamsByMetric = new Map<string, { a: number; b: number }>();
    let maxRelativeChange = 0;

    metricKeys.forEach((metricKey) => {
      const observations = observationsByMetric.get(metricKey) || [];
      const initialPerPieceSeconds =
        seededPerPieceByMetricKey.get(metricKey) ?? null;
      const inspected = inspectAtFitFromObservations(observations, {
        initialPerPieceSeconds,
      });
      const fitted = inspected.params;
      if (!fitted) {
        rejectedMetricKeys.add(metricKey);
        const previousPerPiece = toOptionalSeconds(
          perPieceByMetricKey.get(metricKey)
        );
        const resetPerPiece = resetMetricPerPieceToSeed(
          metricKey,
          nextPerPieceByMetricKey
        );
        if (resetPerPiece !== null) {
          if (previousPerPiece === null || previousPerPiece !== resetPerPiece) {
            resetMetricKeys.add(metricKey);
          }
          if (previousPerPiece === null) {
            maxRelativeChange = Number.POSITIVE_INFINITY;
          } else {
            const relativeChange =
              Math.abs(resetPerPiece - previousPerPiece) /
              Math.max(AT_WLS_MIN_WEIGHT, Math.abs(previousPerPiece));
            if (Number.isFinite(relativeChange)) {
              maxRelativeChange = Math.max(maxRelativeChange, relativeChange);
            }
          }
        }
        return;
      }

      nextParamsByMetric.set(metricKey, fitted);
      const previousPerPiece = toOptionalSeconds(perPieceByMetricKey.get(metricKey));
      const nextPerPiece = Math.max(
        resolveMinimumPlausiblePerPieceSeconds(initialPerPieceSeconds),
        fitted.a
      );
      nextPerPieceByMetricKey.set(metricKey, nextPerPiece);
      if (previousPerPiece === null) {
        maxRelativeChange = Number.POSITIVE_INFINITY;
      } else {
        const relativeChange =
          Math.abs(nextPerPiece - previousPerPiece) /
          Math.max(AT_WLS_MIN_WEIGHT, Math.abs(previousPerPiece));
        if (Number.isFinite(relativeChange)) {
          maxRelativeChange = Math.max(maxRelativeChange, relativeChange);
        }
      }
    });

    iterationCount = iteration;
    if (nextParamsByMetric.size > 0) {
      provisionalParamsByMetric = nextParamsByMetric;
    }
    perPieceByMetricKey = nextPerPieceByMetricKey;

    if (
      iteration >= AT_PROPORTIONAL_MIN_ITERATIONS &&
      maxRelativeChange <= AT_PROPORTIONAL_CONVERGENCE_EPSILON
    ) {
      converged = true;
      break;
    }
  }

  const { observations } = buildAllocatedObservations(days, perPieceByMetricKey);
  const dayWeightByKey = buildDayTrendWeights(days, provisionalParamsByMetric);

  const weightedPointsByMetric = new Map<string, WeightedRegressionPoint[]>();
  observations.forEach((observation) => {
    const dayWeight = dayWeightByKey.get(observation.dayKey) ?? 1;
    const quantity = Number(observation.quantity);
    const eventCount = Number(observation.eventCount ?? 1);
    const laborInputSeconds = Number(observation.laborInputSeconds);
    if (
      !Number.isFinite(dayWeight) ||
      dayWeight <= 0 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(eventCount) ||
      eventCount <= 0 ||
      !Number.isFinite(laborInputSeconds) ||
      laborInputSeconds <= 0
    ) {
      return;
    }

    const baseWeight = Math.max(1, Math.sqrt(quantity) * Math.sqrt(eventCount));
    const weight = Math.max(AT_WLS_MIN_WEIGHT, baseWeight * dayWeight);
    const current = weightedPointsByMetric.get(observation.metricKey) || [];
    current.push({
      quantity,
      eventCount,
      sourceGroupKey: normalizeSourceGroupKey(observation.sourceGroupKey),
      y: laborInputSeconds,
      weight,
    });
    weightedPointsByMetric.set(observation.metricKey, current);
  });

  const finalParamsByMetric = new Map<string, AtFittedParams>();
  const metricDiagnostics: AtMetricFitDiagnostic[] = [];
  const statusCounts = new Map<string, number>();
  let provisionalMetricCount = 0;
  metricKeys.forEach((metricKey) => {
    const weightedPoints = weightedPointsByMetric.get(metricKey) || [];
    const initialPerPieceSeconds =
      seededPerPieceByMetricKey.get(metricKey) ?? null;
    const inspected = inspectAtFitFromWeightedPoints(weightedPoints, {
      initialPerPieceSeconds,
    });
    const shouldAttemptProvisional = true;
    const provisionalFromIteration = shouldAttemptProvisional
      ? provisionalParamsByMetric.get(metricKey) || null
      : null;
    const validProvisionalFromIteration =
      provisionalFromIteration &&
      !resolveAtParamsMagnitudeFailure(
        provisionalFromIteration,
        weightedPoints,
        { initialPerPieceSeconds }
      )
        ? provisionalFromIteration
        : null;
    const provisional = shouldAttemptProvisional
      ? validProvisionalFromIteration ||
        buildProvisionalParamsFromWeightedPoints(weightedPoints, {
          initialPerPieceSeconds,
        }) ||
        null
      : null;
    const fittedBase = inspected.params || provisional;
    const status: AtMetricFitStatus = inspected.params
      ? "FITTED"
      : provisional
        ? "USED_PROVISIONAL"
        : inspected.status;
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    if (provisional !== null && !inspected.params) {
      provisionalMetricCount += 1;
    }
    const numericStyleProcessId = Number(
      metricKey.replace(/^STYLE_PROCESS:/, "")
    );
    metricDiagnostics.push({
      metricKey,
      styleProcessId:
        Number.isInteger(numericStyleProcessId) && numericStyleProcessId > 0
          ? numericStyleProcessId
          : null,
      weightedPointCount: inspected.weightedPointCount,
      distinctQuantityCount: inspected.distinctQuantityCount,
      distinctEventCount: inspected.distinctEventCount,
      distinctSourceGroupCount: inspected.distinctSourceGroupCount,
      minQuantity: inspected.minQuantity,
      maxQuantity: inspected.maxQuantity,
      minEventCount: inspected.minEventCount,
      maxEventCount: inspected.maxEventCount,
      quantitySamples: inspected.quantitySamples,
      eventCountSamples: inspected.eventCountSamples,
      sourceGroupSamples: inspected.sourceGroupSamples,
      provisionalAvailable: provisional !== null,
      fallbackReason: inspected.params ? null : inspected.status,
      status,
    });
    if (!fittedBase) return;
    finalParamsByMetric.set(metricKey, {
      ...fittedBase,
      fitStatus: status,
      isProvisional: status !== "FITTED",
      fallbackReason: status === "FITTED" ? null : inspected.status,
      weightedPointCount: inspected.weightedPointCount,
      distinctQuantityCount: inspected.distinctQuantityCount,
      distinctEventCount: inspected.distinctEventCount,
      distinctSourceGroupCount: inspected.distinctSourceGroupCount,
      minQuantity: inspected.minQuantity,
      maxQuantity: inspected.maxQuantity,
      minEventCount: inspected.minEventCount,
      maxEventCount: inspected.maxEventCount,
      quantitySamples: inspected.quantitySamples,
      eventCountSamples: inspected.eventCountSamples,
    });
  });

  return {
    paramsByMetric: finalParamsByMetric,
    allocatedObservations: observations,
    iterationCount,
    converged,
    diagnostics: {
      metricCount: metricKeys.length,
      weightedPointMetricCount: weightedPointsByMetric.size,
      provisionalMetricCount,
      fittedMetricCount: finalParamsByMetric.size,
      statusCounts: Object.fromEntries(statusCounts.entries()),
      rejectedMetricCount: rejectedMetricKeys.size,
      resetMetricCount: resetMetricKeys.size,
      metricSamples: metricDiagnostics
        .slice()
        .sort((left, right) => {
          if (left.status === right.status) {
            return String(left.metricKey).localeCompare(String(right.metricKey));
          }
          return String(left.status).localeCompare(String(right.status));
        })
        .slice(0, 50),
    },
  };
};
