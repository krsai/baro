#!/usr/bin/env node

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const ORG_ID = Number(process.env.ORG_ID ?? 2);
const FACTORY_ID = Number(process.env.FACTORY_ID ?? 1);
const OPERATOR_EMAIL =
  process.env.OPERATOR_EMAIL ?? "manufacturer-operator@test.local";
const SHIFT_SECONDS = Number(process.env.SHIFT_SECONDS ?? 8 * 60 * 60);
const TARGET_VARIANCE = Math.max(
  0,
  Math.min(5, Number(process.env.TARGET_VARIANCE ?? 4))
);
const SEED = Number(process.env.SEED ?? 20260306);
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? "");
const NOTE_PREFIX = "AUTO_SAMPLE_WORK_LOG";

const createRng = (seed) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const rng = createRng(SEED);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildQuery = (params = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
};

const api = async (path, { method = "GET", body } = {}) => {
  const headers = new Headers();
  headers.set("x-user-email", OPERATOR_EMAIL);
  headers.set("x-org-id", String(ORG_ID));
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    error.path = path;
    throw error;
  }

  return data;
};

const toFiniteNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
};

const toPositiveInt = (value, fallback = 0) =>
  toPositiveIntOrNull(value) ?? fallback;

const toDateKey = (date) => date.toISOString().slice(0, 10);

const parseDateKey = (dateKey) => new Date(`${dateKey}T12:00:00Z`);

const listDateKeysInclusive = (startDateKey, endDateKey) => {
  const result = [];
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    result.push(toDateKey(cursor));
  }
  return result;
};

const isSunday = (dateKey) => parseDateKey(dateKey).getUTCDay() === 0;

const randomInt = (random, min, max) => {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(random() * (upper - lower + 1)) + lower;
};

const sum = (items, selector) =>
  items.reduce((total, item, index) => total + selector(item, index), 0);

const allocateByWeights = (total, weights) => {
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  if (safeTotal === 0 || weights.length === 0) {
    return Array.from({ length: weights.length }, () => 0);
  }

  const normalized = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0
  );
  const sumWeights = normalized.reduce((acc, weight) => acc + weight, 0);
  const basis = sumWeights > 0 ? normalized : normalized.map(() => 1);
  const denominator = sumWeights > 0 ? sumWeights : basis.length;
  const raw = basis.map((weight) => (safeTotal * weight) / denominator);
  const floorValues = raw.map((value) => Math.floor(value));
  let remaining = safeTotal - floorValues.reduce((acc, value) => acc + value, 0);

  const order = raw
    .map((value, index) => ({
      index,
      fraction: value - floorValues[index],
      weight: basis[index],
    }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction ||
        right.weight - left.weight ||
        left.index - right.index
    );

  for (let index = 0; index < order.length && remaining > 0; index += 1) {
    floorValues[order[index].index] += 1;
    remaining -= 1;
  }

  return floorValues;
};

const splitQuantity = (total, parts) => {
  if (parts <= 0) return [];
  if (parts === 1) return [total];
  if (parts > total) {
    throw new Error(`cannot split quantity ${total} into ${parts} positive parts`);
  }

  const weights = Array.from({ length: parts }, () => 0.9 + rng() * 0.2);
  const base = Array.from({ length: parts }, () => 1);
  const remaining = allocateByWeights(total - parts, weights);
  return base.map((value, index) => value + remaining[index]);
};

const extractProcessCode = (process, index) => {
  const rawKey =
    typeof process?.processKey === "string" && process.processKey.trim()
      ? process.processKey.trim()
      : "";
  if (rawKey) return rawKey.split("-")[0];

  const rawCode =
    typeof process?.code === "string" && process.code.trim()
      ? process.code.trim()
      : "";
  if (rawCode) return rawCode;

  return `P${String(index + 1).padStart(2, "0")}`;
};

const buildPlanProcesses = (plan) => {
  const snapshotProcesses = Array.isArray(plan?.ctAgreedSnapshot?.processes)
    ? plan.ctAgreedSnapshot.processes
    : [];

  return snapshotProcesses
    .map((process, index) => {
      const ctSeconds = toPositiveInt(
        process?.agreedPerPieceSeconds ??
          process?.agreedSeconds ??
          process?.requestedSeconds ??
          process?.stSeconds,
        0
      );
      if (!ctSeconds) return null;

      return {
        processCode: extractProcessCode(process, index),
        processName:
          typeof process?.name === "string" && process.name.trim()
            ? process.name.trim()
            : `Process ${index + 1}`,
        ctSeconds,
        processIndex: index,
      };
    })
    .filter(Boolean);
};

