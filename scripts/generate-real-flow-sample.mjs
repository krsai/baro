#!/usr/bin/env node

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const MANUFACTURER_CODE = "TSMF";
const BRAND_CODE = "TSBR";

const ACTOR_ADMIN_EMAIL = "manufacturer-admin@test.local";
const ACTOR_OPERATOR_EMAIL = "manufacturer-operator@test.local";
const SEED = Number(process.env.SEED) || Date.now();
const EXTRA_DAYS = Number(process.env.EXTRA_DAYS ?? 0);
const WORK_SECONDS_PER_DAY = 8 * 60 * 60;

const TARGET_WORKERS = [
  { email: "manufacturer-worker@test.local", name: "Test Worker" },
  { email: "sample-line-worker-01@test.local", name: "샘플 작업자 01" },
  { email: "sample-line-worker-02@test.local", name: "샘플 작업자 02" },
  { email: "sample-line-worker-03@test.local", name: "샘플 작업자 03" },
  { email: "sample-line-worker-04@test.local", name: "샘플 작업자 04" },
  { email: "sample-line-worker-05@test.local", name: "샘플 작업자 05" },
  { email: "sample-line-worker-06@test.local", name: "샘플 작업자 06" },
  { email: "sample-line-worker-07@test.local", name: "샘플 작업자 07" },
  { email: "sample-line-worker-08@test.local", name: "샘플 작업자 08" },
];

const PROCESS_SECONDS = [450, 480, 500, 520, 530, 510, 490, 500, 510, 510]; // sum: 5000
const DAILY_QUANTITIES = [300, 300, 300, 300, 300]; // sum: 1500

const buildQuery = (params = {}) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
};

const api = async (path, { method = "GET", body, userEmail, orgId } = {}) => {
  const headers = new Headers();
  if (userEmail) headers.set("x-user-email", String(userEmail).trim().toLowerCase());
  if (orgId) headers.set("x-org-id", String(orgId));
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
      typeof data?.error === "string" ? data.error : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    error.path = path;
    throw error;
  }
  return data;
};

