#!/usr/bin/env node
// generate-assignment-work-records.mjs
// Creates realistic work records for all line-assigned plans in orgId=2

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const ORG_ID = 2;
const FACTORY_ID = 1;
const FACTORY_NAME = "샘플 공장";
const FACTORY_WAGE_PER_SECOND = 12.02;
const OPERATOR_EMAIL = "manufacturer-operator@test.local";
const SHIFT_SECONDS = 8 * 3600; // 8 hours per shift

const createRng = (seed) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
const rng = createRng(42);

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
  if (raw) { try { data = JSON.parse(raw); } catch { data = raw; } }
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.details = data;
    throw err;
  }
  return data;
};

const toDateKey = (date) => date.toISOString().slice(0, 10);

const getWorkDays = (startDateStr, count) => {
  const days = [];
  const cur = new Date(startDateStr + "T12:00:00Z");
  while (days.length < count) {
    const day = cur.getUTCDay();
    if (day !== 0 && day !== 6) days.push(toDateKey(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
};

// Hardcoded plan data extracted from API (all ctStatus=AGREED)
const PLANS = [
  {
    dbId: 47, lineId: 1, styleId: "S-2025SS-P002",
    label: "슬림핏 카라 폴로 셔츠", customer: "테스트 발주자",
    colorId: 293, colorCode: "GRAY-MEL", colorName: "그레이멜란지",
    quantity: 650, startDateKey: "2026-02-28",
    processes: [
      { key: "P01", name: "원단 재단",   ct: 550 },
      { key: "P02", name: "앞판 봉제",   ct: 500 },
      { key: "P03", name: "뒷판 봉제",   ct: 500 },
      { key: "P04", name: "소매 봉제",   ct: 480 },
      { key: "P05", name: "카라 제작",   ct: 550 },
      { key: "P06", name: "카라 부착",   ct: 490 },
      { key: "P07", name: "단추 가공",   ct: 480 },
      { key: "P08", name: "밑단 마감",   ct: 450 },
      { key: "P09", name: "검사 및 포장", ct: 450 },
    ],
  },
  {
    dbId: 49, lineId: 1, styleId: "S-2025FW-J003",
    label: "오버핏 데님 재킷", customer: "테스트 발주자",
    colorId: 295, colorCode: "MID-BLUE", colorName: "미드블루",
    quantity: 470, startDateKey: "2026-03-05",
    processes: [
      { key: "P01", name: "원단 재단",          ct: 700 },
      { key: "P02", name: "심지 부착",          ct: 650 },
      { key: "P03", name: "앞판 봉제",          ct: 700 },
      { key: "P04", name: "뒷판 봉제",          ct: 600 },
      { key: "P05", name: "소매 봉제",          ct: 600 },
      { key: "P06", name: "칼라 부착",          ct: 600 },
      { key: "P07", name: "지퍼/단추 가공",     ct: 600 },
      { key: "P08", name: "안감 부착",          ct: 550 },
      { key: "P09", name: "다림질 및 형태 정리", ct: 550 },
      { key: "P10", name: "검사 및 포장",       ct: 500 },
    ],
  },
  {
    dbId: 46, lineId: 2, styleId: "S-2025SS-P002",
    label: "슬림핏 카라 폴로 셔츠", customer: "테스트 발주자",
    colorId: 293, colorCode: "GRAY-MEL", colorName: "그레이멜란지",
    quantity: 350, startDateKey: "2026-02-28",
    processes: [
      { key: "P01", name: "원단 재단",   ct: 550 },
      { key: "P02", name: "앞판 봉제",   ct: 500 },
      { key: "P03", name: "뒷판 봉제",   ct: 500 },
      { key: "P04", name: "소매 봉제",   ct: 480 },
      { key: "P05", name: "카라 제작",   ct: 500 },
      { key: "P06", name: "카라 부착",   ct: 490 },
      { key: "P07", name: "단추 가공",   ct: 480 },
      { key: "P08", name: "밑단 마감",   ct: 450 },
      { key: "P09", name: "검사 및 포장", ct: 450 },
    ],
  },
  {
    dbId: 48, lineId: 2, styleId: "S-2025SS-T001",
    label: "레귤러핏 라운드넥 티셔츠", customer: "테스트 발주자",
    colorId: 290, colorCode: "WHITE", colorName: "화이트",
    quantity: 400, startDateKey: "2026-03-03",
    processes: [
      { key: "P01", name: "원단 재단",   ct: 500 },
      { key: "P02", name: "앞판 봉제",   ct: 460 },
      { key: "P03", name: "뒷판 봉제",   ct: 440 },
      { key: "P04", name: "소매 봉제",   ct: 480 },
      { key: "P05", name: "넥밴드 부착", ct: 420 },
      { key: "P06", name: "옆솔기 봉제", ct: 400 },
      { key: "P07", name: "밑단 마감",   ct: 400 },
      { key: "P08", name: "검사 및 포장", ct: 400 },
    ],
  },
  {
    dbId: 50, lineId: 2, styleId: "S-2025FW-J003",
    label: "오버핏 데님 재킷", customer: "테스트 발주자",
    colorId: 296, colorCode: "INDIGO", colorName: "인디고",
    quantity: 360, startDateKey: "2026-03-06",
    processes: [
      { key: "P01", name: "원단 재단",          ct: 700 },
      { key: "P02", name: "심지 부착",          ct: 650 },
      { key: "P03", name: "앞판 봉제",          ct: 650 },
      { key: "P04", name: "뒷판 봉제",          ct: 600 },
      { key: "P05", name: "소매 봉제",          ct: 600 },
      { key: "P06", name: "칼라 부착",          ct: 600 },
      { key: "P07", name: "지퍼/단추 가공",     ct: 600 },
      { key: "P08", name: "안감 부착",          ct: 550 },
      { key: "P09", name: "다림질 및 형태 정리", ct: 550 },
      { key: "P10", name: "검사 및 포장",       ct: 500 },
    ],
  },
  {
    dbId: 51, lineId: 2, styleId: "S-2025SS-T001",
    label: "레귤러핏 라운드넥 티셔츠", customer: "테스트 발주자",
    colorId: 292, colorCode: "NAVY", colorName: "네이비",
    quantity: 400, startDateKey: "2026-03-10",
    processes: [
      { key: "P01", name: "원단 재단",   ct: 500 },
      { key: "P02", name: "앞판 봉제",   ct: 460 },
      { key: "P03", name: "뒷판 봉제",   ct: 440 },
      { key: "P04", name: "소매 봉제",   ct: 480 },
      { key: "P05", name: "넥밴드 부착", ct: 420 },
      { key: "P06", name: "옆솔기 봉제", ct: 400 },
      { key: "P07", name: "밑단 마감",   ct: 400 },
      { key: "P08", name: "검사 및 포장", ct: 400 },
    ],
  },
];

const run = async () => {
  // Fetch workers for each line
  const lineWorkers = {};
  for (const lineId of [1, 2]) {
    const workers = await api(`/line-workers?orgId=${ORG_ID}&lineId=${lineId}`);
    lineWorkers[lineId] = Array.isArray(workers) ? workers : [];
    console.log(`Line ${lineId}: ${lineWorkers[lineId].length} workers`);
  }

  for (const plan of PLANS) {
    const workers = lineWorkers[plan.lineId] ?? [];
    if (!workers.length) {
      console.log(`Plan ${plan.dbId}: no workers on line ${plan.lineId}, skipping`);
      continue;
    }

    const ctPerPiece = plan.processes.reduce((sum, p) => sum + p.ct, 0);
    const dailyCapacity = (workers.length * SHIFT_SECONDS) / ctPerPiece;

    // ±5 piece quantity variance
    const qtyVariance = Math.round(rng() * 10) - 5;
    const targetQty = plan.quantity + qtyVariance;

    // Nominal days based on capacity, then ±3 day variance
    const nominalDays = Math.ceil(targetQty / dailyCapacity);
    const dayVariance = Math.round(rng() * 6) - 3;
    const actualDays = Math.max(1, nominalDays + dayVariance);

    const workDays = getWorkDays(plan.startDateKey, actualDays);

    console.log(`\nPlan ${plan.dbId} (${plan.label} / ${plan.colorName} / Line${plan.lineId}):`);
    console.log(`  qty=${plan.quantity}+${qtyVariance}=${targetQty}, ctPerPiece=${ctPerPiece}s, dailyCap=${dailyCapacity.toFixed(1)}, days=${actualDays} [${workDays[0]} ~ ${workDays[workDays.length - 1]}]`);

    // Distribute target qty across work days with ±20% daily variation
    const dailyQtys = [];
    let remaining = targetQty;
    for (let i = 0; i < workDays.length; i++) {
      if (i === workDays.length - 1) {
        dailyQtys.push(Math.max(1, remaining));
      } else {
        const expected = remaining / (workDays.length - i);
        const variation = rng() * 0.4 + 0.8;
        const maxToday = remaining - (workDays.length - i - 1);
        const dayQty = Math.max(1, Math.min(maxToday, Math.round(expected * variation)));
        dailyQtys.push(dayQty);
        remaining -= dayQty;
      }
    }

    let produced = 0;
    for (let dayIdx = 0; dayIdx < workDays.length; dayIdx++) {
      const workDate = workDays[dayIdx];
      const dayQty = dailyQtys[dayIdx];

      // Distribute qty evenly across processes, remainder on last
      const qtyPerProcess = Math.floor(dayQty / plan.processes.length);
      let qtyLeft = dayQty;

      const records = plan.processes.map((proc, pIdx) => {
        const qty = pIdx === plan.processes.length - 1 ? qtyLeft : qtyPerProcess;
        qtyLeft -= qty;
        // Rotate workers across processes for maximum participation
        const worker = workers[pIdx % workers.length];
        // ±20% CT variation around agreed CT
        const ctSeconds = Math.max(1, Math.round(proc.ct * (rng() * 0.4 + 0.8)));
        return {
          workerId: worker.id,
          workerName: worker.name,
          customerName: plan.customer,
          styleId: plan.styleId,
          styleName: plan.label,
          processCode: proc.key,
          processName: proc.name,
          colorId: plan.colorId,
          colorCode: plan.colorCode,
          colorName: plan.colorName,
          ctSeconds,
          quantity: qty,
          assignmentPlanId: plan.dbId,
        };
      });

      const workerCount = new Set(records.map((r) => r.workerId)).size;
      const totalContractedSeconds = records.reduce((s, r) => s + r.ctSeconds * r.quantity, 0);

      const body = {
        workDate,
        factoryId: FACTORY_ID,
        factoryName: FACTORY_NAME,
        factoryWagePerSecond: FACTORY_WAGE_PER_SECOND,
        lineId: plan.lineId,
        ctBasis: "CT",
        workerCount,
        itemCount: records.length,
        totalContractedSeconds,
        records,
        note: `배정 계획 ${plan.dbId} Day ${dayIdx + 1}/${workDays.length}`,
      };

      try {
        await api(`/work-logs?orgId=${ORG_ID}`, { method: "POST", body });
        produced += dayQty;
        console.log(`  [${workDate}] OK: ${dayQty}pcs (누적: ${produced}/${targetQty})`);
      } catch (err) {
        if (err.status === 409) {
          console.log(`  [${workDate}] SKIP: 이미 존재 (${err.message})`);
          produced += dayQty;
        } else if (
          err.status === 400 &&
          (err.message.toLowerCase().includes("ct") ||
            JSON.stringify(err.details ?? "").toLowerCase().includes("agreed"))
        ) {
          // Retry without assignmentPlanId
          console.log(`  [${workDate}] CT 연결 오류, assignmentPlanId 없이 재시도...`);
          const retryRecords = records.map(({ assignmentPlanId: _omit, ...rest }) => rest);
          body.records = retryRecords;
          try {
            await api(`/work-logs?orgId=${ORG_ID}`, { method: "POST", body });
            produced += dayQty;
            console.log(`  [${workDate}] OK (CT 링크 없음): ${dayQty}pcs`);
          } catch (err2) {
            console.error(`  [${workDate}] FAIL: ${err2.message}`, JSON.stringify(err2.details ?? "").slice(0, 200));
          }
        } else {
          console.error(`  [${workDate}] FAIL: ${err.message}`, JSON.stringify(err.details ?? "").slice(0, 300));
        }
      }
    }

    console.log(`  완료: ${produced}/${targetQty}pcs (${actualDays}일)`);
  }

  console.log("\n모든 계획 처리 완료!");
};

run().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
