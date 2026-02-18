#!/usr/bin/env node

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const MANUFACTURER_CODE = "TSMF";
const BRAND_CODE = "TSBR";
const ACTOR_EMAIL = "manufacturer-operator@test.local";
const SEED = Number(process.env.SEED) || Date.now();

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
    throw error;
  }
  return data;
};

const toDateKey = (date) => date.toISOString().slice(0, 10);
const toNum = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalize = (value) => String(value ?? "").trim();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const createRng = (seed) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
const randomInt = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
const randomFloat = (rng, min, max) => rng() * (max - min) + min;

const run = async () => {
  const organizations = await api("/organizations");
  const manufacturer = organizations.find((item) => item?.code === MANUFACTURER_CODE);
  const brand = organizations.find((item) => item?.code === BRAND_CODE);
  if (!manufacturer || !brand) {
    throw new Error("required organizations not found");
  }

  const factories = await api(`/factories${buildQuery({ orgId: manufacturer.id })}`, {
    userEmail: ACTOR_EMAIL,
  });
  const factory = (Array.isArray(factories) ? factories : [])[0];
  if (!factory?.id) throw new Error("factory not found");

  const styles = await api(
    `/styles${buildQuery({ orgId: manufacturer.id, ownerOrgId: brand.id, compact: 1 })}`,
    { userEmail: ACTOR_EMAIL }
  );
  const sampleStyles = (Array.isArray(styles) ? styles : [])
    .filter((style) => normalize(style?.id).startsWith("SAMPLE-"))
    .sort((a, b) => normalize(b?.id).localeCompare(normalize(a?.id)));
  const targetStyle = sampleStyles[0];
  if (!targetStyle?.id) {
    throw new Error("sample style not found. run generate-real-flow-sample first");
  }

  const before = await api(
    `/styles/${encodeURIComponent(targetStyle.id)}${buildQuery({
      orgId: manufacturer.id,
      ownerOrgId: brand.id,
    })}`,
    { userEmail: ACTOR_EMAIL }
  );

  const workers = await api(
    `/line-workers${buildQuery({ orgId: manufacturer.id, factoryId: factory.id })}`,
    { userEmail: ACTOR_EMAIL }
  );
  const activeWorkers = (Array.isArray(workers) ? workers : []).filter(
    (worker) => Number(worker?.currentLineId) > 0
  );
  if (activeWorkers.length === 0) {
    throw new Error("no assigned workers found");
  }

  const baseProcesses = Array.isArray(before?.processes) ? before.processes.slice(0, 10) : [];
  if (baseProcesses.length < 10) {
    throw new Error("target style does not contain 10 processes");
  }

  const rng = createRng(SEED);
  const targetTotalFactor =
    rng() < 0.5 ? randomFloat(rng, 0.94, 0.985) : randomFloat(rng, 1.015, 1.06);

  const draftRows = baseProcesses.map((process, index) => {
    const pt = Math.max(1, toNum(process?.pt, 1));
    const quantity = randomInt(rng, 90, 150);
    const rawFactor = randomFloat(rng, 0.65, 1.45);
    const worker = activeWorkers[index % activeWorkers.length];
    return {
      pt,
      quantity,
      rawCt: pt * rawFactor,
      workerId: worker.id,
      workerName: worker.name,
      processCode: process.code,
      processName: process.name,
    };
  });

  const totalPtSeconds = draftRows.reduce((sum, row) => sum + row.pt * row.quantity, 0);
  const totalRawCtSeconds = draftRows.reduce((sum, row) => sum + row.rawCt * row.quantity, 0);
  const scale = totalRawCtSeconds > 0 ? (totalPtSeconds * targetTotalFactor) / totalRawCtSeconds : 1;

  const records = draftRows.map((row, index) => {
    const minGap = Math.max(15, Math.round(row.pt * 0.08));
    let ct = Math.max(1, Math.round(row.rawCt * scale));
    if (Math.abs(ct - row.pt) < minGap) {
      ct += index % 2 === 0 ? minGap : -minGap;
      ct = Math.max(1, ct);
    }
    ct = clamp(ct, Math.max(1, Math.round(row.pt * 0.5)), Math.round(row.pt * 1.6));

    return {
      workerId: row.workerId,
      workerName: row.workerName,
      customerName: before.customer,
      styleId: before.id,
      styleName: before.name,
      processCode: row.processCode,
      processName: row.processName,
      colorId: null,
      colorCode: "BLK",
      colorName: "Black",
      ctSeconds: ct,
      quantity: row.quantity,
    };
  });

  const totalCtSeconds = records.reduce(
    (sum, row) => sum + toNum(row.ctSeconds) * toNum(row.quantity),
    0
  );
  const totalDiffRate = totalPtSeconds > 0 ? (totalCtSeconds - totalPtSeconds) / totalPtSeconds : 0;

  const totalContractedSeconds = totalCtSeconds;
  const workerCount = new Set(records.map((row) => row.workerId)).size;

  const createdWorkLog = await api(`/work-logs${buildQuery({ orgId: manufacturer.id })}`, {
    method: "POST",
    userEmail: ACTOR_EMAIL,
    body: {
      workDate: toDateKey(new Date()),
      factoryId: factory.id,
      factoryName: factory.name,
      factoryWagePerSecond: factory.wagePerSecond,
      ctBasis: "CT",
      workerCount,
      itemCount: records.length,
      totalContractedSeconds,
      records,
      note: `AT random variance check for ${before.id} (seed:${SEED})`,
    },
  });

  const after = await api(
    `/styles/${encodeURIComponent(targetStyle.id)}${buildQuery({
      orgId: manufacturer.id,
      ownerOrgId: brand.id,
    })}`,
    { userEmail: ACTOR_EMAIL }
  );

  const beforeMap = new Map(
    (Array.isArray(before?.processes) ? before.processes : []).map((process) => [
      normalize(process?.code),
      process,
    ])
  );
  const insertedByCode = new Map(records.map((row) => [normalize(row.processCode), row]));
  const afterRows = (Array.isArray(after?.processes) ? after.processes : []).map((process) => {
    const code = normalize(process?.code);
    const prev = beforeMap.get(code);
    const inserted = insertedByCode.get(code);
    return {
      code,
      quantityInserted: toNum(inserted?.quantity),
      pt: toNum(process?.pt),
      ctInserted: toNum(inserted?.ctSeconds),
      atBefore: toNum(prev?.at, 0),
      atAfter: toNum(process?.at, 0),
      changed: toNum(prev?.at, 0) !== toNum(process?.at, 0),
    };
  });

  const changedCount = afterRows.filter((row) => row.changed).length;

  const result = {
    ok: true,
    seed: SEED,
    styleId: before.id,
    ownerOrgId: before.ownerOrgId,
    createdWorkLogId: createdWorkLog.id,
    recordCount: records.length,
    insertedTotals: {
      totalPtSeconds,
      totalCtSeconds,
      diffSeconds: totalCtSeconds - totalPtSeconds,
      diffRate: Number((totalDiffRate * 100).toFixed(3)),
    },
    changedProcessCount: changedCount,
    rows: afterRows,
  };

  console.log(JSON.stringify(result, null, 2));
};

run().catch((error) => {
  const output = {
    ok: false,
    message: error?.message || "unknown error",
    status: error?.status ?? null,
    details: error?.details ?? null,
  };
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
});