const buildDailyWeights = (plan) => {
  const schedule = plan?.ctAgreedSnapshot?.schedule;
  if (!schedule?.startDateKey || !schedule?.endDateKey) return [];

  const allDateKeys = listDateKeysInclusive(
    schedule.startDateKey,
    schedule.endDateKey
  );
  const dateKeys = allDateKeys.filter((dateKey) => !isSunday(dateKey));
  const effectiveDateKeys = dateKeys.length > 0 ? dateKeys : allDateKeys;
  const startShare = clamp(
    toFiniteNumber(schedule.startDayPercent, 100),
    1,
    100
  );
  const endShare = clamp(toFiniteNumber(schedule.endDayPercent, 100), 1, 100);

  return effectiveDateKeys.map((dateKey, index) => {
    if (effectiveDateKeys.length === 1) {
      return { dateKey, weight: Math.max(startShare, endShare) / 100 };
    }
    if (index === 0) {
      return {
        dateKey,
        weight: dateKey === schedule.startDateKey ? startShare / 100 : 1,
      };
    }
    if (index === effectiveDateKeys.length - 1) {
      return {
        dateKey,
        weight: dateKey === schedule.endDateKey ? endShare / 100 : 1,
      };
    }
    return { dateKey, weight: 1 };
  });
};

const normalizePlan = (plan) => {
  const lineId = toPositiveInt(plan?.lineId, 0);
  const baselineQuantity = toPositiveInt(plan?.finalQuantity ?? plan?.quantity, 0);
  const processes = buildPlanProcesses(plan);
  const dailyWeights = buildDailyWeights(plan);

  if (!lineId || !baselineQuantity || processes.length === 0 || dailyWeights.length === 0) {
    return null;
  }

  const varianceLimit = Math.min(TARGET_VARIANCE, Math.max(0, baselineQuantity - 1));
  const variance =
    varianceLimit > 0 ? randomInt(rng, -varianceLimit, varianceLimit) : 0;
  const targetQuantity = baselineQuantity + variance;
  const dailyQuantities = allocateByWeights(
    targetQuantity,
    dailyWeights.map((item) => item.weight)
  );

  return {
    dbId: toPositiveInt(plan?.dbId, 0),
    externalId: String(plan?.id || ""),
    lineId,
    styleId: String(plan?.styleId || ""),
    styleName: String(plan?.label || ""),
    orderNo: String(plan?.orderNo || ""),
    customerName: String(plan?.customer || ""),
    colorId: toPositiveIntOrNull(plan?.colorId),
    colorName: String(plan?.colorName || ""),
    baselineQuantity,
    targetQuantity,
    totalPerPieceSeconds: sum(processes, (process) => process.ctSeconds),
    processes,
    schedule: plan?.ctAgreedSnapshot?.schedule ?? null,
    dailyRows: dailyWeights
      .map((weight, index) => ({
        dateKey: weight.dateKey,
        weight: weight.weight,
        quantity: dailyQuantities[index] ?? 0,
      }))
      .filter((row) => row.quantity > 0),
  };
};

const allocateWorkerCounts = (tasks, workerCount) => {
  if (tasks.length === 0 || workerCount <= 0) {
    return Array.from({ length: tasks.length }, () => 0);
  }

  const counts = Array.from({ length: tasks.length }, () => 0);
  let remaining = workerCount;

  if (tasks.length <= workerCount) {
    for (let index = 0; index < tasks.length; index += 1) {
      counts[index] = 1;
      remaining -= 1;
    }
  }

  while (remaining > 0) {
    let bestIndex = -1;
    let bestScore = -1;

    for (let index = 0; index < tasks.length; index += 1) {
      if (counts[index] >= tasks[index].quantity) continue;
      const score = tasks[index].totalSeconds / (counts[index] + 1);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) break;
    counts[bestIndex] += 1;
    remaining -= 1;
  }

  return counts;
};

