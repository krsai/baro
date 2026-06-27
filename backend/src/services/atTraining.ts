export type AtMetricObservation = {
  quantity: number;
  laborInputSeconds: number;
};

export type AtTrainingDayProcessRow = {
  metricKey: string;
  quantity: number;
  attendanceCoverage?: number | null;
};

export type AtTrainingDayBucket = {
  dayKey: string;
  order: number;
  laborInputSeconds: number;
  processRows: AtTrainingDayProcessRow[];
};

export type AtMetricFitStatus =
  | "FITTED"
  | "USED_PROVISIONAL"
  | "INSUFFICIENT_POINTS"
  | "NO_QUANTITY_VARIATION"
  | "FIRST_REGRESSION_FAILED"
  | "SECOND_REGRESSION_FAILED"
  | "NEGATIVE_OR_INVALID_PARAMS"
  | "NORMALIZED_A_MISSING";

export type AtMetricFitDiagnostic = {
  metricKey: string;
  styleProcessId: number | null;
  weightedPointCount: number;
  distinctQuantityCount: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  quantitySamples: number[];
  provisionalAvailable: boolean;
  status: AtMetricFitStatus;
};

export type AtFittingDiagnostics = {
  metricCount: number;
  weightedPointMetricCount: number;
  provisionalMetricCount: number;
  fittedMetricCount: number;
  statusCounts: Record<string, number>;
  metricSamples: AtMetricFitDiagnostic[];
};

type AtAllocatedObservation = {
  dayKey: string;
  order: number;
  metricKey: string;
  quantity: number;
  laborInputSeconds: number;
};

type WeightedRegressionPoint = {
  x: number;
  y: number;
  weight: number;
};

type AtWeightedFitAttempt = {
  params: { a: number; b: number } | null;
  status: AtMetricFitStatus;
  weightedPointCount: number;
  distinctQuantityCount: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  quantitySamples: number[];
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

const AT_WLS_DETERMINANT_EPSILON = 1e-9;
const AT_WLS_RESIDUAL_SCALE = 0.35;
const AT_WLS_MIN_WEIGHT = 1e-4;
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
      const laborInputSeconds = Number(observation?.laborInputSeconds);
      if (
        !Number.isFinite(quantity) ||
        !Number.isFinite(laborInputSeconds) ||
        quantity <= 0 ||
        laborInputSeconds <= 0
      ) {
        return null;
      }
      return {
        x: quantity,
        y: laborInputSeconds,
        // Large quantity rows are usually less noisy, but use sqrt to avoid domination.
        weight: Math.max(1, Math.sqrt(quantity)),
      };
    })
    .filter((point): point is WeightedRegressionPoint => point !== null);

const fitWeightedLinearRegression = (
  points: WeightedRegressionPoint[]
): { a: number; b: number } | null => {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;

  points.forEach((point) => {
    const { x, y, weight } = point;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(weight)) return;
    if (x <= 0 || weight <= 0) return;
    sw += weight;
    sx += weight * x;
    sy += weight * y;
    sxx += weight * x * x;
    sxy += weight * x * y;
  });

  if (sw <= 0 || sxx <= 0) return null;
  const determinant = sw * sxx - sx * sx;
  if (Math.abs(determinant) <= AT_WLS_DETERMINANT_EPSILON) return null;

  const a = (sw * sxy - sx * sy) / determinant;
  const b = (sxx * sy - sx * sxy) / determinant;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
};

const applyResidualMagnitudeWeights = (
  points: WeightedRegressionPoint[],
  model: { a: number; b: number }
): WeightedRegressionPoint[] =>
  points.map((point) => {
    const predicted = model.a * point.x + model.b;
    const residualRatio = Math.abs(point.y - predicted) / Math.max(1, point.y);
    const scaled = residualRatio / AT_WLS_RESIDUAL_SCALE;
    const magnitudeWeight = 1 / (1 + scaled * scaled);
    return {
      ...point,
      weight: Math.max(AT_WLS_MIN_WEIGHT, point.weight * magnitudeWeight),
    };
  });

