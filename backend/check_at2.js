const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. 작업 기록에서 참조하는 styleId 확인
  const records = await prisma.workRecord.findMany({
    take: 20,
    select: {
      workerId: true,
      styleId: true,
      styleName: true,
      processCode: true,
      processName: true,
      quantity: true,
      ctSeconds: true,
    }
  });
  console.log('=== WorkRecord 샘플 (20개) ===');
  records.forEach(r => {
    console.log('  styleId:', r.styleId, '| 공정:', r.processCode, '| qty:', r.quantity, '| worker:', r.workerId, '| ctSeconds:', r.ctSeconds);
  });

  // 2. AT 학습 시 실제 계산이 어떻게 되는지 시뮬레이션
  // workLog 하나 선택해서 분석
  const sampleLog = await prisma.workLog.findFirst({
    orderBy: { workDate: 'asc' },
    select: {
      id: true,
      workDate: true,
      factoryId: true,
      workerCount: true,
      workRecords: {
        select: {
          workerId: true,
          processCode: true,
          processName: true,
          quantity: true,
          styleId: true,
        }
      }
    }
  });

  if (sampleLog) {
    const workerIds = [...new Set(sampleLog.workRecords.map(r => r.workerId).filter(Boolean))];
    const totalDaySeconds = workerIds.length > 0 ? workerIds.length * 28800 : sampleLog.workerCount * 28800;

    console.log('\n=== 샘플 WorkLog AT 계산 분석 ===');
    console.log('날짜:', sampleLog.workDate, '| 전체 workerIds:', workerIds.length, '명');
    console.log('totalDaySeconds (8시간 폴백):', totalDaySeconds, '초 =', (totalDaySeconds/3600).toFixed(1), '시간');

    // 공정별 수량
    const byProcess = {};
    sampleLog.workRecords.forEach(r => {
      const key = r.processCode || r.processName;
      if (!byProcess[key]) byProcess[key] = 0;
      byProcess[key] += r.quantity || 0;
    });

    console.log('\n공정별 수량:');
    const totalQty = Object.values(byProcess).reduce((s, q) => s + q, 0);
    Object.entries(byProcess).forEach(([proc, qty]) => {
      const naiveAt = totalDaySeconds / qty;
      console.log('  ', proc, ':', qty, '개 | 단순분할 AT =', naiveAt.toFixed(1), '초/개');
    });
    console.log('총 수량:', totalQty, '개');
    console.log('\n[핵심] 총 가용시간', totalDaySeconds, '초를 수량', totalQty, '개로 나누면 평균:', (totalDaySeconds/totalQty).toFixed(1), '초/개');
  }

  // 3. 현재 AT 학습 월 키 확인 (오늘 날짜 기준)
  const now = new Date();
  const tz = 'Asia/Ho_Chi_Minh';
  const dateStr = now.toLocaleDateString('sv-SE', { timeZone: tz });
  const day = parseInt(dateStr.split('-')[2]);
  const month = parseInt(dateStr.split('-')[1]);
  const year = parseInt(dateStr.split('-')[0]);
  let trainingYear = year;
  let trainingMonth = month;
  if (day >= 5) {
    trainingMonth = month - 1;
    if (trainingMonth < 1) { trainingMonth = 12; trainingYear = year - 1; }
  } else {
    trainingMonth = month - 2;
    if (trainingMonth < 1) { trainingMonth = 12 + trainingMonth; trainingYear = year - 1; }
  }
  const trainingMonthKey = `${trainingYear}-${String(trainingMonth).padStart(2,'0')}`;
  console.log('\n=== AT 학습 월 계산 ===');
  console.log('오늘(서버):', dateStr, '| day:', day, '| 학습 대상 월:', trainingMonthKey);

  // 4. 해당 월의 WorkLog 수 확인
  const logsInTrainingMonth = await prisma.workLog.count({
    where: { workDate: { startsWith: trainingMonthKey } }
  });
  const logsInFeb = await prisma.workLog.count({ where: { workDate: { startsWith: '2026-02' } } });
  const logsInMar = await prisma.workLog.count({ where: { workDate: { startsWith: '2026-03' } } });
  console.log('학습 대상 월(' + trainingMonthKey + ') workLog 수:', logsInTrainingMonth);
  console.log('2026-02 workLog 수:', logsInFeb);
  console.log('2026-03 workLog 수:', logsInMar);

  // 5. Style processes의 atParams.trainedPeriod 확인
  console.log('\n=== Style atParams.trainedPeriod 확인 ===');
  const styles = await prisma.style.findMany({ select: { styleId: true, name: true, processes: true } });
  styles.forEach(style => {
    const procs = Array.isArray(style.processes) ? style.processes : [];
    procs.forEach(p => {
      if (p.atParams) {
        console.log('스타일:', style.styleId, '| 공정:', p.code || p.name, '| trainedPeriod:', p.atParams.trainedPeriod, '| a:', p.atParams.a, '| b:', p.atParams.b);
      }
    });
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
