#!/usr/bin/env node
// generate-assignment-work-records.mjs
// 라인별 하루 1개 작업 기록, 작업자 전원 참여

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const ORG_ID = 2;
const FACTORY_ID = 1;
const FACTORY_NAME = "샘플 공장";
const FACTORY_WAGE_PER_SECOND = 12.02;
const OPERATOR_EMAIL = "manufacturer-operator@test.local";
const SHIFT_SECONDS = 8 * 3600;

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

// CT 합의 스냅샷 기반 공정 데이터 (agreedPerPieceSeconds 사용)
const PLANS = [
  {
    dbId: 47, lineId: 1, styleId: "S-2025SS-P002",
    label: "슬림핏 카라 폴로 셔츠", customer: "테스트 발주자",
    colorId: 293, colorCode: "GRAY-MEL", colorName: "그레이멜란지",
    quantity: 650, startDateKey: "2026-02-28",
    processes: [
      { key: "P01", name: "원단 재단",    ct: 550 },
      { key: "P02", name: "앞판 봉제",    ct: 500 },
      { key: "P03", name: "뒷판 봉제",    ct: 500 },
      { key: "P04", name: "소매 봉제",    ct: 480 },
      { key: "P05", name: "카라 제작",    ct: 550 },
      { key: "P06", name: "카라 부착",    ct: 490 },
      { key: "P07", name: "단추 가공",    ct: 480 },
      { key: "P08", name: "밑단 마감",    ct: 450 },
      { key: "P09", name: "검사 및 포장", ct: 450 },
    ],
  },
  {
    dbId: 49, lineId: 1, styleId: "S-2025FW-J003",
    label: "오버핏 데님 재킷", customer: "테스트 발주자",
    colorId: 295, colorCode: "MID-BLUE", colorName: "미드블루",
    quantity: 470, startDateKey: "2026-03-05",
    processes: [
      { key: "P01", name: "원단 재단",           ct: 700 },
      { key: "P02", name: "심지 부착",           ct: 650 },
      { key: "P03", name: "앞판 봉제",           ct: 700 },
      { key: "P04", name: "뒷판 봉제",           ct: 600 },
      { key: "P05", name: "소매 봉제",           ct: 600 },
      { key: "P06", name: "칼라 부착",           ct: 600 },
      { key: "P07", name: "지퍼/단추 가공",      ct: 600 },
      { key: "P08", name: "안감 부착",           ct: 550 },
      { key: "P09", name: "다림질 및 형태 정리", ct: 550 },
      { key: "P10", name: "검사 및 포장",        ct: 500 },
    ],
  },
  {
    dbId: 46, lineId: 2, styleId: "S-2025SS-P002",
    label: "슬림핏 카라 폴로 셔츠", customer: "테스트 발주자",
    colorId: 293, colorCode: "GRAY-MEL", colorName: "그레이멜란지",
    quantity: 350, startDateKey: "2026-02-28",
    processes: [
      { key: "P01", name: "원단 재단",    ct: 550 },
      { key: "P02", name: "앞판 봉제",    ct: 500 },
      { key: "P03", name: "뒷판 봉제",    ct: 500 },
      { key: "P04", name: "소매 봉제",    ct: 480 },
      { key: "P05", name: "카라 제작",    ct: 500 },
      { key: "P06", name: "카라 부착",    ct: 490 },
      { key: "P07", name: "단추 가공",    ct: 480 },
      { key: "P08", name: "밑단 마감",    ct: 450 },
      { key: "P09", name: "검사 및 포장", ct: 450 },
    ],
  },
  {
    dbId: 48, lineId: 2, styleId: "S-2025SS-T001",
    label: "레귤러핏 라운드넥 티셔츠", customer: "테스트 발주자",
    colorId: 290, colorCode: "WHITE", colorName: "화이트",
    quantity: 400, startDateKey: "2026-03-03",
    processes: [
      { key: "P01", name: "원단 재단",    ct: 500 },
      { key: "P02", name: "앞판 봉제",    ct: 460 },
      { key: "P03", name: "뒷판 봉제",    ct: 440 },
      { key: "P04", name: "소매 봉제",    ct: 480 },
      { key: "P05", name: "넥밴드 부착",  ct: 420 },
      { key: "P06", name: "옆솔기 봉제",  ct: 400 },
      { key: "P07", name: "밑단 마감",    ct: 400 },
      { key: "P08", name: "검사 및 포장", ct: 400 },
    ],
  },
  {
    dbId: 50, lineId: 2, styleId: "S-2025FW-J003",
    label: "오버핏 데님 재킷", customer: "테스트 발주자",
    colorId: 296, colorCode: "INDIGO", colorName: "인디고",
    quantity: 360, startDateKey: "2026-03-06",
    processes: [
      { key: "P01", name: "원단 재단",           ct: 700 },
      { key: "P02", name: "심지 부착",           ct: 650 },
      { key: "P03", name: "앞판 봉제",           ct: 650 },
      { key: "P04", name: "뒷판 봉제",           ct: 600 },
      { key: "P05", name: "소매 봉제",           ct: 600 },
      { key: "P06", name: "칼라 부착",           ct: 600 },
      { key: "P07", name: "지퍼/단추 가공",      ct: 600 },
      { key: "P08", name: "안감 부착",           ct: 550 },
      { key: "P09", name: "다림질 및 형태 정리", ct: 550 },
      { key: "P10", name: "검사 및 포장",        ct: 500 },
    ],
  },
  {
    dbId: 51, lineId: 2, styleId: "S-2025SS-T001",
    label: "레귤러핏 라운드넥 티셔츠", customer: "테스트 발주자",
    colorId: 292, colorCode: "NAVY", colorName: "네이비",
    quantity: 400, startDateKey: "2026-03-10",
    processes: [
      { key: "P01", name: "원단 재단",    ct: 500 },
      { key: "P02", name: "앞판 봉제",    ct: 460 },
      { key: "P03", name: "뒷판 봉제",    ct: 440 },
      { key: "P04", name: "소매 봉제",    ct: 480 },
      { key: "P05", name: "넥밴드 부착",  ct: 420 },
      { key: "P06", name: "옆솔기 봉제",  ct: 400 },
      { key: "P07", name: "밑단 마감",    ct: 400 },
      { key: "P08", name: "검사 및 포장", ct: 400 },
    ],
  },
];