const fitAtParamsFromWeightedPoints = (
  pointsInput: WeightedRegressionPoint[]
): { a: number; b: number } | null => {
  const points = ensureArray<WeightedRegressionPoint>(pointsInput).filter(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.weight) &&
      point.x > 0 &&
      point.y > 0 &&
      point.weight > 0
  );

  const distinctQuantities = Array.from(
    new Set(points.map((point) => roundToScale(point.x, 4)))
  ).sort((left, right) => left - right);
  const quantitySamples = distinctQuantities.slice(0, 10);
  const minQuantity = quantitySamples.length > 0 ? distinctQuantities[0] ?? null : null;
  const maxQuantity =
    quantitySamples.length > 0
      ? distinctQuantities[distinctQuantities.length - 1] ?? null
      : null;
  if (points.length < 2) {
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
  if (!Number.isFinite(a) || a < 0 || !Number.isFinite(b) || b < 0) return null;

  const normalizedA = toOptionalSeconds(a);
  const normalizedB = toOptionalSeconds(b);
  if (normalizedA == null) return null;
  return { a: normalizedA, b: normalizedB ?? 0 };
};

const inspectAtFitFromWeightedPoints = (
  pointsInput: WeightedRegressionPoint[]
): AtWeightedFitAttempt => {
  const points = ensureArray<WeightedRegressionPoint>(pointsInput).filter(
    (point) =>
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.weight) &&
      point.x > 0 &&
      point.y > 0 &&
      point.weight > 0
  );

  const distinctQuantities = Array.from(
    new Set(points.map((point) => roundToScale(point.x, 4)))
  ).sort((left, right) => left - right);
  const quantitySamples = distinctQuantities.slice(0, 10);
  const minQuantity =
    distinctQuantities.length > 0 ? distinctQuantities[0] ?? null : null;
  const maxQuantity =
    distinctQuantities.length > 0
      ? distinctQuantities[distinctQuantities.length - 1] ?? null
      : null;

  if (points.length < 2) {
    return {
      params: null,
      status: "INSUFFICIENT_POINTS",
      weightedPointCount: points.length,
      distinctQuantityCount: distinctQuantities.length,
      minQuantity,
      maxQuantity,
      quantitySamples,
    };
  }

  if (distinctQuantities.length < 2) {
    return {
      params: null,
      status: "NO_QUANTITY_VARIATION",
      weightedPointCount: points.length,
      distinctQuantityCount: distinctQuantities.length,
      minQuantity,
      maxQuantity,
      quantitySamples,
    };
  }

  const firstFit = fitWeightedLinearRegression(points);
  if (!firstFit) {
    return {
      params: null,
      status: "FIRST_REGRESSION_FAILED",
      weightedPointCount: points.length,
      distinctQuantityCount: distinctQuantities.length,
      minQuantity,
      maxQuantity,
      quantitySamples,
    };
  }

  const secondPoints = applyResidualMagnitudeWeights(points, firstFit);
  const secondFit = fitWeightedLinearRegression(secondPoints);
  if (!secondFit) {
    return {
      params: null,
      status: "SECOND_REGRESSION_FAILED",
      weightedPointCount: points.length,
      distinctQuantityCount: distinctQuantities.length,
      minQuantity,
      maxQuantity,
      quantitySamples,
    };
  }

  const a = secondFit.a;
  const b = secondFit.b;
  if (!Number.isFinite(a) || a < 0 || !Number.isFinite(b) || b < 0) {
    return {
      params: null,
      status: "NEGATIVE_OR_INVALID_PARAMS",
      weightedPointCount: points.length,
      distinctQuantityCount: distinctQuantities.length,
      minQuantity,
      maxQuantity,
      quantitySamples,
    };
  }

  const normalizedA = toOptionalSeconds(a);
  const normalizedB = toOptionalSeconds(b);
  if (normalizedA == null) {
    return {
      params: null,
      status: "NORMALIZED_A_MISSING",
      weightedPointCount: points.length,
      distinctQuantityCount: distinctQuantities.length,
      minQuantity,
      maxQuantity,
      quantitySamples,
    };
  }

  return {
    params: { a: normalizedA, b: normalizedB ?? 0 },
    status: "FITTED",
    weightedPointCount: points.length,
    distinctQuantityCount: distinctQuantities.length,
    minQuantity,
    maxQuantity,
    quantitySamples,
  };
};

const fitAtParamsFromObservations = (
  observations: AtMetricObservation[]
): { a: number; b: number } | null => {
  const points = toAtRegressionPoints(observations);
  return fitAtParamsFromWeightedPoints(points);
};

