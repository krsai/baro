import { Prisma } from '@prisma/client';
import { loadManagementPeriod } from '../factories/factoryManagementStart';
import { normalizeEmployeePayTypePolicy, isPolicyWorkday } from '../employees/employeePayTypePolicy';

export const AT_SOURCE_POLICY_VERSION = 'completed-factory-month-actual-attendance-v2';
export type AtFactoryMonth = { factoryId: number; monthKey: string; startDate: string; endDate: string; sourceRevision?: string };
export const atFactoryMonthKey = (factoryId: number, monthKey: string) => `${factoryId}:${monthKey}`;
export const atSourceSignature = (scopes: AtFactoryMonth[]) => JSON.stringify([...scopes].sort((a,b)=>atFactoryMonthKey(a.factoryId,a.monthKey).localeCompare(atFactoryMonthKey(b.factoryId,b.monthKey))));

// Completion belongs to a factory/month, never to an expected employee/day grid.
// A missing employee entry is not evidence of an incomplete import or attendance.
export function completedAtFactoryMonths({ rows, factories, currentMonth, holidays, policy }: {
  rows: any[]; factories: { id: number; startDate: string }[]; currentMonth: string;
  holidays: string[]; policy: ReturnType<typeof normalizeEmployeePayTypePolicy>;
}): AtFactoryMonth[] {
  const holidaySet = new Set(holidays);
  return rows.flatMap(row => {
    const factory = factories.find(item => item.id === Number(row.factoryId));
    const monthKey = String(row.monthKey);
    if (!factory || !/^\d{4}-\d{2}$/.test(monthKey) || monthKey >= currentMonth) return [];
    const end = new Date(Date.UTC(Number(monthKey.slice(0,4)), Number(monthKey.slice(5,7)), 0));
    const endDate = end.toISOString().slice(0,10);
    const startDate = [`${monthKey}-01`,factory.startDate].sort().at(-1)!;
    if (startDate > endDate) return [];
    let lastWorkDate = '';
    for (let day = new Date(`${startDate}T00:00:00Z`); day <= end; day.setUTCDate(day.getUTCDate()+1)) {
      const date = day.toISOString().slice(0,10);
      if (!holidaySet.has(date) && isPolicyWorkday(date, policy)) lastWorkDate = date;
    }
    if (!lastWorkDate || !row.workThrough || !row.attendanceThrough ||
        row.workThrough < lastWorkDate || row.attendanceThrough < lastWorkDate || Number(row.invalidAttendanceCount) > 0) return [];
    return [{ factoryId: factory.id, monthKey, startDate, endDate, sourceRevision: JSON.stringify([
      row.workRecordCount,row.workUpdatedAt,row.recordUpdatedAt,row.attendanceCount,row.attendanceUpdatedAt,
      row.workRevision,row.attendanceRevision,
      policy.workWeekdays,[...holidaySet].filter(date=>date.startsWith(monthKey)).sort(),
    ]) }];
  });
}

export async function loadCompletedAtFactoryMonths(db: any, orgId: number, maxMonthKey: string, now = new Date()): Promise<AtFactoryMonth[]> {
  const currentMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(now);
  const period = await loadManagementPeriod(db, orgId);
  const [rows, holidays, policies] = await Promise.all([
    db.$queryRaw(Prisma.sql`
      WITH work_months AS (
        SELECT wl."factoryId", LEFT(wl."workDate",7) AS "monthKey",
          MAX(COALESCE(wl."coverageEndDate",wl."workDate")) AS "workThrough",
          COUNT(wr.id)::int AS "workRecordCount",MAX(wl."updatedAt") AS "workUpdatedAt",MAX(wr."updatedAt") AS "recordUpdatedAt",
          md5(string_agg(md5(to_jsonb(wl)::text || '|' || to_jsonb(wr)::text),'' ORDER BY wr.id)) AS "workRevision"
        FROM "WorkLog" wl JOIN "Factory" f ON f.id=wl."factoryId" AND f."orgId"=wl."orgId"
          JOIN "WorkRecord" wr ON wr."workLogId"=wl.id AND wr.quantity>0 AND wr."assignmentPlanId" IS NOT NULL
        WHERE wl."orgId"=${orgId} AND wl."recordKind"='EMPLOYEE'
          AND wl."workDate">=${period.startDate} AND LEFT(wl."workDate",7)<=${maxMonthKey}
          AND wl."workDate">=COALESCE(f."managementStartDate",${period.startDate})
        GROUP BY wl."factoryId",LEFT(wl."workDate",7)
      ), attendance_months AS (
        SELECT a."factoryId",LEFT(a."workDate",7) AS "monthKey",MAX(a."workDate") AS "attendanceThrough",
          COUNT(*) FILTER (WHERE a."workedSeconds" IS NULL OR a."workedSeconds"<0)::int AS "invalidAttendanceCount",
          COUNT(*)::int AS "attendanceCount",MAX(a."updatedAt") AS "attendanceUpdatedAt",
          md5(string_agg(md5(to_jsonb(a)::text),'' ORDER BY a.id)) AS "attendanceRevision"
        FROM "AttendanceEntry" a JOIN "Factory" f ON f.id=a."factoryId" AND f."orgId"=a."orgId"
        WHERE a."orgId"=${orgId} AND a."managementExcluded"=false
          AND a."workDate">=${period.startDate} AND LEFT(a."workDate",7)<=${maxMonthKey}
          AND a."workDate">=COALESCE(f."managementStartDate",${period.startDate})
        GROUP BY a."factoryId",LEFT(a."workDate",7)
      ) SELECT w.*, a."attendanceThrough",a."invalidAttendanceCount",a."attendanceCount",a."attendanceUpdatedAt",a."attendanceRevision"
        FROM work_months w LEFT JOIN attendance_months a USING ("factoryId","monthKey")
    `),
    db.organizationHoliday.findMany({ where: { orgId }, select: { holidayDate: true } }),
    db.employeePayTypePolicy.findMany({ where: { orgId, payType: 'OUTPUT' } }),
  ]);
  return completedAtFactoryMonths({ rows, factories: period.factories, currentMonth,
    holidays: holidays.map((row: any) => row.holidayDate), policy: normalizeEmployeePayTypePolicy(policies[0], 'OUTPUT') });
}

export const completedAtBucketSql = (scopes: AtFactoryMonth[], alias = '') => {
  const prefix = alias ? Prisma.raw(`${alias}.`) : Prisma.empty;
  return scopes.length ? Prisma.sql`(${Prisma.join(scopes.map(scope => Prisma.sql`(
    ${prefix}"factoryId"=${scope.factoryId} AND ${prefix}"monthKey"=${scope.monthKey} AND ${prefix}"workDate">=${scope.startDate}
  )`), ' OR ')})` : Prisma.sql`FALSE`;
};

export const completedAtSourceSql = (scopes: AtFactoryMonth[], alias: string, dateColumn = 'workDate') => {
  const factory = Prisma.raw(`${alias}."factoryId"`), date = Prisma.raw(`${alias}."${dateColumn}"`);
  return scopes.length ? Prisma.sql`(${Prisma.join(scopes.map(scope => Prisma.sql`(
    ${factory}=${scope.factoryId} AND LEFT(${date},7)=${scope.monthKey} AND ${date}>=${scope.startDate}
  )`), ' OR ')})` : Prisma.sql`FALSE`;
};