const buildLineDayEntries = (plans) => {
  const entryMap = new Map();

  plans.forEach((plan, planOrder) => {
    plan.dailyRows.forEach((row) => {
      const key = `${plan.lineId}::${row.dateKey}`;
      if (!entryMap.has(key)) {
        entryMap.set(key, {
          lineId: plan.lineId,
          dateKey: row.dateKey,
          items: [],
        });
      }

      entryMap.get(key).items.push({
        plan,
        quantity: row.quantity,
        planOrder,
      });
    });
  });

  return Array.from(entryMap.values()).sort(
    (left, right) =>
      left.lineId - right.lineId || left.dateKey.localeCompare(right.dateKey)
  );
};

const formatHours = (seconds, workerCount) =>
  (seconds / Math.max(1, workerCount) / 3600).toFixed(2);

const summarizeProgress = (rows, planByExternalId) => {
  return rows
    .map((row) => {
      const plan = planByExternalId.get(String(row.id || ""));
      return {
        dbId: row.dbId,
        orderNo: row.orderNo,
        label: row.label,
        colorName: plan?.colorName ?? "",
        plannedQuantity: row.plannedQuantity,
        producedQuantity: row.producedQuantity,
        diff:
          Number.isFinite(row.producedQuantity) && Number.isFinite(plan?.baselineQuantity)
            ? row.producedQuantity - plan.baselineQuantity
            : null,
      };
    })
    .sort((left, right) => left.dbId - right.dbId);
};