const run = async () => {
  // 라인별 작업자 조회
  const lineWorkers = {};
  for (const lineId of [1, 2]) {
    const workers = await api(`/line-workers?orgId=${ORG_ID}&lineId=${lineId}`);
    lineWorkers[lineId] = Array.isArray(workers) ? workers : [];
    console.log(`라인 ${lineId}: ${lineWorkers[lineId].length}명`);
  }

  // STEP 1: 각 계획의 작업일 + 일별 수량 계산
  const planSchedules = [];
  for (const plan of PLANS) {
    const workers = lineWorkers[plan.lineId] ?? [];
    const ctPerPiece = plan.processes.reduce((s, p) => s + p.ct, 0);
    const dailyCapacity = (workers.length * SHIFT_SECONDS) / ctPerPiece;

    const qtyVariance = Math.round(rng() * 10) - 5;
    const targetQty = plan.quantity + qtyVariance;
    // 하루 작업량을 dailyCapacity 기준으로 고정 → 작업자 평균 CT ≈ 8h
    const nominalDays = Math.ceil(targetQty / dailyCapacity);
    const workDays = getWorkDays(plan.startDateKey, nominalDays);

    // 일별 수량: dailyCapacity 기준 ±10% 변동, 마지막 날은 잔량 처리
    const dailyQtys = [];
    let remaining = targetQty;
    for (let i = 0; i < workDays.length; i++) {
      if (i === workDays.length - 1) {
        dailyQtys.push(Math.max(1, remaining));
      } else {
        const variation = rng() * 0.2 + 0.9; // 90~110%
        const maxToday = remaining - (workDays.length - i - 1);
        const dayQty = Math.max(1, Math.min(maxToday, Math.round(dailyCapacity * variation)));
        dailyQtys.push(dayQty);
        remaining -= dayQty;
      }
    }

    console.log(`계획 ${plan.dbId} (${plan.label}/${plan.colorName}/Line${plan.lineId}): qty=${plan.quantity}+${qtyVariance}=${targetQty}, ${nominalDays}일 [${workDays[0]}~${workDays[workDays.length - 1]}]`);
    planSchedules.push({ plan, workDays, dailyQtys, targetQty });
  }

  // STEP 2: (lineId, date) → [{plan, qty}] 스케줄 맵 구축
  const scheduleMap = new Map();
  for (const { plan, workDays, dailyQtys } of planSchedules) {
    for (let i = 0; i < workDays.length; i++) {
      const key = `${plan.lineId}_${workDays[i]}`;
      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, { lineId: plan.lineId, date: workDays[i], items: [] });
      }
      scheduleMap.get(key).items.push({ plan, qty: dailyQtys[i] });
    }
  }

  // STEP 3: (lineId, date)별로 작업 기록 1건 생성
  const sortedEntries = [...scheduleMap.values()].sort(
    (a, b) => a.lineId - b.lineId || a.date.localeCompare(b.date)
  );
  console.log(`\n총 작업 기록 예정: ${sortedEntries.length}건`);

  for (const entry of sortedEntries) {
    const workers = lineWorkers[entry.lineId] ?? [];
    const planIds = entry.items.map((i) => i.plan.dbId);

    // 해당 날 활성 계획들의 공정을 flat 리스트로
    // 의류 라인에서 모든 공정은 동일한 수량(라인 일일 생산량)을 처리함
    const allProcessItems = [];
    for (const { plan, qty } of entry.items) {
      for (const proc of plan.processes) {
        allProcessItems.push({ plan, proc, qty }); // 각 공정이 전체 qty를 처리
      }
    }

    // 작업자를 공정 항목에 round-robin 배분 → 모든 작업자 참여
    // workers[i] → 공정 항목 (i % allProcessItems.length)
    const numItems = allProcessItems.length;
    const workersByItem = Array.from({ length: numItems }, () => []);
    for (let i = 0; i < workers.length; i++) {
      workersByItem[i % numItems].push(workers[i]);
    }

    // 레코드 생성 (공정당 담당 작업자가 여럿이면 수량 분할)
    const records = [];
    for (let pi = 0; pi < numItems; pi++) {
      const { plan, proc, qty } = allProcessItems[pi];
      const assignedWorkers = workersByItem[pi];
      if (assignedWorkers.length === 0) continue;

      const qtyPerWorker = Math.floor(qty / assignedWorkers.length);
      let wQtyLeft = qty;
      for (let wi = 0; wi < assignedWorkers.length; wi++) {
        const worker = assignedWorkers[wi];
        const workerQty = wi === assignedWorkers.length - 1 ? wQtyLeft : qtyPerWorker;
        wQtyLeft -= workerQty;
        const ctSeconds = Math.max(1, Math.round(proc.ct * (rng() * 0.4 + 0.8)));
        records.push({
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
          quantity: workerQty,
          assignmentPlanId: plan.dbId,
        });
      }
    }

    const workerCount = new Set(records.map((r) => r.workerId)).size;
    const totalContractedSeconds = records.reduce((s, r) => s + r.ctSeconds * r.quantity, 0);
    const totalQty = entry.items.reduce((s, i) => s + i.qty, 0);
    const avgCtHours = (totalContractedSeconds / Math.max(1, workerCount) / 3600).toFixed(1);

    const body = {
      workDate: entry.date,
      factoryId: FACTORY_ID,
      factoryName: FACTORY_NAME,
      factoryWagePerSecond: FACTORY_WAGE_PER_SECOND,
      lineId: entry.lineId,
      ctBasis: "CT",
      workerCount,
      itemCount: records.length,
      totalContractedSeconds,
      records,
      note: "",
    };

    try {
      await api(`/work-logs?orgId=${ORG_ID}`, { method: "POST", body });
      const overlap = entry.items.length > 1 ? ` (${entry.items.length}계획 병행)` : "";
      console.log(`  [Line${entry.lineId} ${entry.date}] OK: ${totalQty}pcs, ${workerCount}명, 평균CT=${avgCtHours}h${overlap}`);
    } catch (err) {
      if (err.status === 409) {
        console.log(`  [Line${entry.lineId} ${entry.date}] SKIP: 이미 존재`);
      } else if (
        err.status === 400 &&
        (err.message.toLowerCase().includes("ct") ||
          JSON.stringify(err.details ?? "").toLowerCase().includes("agreed"))
      ) {
        console.log(`  [Line${entry.lineId} ${entry.date}] CT 오류, assignmentPlanId 제거 후 재시도...`);
        body.records = records.map(({ assignmentPlanId: _omit, ...rest }) => rest);
        try {
          await api(`/work-logs?orgId=${ORG_ID}`, { method: "POST", body });
          console.log(`  [Line${entry.lineId} ${entry.date}] OK (CT 링크 없음): ${totalQty}pcs`);
        } catch (err2) {
          console.error(`  [Line${entry.lineId} ${entry.date}] FAIL: ${err2.message}`);
        }
      } else {
        console.error(
          `  [Line${entry.lineId} ${entry.date}] FAIL: ${err.message}`,
          JSON.stringify(err.details ?? "").slice(0, 300)
        );
      }
    }
  }

  console.log("\n완료!");
};

run().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
