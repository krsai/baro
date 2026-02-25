const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. WorkLog + WorkRecord 조회
  const logs = await prisma.workLog.findMany({
    take: 40,
    orderBy: [{ workDate: 'asc' }, { id: 'asc' }],
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

  console.log('=== WorkLog 요약 (총', logs.length, '개) ===');
  logs.forEach(log => {
    const workerIds = [...new Set(log.workRecords.map(r => r.workerId).filter(Boolean))];
    const byProcess = {};
    log.workRecords.forEach(r => {
      const key = r.processCode || r.processName || '?';
      if (!byProcess[key]) byProcess[key] = { qty: 0, workers: new Set() };
      byProcess[key].qty += (r.quantity || 0);
      if (r.workerId) byProcess[key].workers.add(r.workerId);
    });
    console.log('\n날짜:', log.workDate, '| 고유작업자:', workerIds.length, '명 | workerCount:', log.workerCount, '| factoryId:', log.factoryId);
    Object.entries(byProcess).forEach(([proc, data]) => {
      console.log('  공정:', proc, '| 총수량:', data.qty, '| 참여작업자:', data.workers.size, '명');
    });
  });

  // 2. Style AT vs PT 비교
  console.log('\n\n=== Style PT vs AT 비교 ===');
  const styles = await prisma.style.findMany({
    select: { styleId: true, name: true, processes: true }
  });
  styles.forEach(style => {
    const procs = Array.isArray(style.processes) ? style.processes : [];
    if (procs.length === 0) return;
    console.log('\n스타일:', style.name, '(' + style.styleId + ')');
    procs.forEach(p => {
      const pt = p.pt;
      const at = p.at;
      const atParams = p.atParams;
      const q = p.timeRefQuantity || 1000;
      if (pt == null && at == null) return;
      const ptQ = pt != null ? (pt * q).toFixed(0) + '초' : 'null';
      const atQ = at != null ? (at * q).toFixed(0) + '초' : '수집중';
      const ratio = (pt != null && at != null && pt > 0) ? (at / pt).toFixed(2) + 'x' : '-';
      console.log('  공정:', p.name || p.code, '| PT(per piece):', pt != null ? pt.toFixed(2) + '초' : 'null',
        '| AT(per piece):', at != null ? at.toFixed(2) + '초' : '수집중',
        '| 비율:', ratio,
        atParams ? ('| a=' + atParams.a + ' b=' + atParams.b) : '');
    });
  });

  // 3. AttendanceEntry 존재 여부
  const attendCount = await prisma.attendanceEntry.count();
  console.log('\n\nAttendanceEntry 레코드 수:', attendCount);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