const run = async () => {
  const [factories, rawPlans, existingLogs] = await Promise.all([
    api(`/factories${buildQuery({ orgId: ORG_ID })}`),
    api(`/assignment-plans${buildQuery({ orgId: ORG_ID, factoryId: FACTORY_ID })}`),
    api(`/work-logs${buildQuery({ orgId: ORG_ID, factoryId: FACTORY_ID })}`),
  ]);

  const factory = Array.isArray(factories)
    ? factories.find((item) => Number(item?.id) === FACTORY_ID) ?? null
    : null;
  if (!factory) {
    throw new Error(`factory not found: ${FACTORY_ID}`);
  }

  const plans = (Array.isArray(rawPlans) ? rawPlans : [])
    .filter((plan) => String(plan?.ctStatus || "").toUpperCase() === "AGREED")
    .map(normalizePlan)
    .filter(Boolean);

  if (plans.length === 0) {
    throw new Error("no agreed assignment plans found");
  }

  const existingKeys = new Set(
    (Array.isArray(existingLogs) ? existingLogs : []).map(
      (log) => `${log.lineId ?? "?"}::${log.workDate ?? ""}`
    )
  );

  const workerCache = new Map();
  const getWorkersForLineDate = async (lineId, dateKey) => {
    const cacheKey = `${lineId}::${dateKey}`;
    if (!workerCache.has(cacheKey)) {
      workerCache.set(
        cacheKey,
        api(
          `/line-workers${buildQuery({
            orgId: ORG_ID,
            factoryId: FACTORY_ID,
            lineId,
            workDate: dateKey,
          })}`
        )
      );
    }
    let rows;
    try {
      rows = await workerCache.get(cacheKey);
    } catch (error) {
      throw new Error(
        `failed to load line workers for line ${lineId} on ${dateKey}: ${error.message}`
      );
    }
    return Array.isArray(rows) ? rows.slice().sort((left, right) => left.id - right.id) : [];
  };

  const entries = buildLineDayEntries(plans);
  const planByExternalId = new Map(plans.map((plan) => [plan.externalId, plan]));

  console.log(
    `Plans: ${plans.length}, line-days: ${entries.length}, seed: ${SEED}, dryRun: ${DRY_RUN}`
  );
  plans.forEach((plan) => {
    const startDateKey = plan.dailyRows[0]?.dateKey ?? "?";
    const endDateKey = plan.dailyRows[plan.dailyRows.length - 1]?.dateKey ?? "?";
    console.log(
      `  plan ${plan.dbId} line ${plan.lineId}: ${plan.orderNo} / ${plan.styleName} / ${plan.colorName} -> ${plan.baselineQuantity} => ${plan.targetQuantity} (${startDateKey}~${endDateKey})`
    );
  });

  let createdCount = 0;
  let skippedCount = 0;

  for (const entry of entries) {
    const logKey = `${entry.lineId}::${entry.dateKey}`;
    if (existingKeys.has(logKey)) {
      skippedCount += 1;
      console.log(`SKIP ${logKey} already exists`);
      continue;
    }

    const workers = await getWorkersForLineDate(entry.lineId, entry.dateKey);
    if (workers.length === 0) {
      throw new Error(`no line workers for line ${entry.lineId} on ${entry.dateKey}`);
    }

    const tasks = entry.items
      .sort((left, right) => left.planOrder - right.planOrder || left.plan.dbId - right.plan.dbId)
      .flatMap((item) =>
        item.plan.processes.map((process) => ({
          plan: item.plan,
          quantity: item.quantity,
          totalSeconds: item.quantity * process.ctSeconds,
          processCode: process.processCode,
          processName: process.processName,
          ctSeconds: process.ctSeconds,
          processIndex: process.processIndex,
        }))
      );

    const workerCounts = allocateWorkerCounts(tasks, workers.length);
    const records = [];
    let workerCursor = 0;

    tasks.forEach((task, taskIndex) => {
      const assignedWorkerCount = workerCounts[taskIndex] ?? 0;
      if (assignedWorkerCount <= 0) return;

      const assignedWorkers = workers.slice(
        workerCursor,
        workerCursor + assignedWorkerCount
      );
      workerCursor += assignedWorkers.length;
      if (assignedWorkers.length === 0) return;

      const splitQuantities = splitQuantity(task.quantity, assignedWorkers.length);
      assignedWorkers.forEach((worker, workerIndex) => {
        records.push({
          workerId: worker.id,
          workerName: worker.name,
          customerName: task.plan.customerName,
          styleId: task.plan.styleId,
          styleName: task.plan.styleName,
          processCode: task.processCode,
          processName: task.processName,
          colorId: task.plan.colorId,
          colorName: task.plan.colorName,
          ctSeconds: task.ctSeconds,
          quantity: splitQuantities[workerIndex],
          assignmentPlanId: task.plan.dbId,
        });
      });
    });

    if (workerCursor !== workers.length) {
      throw new Error(
        `worker allocation mismatch for line ${entry.lineId} on ${entry.dateKey}: ${workerCursor}/${workers.length}`
      );
    }

    const totalContractedSeconds = sum(
      records,
      (record) => record.ctSeconds * record.quantity
    );
    const body = {
      workDate: entry.dateKey,
      factoryId: FACTORY_ID,
      factoryName: factory.name,
      factoryWagePerSecond: toFiniteNumber(factory.wagePerSecond, null),
      lineId: entry.lineId,
      ctBasis: "CT",
      workerCount: workers.length,
      itemCount: records.length,
      totalContractedSeconds,
      records,
      note: `${NOTE_PREFIX} seed=${SEED}`,
    };

    const planLabels = entry.items
      .map((item) => `${item.plan.dbId}:${item.plan.targetQuantity}`)
      .join(", ");
    console.log(
      `PREP ${logKey} workers=${workers.length} records=${records.length} avgHours=${formatHours(
        totalContractedSeconds,
        workers.length
      )} plans=[${planLabels}]`
    );

    if (DRY_RUN) {
      skippedCount += 1;
      continue;
    }

    await api(`/work-logs${buildQuery({ orgId: ORG_ID })}`, {
      method: "POST",
      body,
    });

    existingKeys.add(logKey);
    createdCount += 1;
  }

  console.log(
    `Work log generation complete. created=${createdCount}, skipped=${skippedCount}`
  );

  if (DRY_RUN) return;

  const ids = plans.map((plan) => plan.externalId).filter(Boolean).join(",");
  const progressRows = await api(
    `/assignment-plan-progress${buildQuery({ orgId: ORG_ID, ids })}`
  );
  const summary = summarizeProgress(
    Array.isArray(progressRows) ? progressRows : [],
    planByExternalId
  );

  const violations = summary.filter(
    (row) =>
      row.diff !== null &&
      Math.abs(row.diff) > TARGET_VARIANCE
  );

  console.log("Verification:");
  summary.forEach((row) => {
    console.log(
      `  plan ${row.dbId}: planned=${row.plannedQuantity}, produced=${row.producedQuantity}, diff=${row.diff}`
    );
  });

  if (violations.length > 0) {
    const preview = violations
      .map((row) => `${row.dbId}(diff=${row.diff})`)
      .join(", ");
    throw new Error(`quantity verification failed: ${preview}`);
  }
};

run().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