const toDateKey = (date) => date.toISOString().slice(0, 10);
const toNum = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const createRng = (seed) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
const randomFloat = (rng, min, max) => rng() * (max - min) + min;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async () => {
  const organizations = await api("/organizations");
  const manufacturer = organizations.find((org) => org?.code === MANUFACTURER_CODE);
  const brand = organizations.find((org) => org?.code === BRAND_CODE);

  assert(manufacturer, `organization not found: ${MANUFACTURER_CODE}`);
  assert(brand, `organization not found: ${BRAND_CODE}`);

  const customers = await api(`/customers${buildQuery({ orgId: manufacturer.id })}`, {
    userEmail: ACTOR_ADMIN_EMAIL,
  });
  const linkedCustomer = Array.isArray(customers)
    ? customers.find((item) => Number(item?.brandOrgId) === Number(brand.id))
    : null;
  assert(linkedCustomer, "manufacturer-brand relationship not found");

  const factories = await api(`/factories${buildQuery({ orgId: manufacturer.id })}`, {
    userEmail: ACTOR_ADMIN_EMAIL,
  });
  assert(Array.isArray(factories) && factories.length > 0, "no factory found for manufacturer");
  const factory =
    factories.find((item) => String(item?.name || "").trim() === "Sample Factory") || factories[0];

  const lines = await api(
    `/lines${buildQuery({ orgId: manufacturer.id, factoryId: factory.id })}`,
    { userEmail: ACTOR_ADMIN_EMAIL }
  );
  assert(Array.isArray(lines) && lines.length > 0, "no line found for selected factory");
  const line =
    lines.find((item) => String(item?.name || "").trim() === "Sample Line") || lines[0];

  const attributes = await api(`/attributes${buildQuery({ orgId: manufacturer.id })}`, {
    userEmail: ACTOR_ADMIN_EMAIL,
  });
  const processAttributes = Array.isArray(attributes?.processes) ? attributes.processes : [];
  assert(processAttributes.length >= 10, "at least 10 processes are required");
  const selectedProcesses = processAttributes.slice(0, 10);

  const colors = Array.isArray(attributes?.colors) ? attributes.colors : [];
  const selectedColor = colors[0] ?? { id: null, code: "BLK", name: "Black" };

  const now = new Date();
  const styleSuffix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes()
  ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const styleId = `SAMPLE-${styleSuffix}`;
  const styleName = `샘플 스타일 ${styleSuffix}`;

  const stylePayload = {
    id: styleId,
    styleCode: styleId,
    name: styleName,
    customer: brand.name,
    customerOrgId: brand.id,
    registrationDate: toDateKey(now),
    designer: "샘플 디자이너",
    collection: "TEST_FLOW",
    season: "ALL",
    processes: selectedProcesses.map((process, index) => ({
      code: process.code,
      name: process.name,
      pt: PROCESS_SECONDS[index] ?? 500,
      at: null,
    })),
    bom: [],
    bomNotes: "실사용 플로우 검증용 샘플 스타일",
  };

  const createdStyle = await api(`/styles${buildQuery({ orgId: manufacturer.id })}`, {
    method: "POST",
    userEmail: ACTOR_OPERATOR_EMAIL,
    body: stylePayload,
  });

  assert(Number(createdStyle?.ownerOrgId) === Number(brand.id), "style owner is not brand");

  const orderNumber = `ORD-${styleSuffix}`;
  const orderPayload = {
    id: `order-${styleSuffix}`,
    orderNumber,
    buyerOrgId: brand.id,
    buyerOrgName: brand.name,
    sellerOrgId: manufacturer.id,
    sellerOrgName: manufacturer.name,
    customerId: brand.id,
    customerName: brand.name,
    customer: brand.name,
    dueDate: toDateKey(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)),
    status: "주문접수",
    items: [
      {
        id: `item-${styleSuffix}`,
        styleId: createdStyle.id,
        styleCode: createdStyle.styleCode,
        styleName: createdStyle.name,
        colorId: selectedColor.id,
        colorCode: selectedColor.code,
        colorName: selectedColor.name,
        gender: "U",
        sizeQuantities: {
          XS: 0,
          S: 500,
          M: 500,
          L: 500,
          XL: 0,
          XXL: 0,
        },
        quantities: [
          {
            id: `qty-${styleSuffix}-s`,
            colorId: selectedColor.id ?? selectedColor.code,
            colorCode: selectedColor.code,
            colorName: selectedColor.name,
            gender: "U",
            sizeId: "S",
            quantity: 500,
          },
          {
            id: `qty-${styleSuffix}-m`,
            colorId: selectedColor.id ?? selectedColor.code,
            colorCode: selectedColor.code,
            colorName: selectedColor.name,
            gender: "U",
            sizeId: "M",
            quantity: 500,
          },
          {
            id: `qty-${styleSuffix}-l`,
            colorId: selectedColor.id ?? selectedColor.code,
            colorCode: selectedColor.code,
            colorName: selectedColor.name,
            gender: "U",
            sizeId: "L",
            quantity: 500,
          },
        ],
        totalQuantity: 1500,
      },
    ],
    totalQuantity: 1500,
  };

  const createdOrder = await api(`/orders${buildQuery({ orgId: manufacturer.id })}`, {
    method: "POST",
    userEmail: ACTOR_OPERATOR_EMAIL,
    body: orderPayload,
  });

  assert(Number(createdOrder?.ownerOrgId) === Number(brand.id), "order owner is not brand");

  let memberships = await api(`/org-memberships${buildQuery({ orgId: manufacturer.id })}`, {
    userEmail: ACTOR_ADMIN_EMAIL,
  });

  const ensuredMemberships = [];
  for (const targetWorker of TARGET_WORKERS) {
    const targetEmail = String(targetWorker.email).trim().toLowerCase();
    let membership = memberships.find(
      (item) => String(item?.email || "").trim().toLowerCase() === targetEmail
    );

    if (!membership) {
      membership = await api("/org-memberships/apply", {
        method: "POST",
        userEmail: ACTOR_ADMIN_EMAIL,
        body: {
          orgId: manufacturer.id,
          email: targetEmail,
          role: "WORKER",
        },
      });
      memberships = [...memberships, membership];
    }

    if (String(membership.status).toUpperCase() !== "ACTIVE") {
      membership = await api(`/org-memberships/${membership.id}/approve`, {
        method: "PATCH",
        userEmail: ACTOR_ADMIN_EMAIL,
        body: {
          role: "WORKER",
          approvedBy: ACTOR_ADMIN_EMAIL,
          factoryId: factory.id,
        },
      });
    }

    await api("/employees", {
      method: "POST",
      userEmail: ACTOR_ADMIN_EMAIL,
      body: {
        orgMembershipId: membership.id,
        factoryId: factory.id,
        name: targetWorker.name,
        position: "WORKER",
      },
    });

    ensuredMemberships.push({ ...membership, email: targetEmail, workerName: targetWorker.name });
  }

  const lineWorkersBeforeAssign = await api(
    `/line-workers${buildQuery({ orgId: manufacturer.id, factoryId: factory.id })}`,
    { userEmail: ACTOR_ADMIN_EMAIL }
  );
  const workerByEmail = new Map(
    (Array.isArray(lineWorkersBeforeAssign) ? lineWorkersBeforeAssign : []).map((worker) => [
      String(worker?.email || "").trim().toLowerCase(),
      worker,
    ])
  );

  const targetEmployees = TARGET_WORKERS.map((targetWorker) => {
    const worker = workerByEmail.get(String(targetWorker.email).trim().toLowerCase());
    assert(worker?.id, `employee not found for ${targetWorker.email}`);
    return worker;
  });

  for (const worker of targetEmployees) {
    if (Number(worker.currentLineId) === Number(line.id)) continue;
    await api(`/line-assignments/assign${buildQuery({ orgId: manufacturer.id })}`, {
      method: "POST",
      userEmail: ACTOR_ADMIN_EMAIL,
      body: { lineId: line.id, employeeId: worker.id },
    });
  }

  const lineWorkersAfterAssign = await api(
    `/line-workers${buildQuery({ orgId: manufacturer.id, factoryId: factory.id })}`,
    { userEmail: ACTOR_ADMIN_EMAIL }
  );
  const assignedTargetWorkers = (Array.isArray(lineWorkersAfterAssign) ? lineWorkersAfterAssign : [])
    .filter((worker) =>
      TARGET_WORKERS.some(
        (targetWorker) =>
          String(targetWorker.email).trim().toLowerCase() ===
          String(worker?.email || "").trim().toLowerCase()
      )
    )
    .filter((worker) => Number(worker.currentLineId) === Number(line.id));

  assert(assignedTargetWorkers.length === 9, "failed to assign 9 target workers to line");

  const processRows = (Array.isArray(createdStyle?.processes) ? createdStyle.processes : [])
    .slice(0, 10)
    .map((process, index) => ({
      code: process?.code || selectedProcesses[index]?.code || `P${String(index + 1).padStart(2, "0")}`,
      name: process?.name || selectedProcesses[index]?.name || `공정 ${index + 1}`,
      pt: Number(process?.pt) > 0 ? Number(process.pt) : PROCESS_SECONDS[index] ?? 500,
    }));
  assert(processRows.length === 10, "style must contain 10 processes");

  const workerIds = assignedTargetWorkers.map((worker) => Number(worker.id)).filter(Number.isFinite);
  assert(workerIds.length === 9, "assigned worker ids are invalid");
  const workerNameById = new Map(assignedTargetWorkers.map((worker) => [Number(worker.id), worker.name]));

  const createdWorkLogs = [];
  let totalProducedQuantity = 0;
  const rng = createRng(SEED);
  const baseRandomCtFactor =
    rng() < 0.5 ? randomFloat(rng, 0.94, 0.985) : randomFloat(rng, 1.015, 1.06);
  const today = new Date();
  const firstDay = new Date(today.getTime() - (DAILY_QUANTITIES.length - 1) * 24 * 60 * 60 * 1000);
  const workLogDrafts = [];

  for (let dayIndex = 0; dayIndex < DAILY_QUANTITIES.length; dayIndex += 1) {
    const dayQuantity = DAILY_QUANTITIES[dayIndex];
    const workDate = new Date(firstDay.getTime() + dayIndex * 24 * 60 * 60 * 1000);
    const eachRecordQty = Math.floor(dayQuantity / 10);
    let remaining = dayQuantity;

    const records = processRows.map((process, processIndex) => {
      const quantity = processIndex === 9 ? remaining : eachRecordQty;
      remaining -= quantity;
      const workerId = workerIds[processIndex % workerIds.length];
      totalProducedQuantity += quantity;
      return {
        workerId,
        workerName: workerNameById.get(workerId) || `Worker ${workerId}`,
        customerName: brand.name,
        styleId: createdStyle.id,
        styleName: createdStyle.name,
        processCode: process.code,
        processName: process.name,
        colorId: selectedColor.id,
        colorCode: selectedColor.code,
        colorName: selectedColor.name,
        ptSeconds: toNum(process.pt, 500),
        rawCtSeconds: toNum(process.pt, 500) * randomFloat(rng, 0.68, 1.42),
        quantity,
      };
    });

    workLogDrafts.push({
      dayIndex,
      workDate,
      records,
    });
  }

  assert(totalProducedQuantity === 1500, "total produced quantity is not 1500");

  const totalPtSeconds = workLogDrafts.reduce(
    (sum, draft) =>
      sum +
      draft.records.reduce(
        (innerSum, record) => innerSum + toNum(record.ptSeconds) * toNum(record.quantity),
        0
      ),
    0
  );
  const totalRawCtSeconds = workLogDrafts.reduce(
    (sum, draft) =>
      sum +
      draft.records.reduce(
        (innerSum, record) => innerSum + toNum(record.rawCtSeconds) * toNum(record.quantity),
        0
      ),
    0
  );
  const lineWorkerCount = Math.max(1, assignedTargetWorkers.length);
  const normalizedExtraDays = Number.isFinite(EXTRA_DAYS) ? EXTRA_DAYS : 0;
  const plannedLineDays = totalPtSeconds / (lineWorkerCount * WORK_SECONDS_PER_DAY);
  const targetLineDays = Math.max(0, plannedLineDays + normalizedExtraDays);
  const derivedCtFactorByDays =
    plannedLineDays > 0 ? targetLineDays / plannedLineDays : 1;
  const targetCtFactor =
    normalizedExtraDays === 0
      ? baseRandomCtFactor
      : derivedCtFactorByDays * randomFloat(rng, 0.995, 1.005);
  const scale = totalRawCtSeconds > 0 ? (totalPtSeconds * targetCtFactor) / totalRawCtSeconds : 1;
  const upperCtMultiplier = Math.max(1.6, Math.min(3.0, targetCtFactor * 1.25));

  let insertedTotalCtSeconds = 0;
  for (const draft of workLogDrafts) {
    const records = draft.records.map((record, index) => {
      const pt = toNum(record.ptSeconds, 500);
      const minGap = Math.max(10, Math.round(pt * 0.06));
      let ct = Math.max(1, Math.round(toNum(record.rawCtSeconds, pt) * scale));
      if (Math.abs(ct - pt) < minGap) {
        ct += (index + draft.dayIndex) % 2 === 0 ? minGap : -minGap;
      }
      ct = clamp(
        ct,
        Math.max(1, Math.round(pt * 0.5)),
        Math.max(1, Math.round(pt * upperCtMultiplier))
      );
      insertedTotalCtSeconds += ct * toNum(record.quantity);
      return {
        workerId: record.workerId,
        workerName: record.workerName,
        customerName: record.customerName,
        styleId: record.styleId,
        styleName: record.styleName,
        processCode: record.processCode,
        processName: record.processName,
        colorId: record.colorId,
        colorCode: record.colorCode,
        colorName: record.colorName,
        ctSeconds: ct,
        quantity: record.quantity,
      };
    });

    const workerCount = new Set(records.map((record) => record.workerId)).size;
    const totalContractedSeconds = records.reduce(
      (sum, record) => sum + toNum(record.ctSeconds) * toNum(record.quantity),
      0
    );

    const createdWorkLog = await api(`/work-logs${buildQuery({ orgId: manufacturer.id })}`, {
      method: "POST",
      userEmail: ACTOR_OPERATOR_EMAIL,
      body: {
        workDate: toDateKey(draft.workDate),
        factoryId: factory.id,
        factoryName: factory.name,
        factoryWagePerSecond: factory.wagePerSecond,
        ctBasis: "CT",
        workerCount,
        itemCount: records.length,
        totalContractedSeconds,
        records,
        note: `${createdOrder.orderNumber} 샘플 작업기록 Day ${draft.dayIndex + 1}`,
      },
    });
    createdWorkLogs.push(createdWorkLog);
  }

  const totalCtDiffRate =
    totalPtSeconds > 0 ? ((insertedTotalCtSeconds - totalPtSeconds) / totalPtSeconds) * 100 : 0;
  const actualLineDays =
    lineWorkerCount > 0 ? insertedTotalCtSeconds / (lineWorkerCount * WORK_SECONDS_PER_DAY) : 0;

  const result = {
    ok: true,
    seed: SEED,
    extraDaysInput: normalizedExtraDays,
    apiBase: API_BASE,
    organization: {
      manufacturerOrgId: manufacturer.id,
      manufacturerOrgCode: manufacturer.code,
      brandOrgId: brand.id,
      brandOrgCode: brand.code,
    },
    factory: {
      id: factory.id,
      name: factory.name,
    },
    line: {
      id: line.id,
      name: line.name,
      assignedWorkerCount: assignedTargetWorkers.length,
    },
    style: {
      id: createdStyle.id,
      name: createdStyle.name,
      ownerOrgId: createdStyle.ownerOrgId,
      processCount: Array.isArray(createdStyle.processes) ? createdStyle.processes.length : 0,
      totalPtSeconds: processRows.reduce((sum, row) => sum + (Number(row.pt) || 0), 0),
    },
    order: {
      id: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      ownerOrgId: createdOrder.ownerOrgId,
      totalQuantity: createdOrder.totalQuantity,
    },
    workLogs: {
      count: createdWorkLogs.length,
      totalProducedQuantity,
      totalPtSeconds,
      totalCtSeconds: insertedTotalCtSeconds,
      totalCtDiffRate: Number(totalCtDiffRate.toFixed(3)),
      plannedLineDays: Number(plannedLineDays.toFixed(3)),
      targetLineDays: Number(targetLineDays.toFixed(3)),
      actualLineDays: Number(actualLineDays.toFixed(3)),
      targetCtFactor: Number(targetCtFactor.toFixed(6)),
      ids: createdWorkLogs.map((log) => log.id),
    },
    workers: assignedTargetWorkers.map((worker) => ({
      id: worker.id,
      email: worker.email,
      name: worker.name,
      currentLineId: worker.currentLineId,
    })),
  };

  console.log(JSON.stringify(result, null, 2));
};

run().catch((error) => {
  const output = {
    ok: false,
    message: error?.message || "unknown error",
    status: error?.status ?? null,
    path: error?.path ?? null,
    details: error?.details ?? null,
  };
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
});