const allocateDaySecondsAcrossProcesses = (
  day: AtTrainingDayBucket,
  perPieceByMetricKey: Map<string, number>
): AtAllocatedObservation[] => {
  const validRows = ensureArray<AtTrainingDayProcessRow>(day?.processRows)
    .map((row) => {
      const quantity = Number(row?.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      const metricKey = String(row?.metricKey || "").trim();
      if (!metricKey) return null;
      return { metricKey, quantity };
    })
    .filter((row): row is { metricKey: string; quantity: number } => Boolean(row));

  if (validRows.length === 0) return [];

  if (validRows.length === 1) {
    const row = validRows[0]!;
    return [
      {
        dayKey: day.dayKey,
        order: day.order,
        metricKey: row.metricKey,
        quantity: row.quantity,
        laborInputSeconds: day.laborInputSeconds,
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
  }).filter((row): row is { metricKey: string; quantity: number; work: number } => Boolean(row));

  if (withWork.length !== validRows.length) return [];

  let totalWork = withWork.reduce((sum, row) => sum + row.work, 0);
  if (!Number.isFinite(totalWork) || totalWork <= 0) {
    return [];
  }

  return withWork.map((row) => ({
    dayKey: day.dayKey,
    order: day.order,
    metricKey: row.metricKey,
    quantity: row.quantity,
    laborInputSeconds: day.laborInputSeconds * (row.work / totalWork),
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
        laborInputSeconds: row.laborInputSeconds,
      });
      observationsByMetric.set(row.metricKey, current);
    });
  });

  return { observations, observationsByMetric };
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
        if (!Number.isFinite(quantity) || quantity <= 0) return sum;
        const metricKey = String(row?.metricKey || "").trim();
        if (!metricKey) return sum;
        const fitted = provisionalParamsByMetric.get(metricKey);
        if (fitted) {
          return sum + fitted.a * quantity + fitted.b;
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
  paramsByMetric: Map<string, { a: number; b: number }>;
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
      const fitted = fitAtParamsFromObservations(observations);
      if (!fitted) return;

      nextParamsByMetric.set(metricKey, fitted);
      const previousPerPiece = toOptionalSeconds(perPieceByMetricKey.get(metricKey));
      const nextPerPiece = Math.max(AT_WLS_MIN_WEIGHT, fitted.a);
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
    const laborInputSeconds = Number(observation.laborInputSeconds);
    if (
      !Number.isFinite(dayWeight) ||
      dayWeight <= 0 ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(laborInputSeconds) ||
      laborInputSeconds <= 0
    ) {
      return;
    }

    const baseWeight = Math.max(1, Math.sqrt(quantity));
    const weight = Math.max(AT_WLS_MIN_WEIGHT, baseWeight * dayWeight);
    const current = weightedPointsByMetric.get(observation.metricKey) || [];
    current.push({
      x: quantity,
      y: laborInputSeconds,
      weight,
    });
    weightedPointsByMetric.set(observation.metricKey, current);
  });

  const finalParamsByMetric = new Map<string, { a: number; b: number }>();
  const metricDiagnostics: AtMetricFitDiagnostic[] = [];
  const statusCounts = new Map<string, number>();
  metricKeys.forEach((metricKey) => {
    const weightedPoints = weightedPointsByMetric.get(metricKey) || [];
    const inspected = inspectAtFitFromWeightedPoints(weightedPoints);
    const provisional = provisionalParamsByMetric.get(metricKey) || null;
    const fitted = inspected.params || provisional;
    const status: AtMetricFitStatus = inspected.params
      ? "FITTED"
      : provisional
        ? "USED_PROVISIONAL"
        : inspected.status;
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    const numericStyleProcessId = Number(metricKey.replace(/^sp:/, ""));
    metricDiagnostics.push({
      metricKey,
      styleProcessId:
        Number.isInteger(numericStyleProcessId) && numericStyleProcessId > 0
          ? numericStyleProcessId
          : null,
      weightedPointCount: inspected.weightedPointCount,
      distinctQuantityCount: inspected.distinctQuantityCount,
      minQuantity: inspected.minQuantity,
      maxQuantity: inspected.maxQuantity,
      quantitySamples: inspected.quantitySamples,
      provisionalAvailable: provisional !== null,
      status,
    });
    if (!fitted) return;
    finalParamsByMetric.set(metricKey, fitted);
  });

  return {
    paramsByMetric: finalParamsByMetric,
    iterationCount,
    converged,
    diagnostics: {
      metricCount: metricKeys.length,
      weightedPointMetricCount: weightedPointsByMetric.size,
      provisionalMetricCount: provisionalParamsByMetric.size,
      fittedMetricCount: finalParamsByMetric.size,
      statusCounts: Object.fromEntries(statusCounts.entries()),
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
