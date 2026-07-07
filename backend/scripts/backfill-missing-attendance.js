#!/usr/bin/env node
'use strict';

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
process.env.DIRECT_URL ||= process.env.DATABASE_URL || '';
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= 'binary';

if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
  throw new Error('DATABASE_URL or DIRECT_URL is required.');
}

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_CLOCK_IN = '08:00';
const DEFAULT_CLOCK_OUT = '16:00';
const DEFAULT_WORKED_SECONDS = 8 * 60 * 60;
const DEFAULT_NOTE =
  '[AUTO_BACKFILL] Filled missing attendance with default 8-hour shift.';

const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(argv) {
  const options = {
    months: [],
    orgId: null,
    factoryId: null,
    factoryName: '',
    workerNames: [],
    dateFrom: '',
    dateTo: '',
    holidays: [],
    apply: false,
  };

  argv.forEach((arg) => {
    if (arg === '--apply') {
      options.apply = true;
      return;
    }
    if (arg.startsWith('--months=')) {
      options.months = String(arg.slice('--months='.length))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      return;
    }
    if (arg.startsWith('--org-id=')) {
      const parsed = Number.parseInt(arg.slice('--org-id='.length), 10);
      options.orgId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      return;
    }
    if (arg.startsWith('--factory-id=')) {
      const parsed = Number.parseInt(arg.slice('--factory-id='.length), 10);
      options.factoryId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      return;
    }
    if (arg.startsWith('--factory-name=')) {
      options.factoryName = String(arg.slice('--factory-name='.length)).trim();
      return;
    }
    if (arg.startsWith('--worker-names=')) {
      options.workerNames = String(arg.slice('--worker-names='.length))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      return;
    }
    if (arg.startsWith('--date-from=')) {
      options.dateFrom = normalizeDateKey(arg.slice('--date-from='.length));
      return;
    }
    if (arg.startsWith('--date-to=')) {
      options.dateTo = normalizeDateKey(arg.slice('--date-to='.length));
      return;
    }
    if (arg.startsWith('--holidays=')) {
      options.holidays = String(arg.slice('--holidays='.length))
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }
  });

  return options;
}

function normalizeMonthKey(value) {
  const text = String(value || '').trim();
  return MONTH_KEY_PATTERN.test(text) ? text : '';
}

function normalizeDateKey(value) {
  const text = String(value || '').trim().slice(0, 10);
  return DATE_KEY_PATTERN.test(text) ? text : '';
}

function normalizeNameKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function resolveEmploymentDateKey(value) {
  if (!value) return '';
  const direct = normalizeDateKey(value);
  if (direct) return direct;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function monthRange(monthKey) {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return null;
  const [year, month] = normalized.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    monthKey: normalized,
    dateFrom: formatDateKey(start),
    dateTo: formatDateKey(end),
  };
}

function incrementDate(date, days = 1) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isBackfillEligibleEmployee(employee) {
  const membershipRole = String(employee?.orgRole || '')
    .trim()
    .toUpperCase();
  const membershipStatus = String(employee?.status || '')
    .trim()
    .toUpperCase();
  if (membershipRole === 'ADMIN') return false;
  return membershipStatus === 'ACTIVE' || membershipStatus === 'TERMINATED';
}

function isWorkingDate(dateKey, holidaySet) {
  const date = parseDateKey(dateKey);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getUTCDay() === 0) return false;
  return !holidaySet.has(dateKey);
}

function buildWorkingDates({
  dateFrom,
  dateTo,
  joinedDateKey = '',
  leftDateKey = '',
  holidaySet,
}) {
  const start = parseDateKey(dateFrom);
  const end = parseDateKey(dateTo);
  const dates = [];

  for (let cursor = start; cursor <= end; cursor = incrementDate(cursor, 1)) {
    const dateKey = formatDateKey(cursor);
    if (joinedDateKey && dateKey < joinedDateKey) continue;
    if (leftDateKey && dateKey > leftDateKey) continue;
    if (!isWorkingDate(dateKey, holidaySet)) continue;
    dates.push(dateKey);
  }

  return dates;
}

async function hasOrganizationHolidayTable() {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='OrganizationHoliday' LIMIT 1"
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function loadHolidayMap(orgIds, extraHolidayKeys) {
  const holidayMap = new Map();
  const normalizedExtras = (Array.isArray(extraHolidayKeys) ? extraHolidayKeys : [])
    .map((value) => normalizeDateKey(value))
    .filter(Boolean);

  orgIds.forEach((orgId) => {
    holidayMap.set(orgId, new Set(normalizedExtras));
  });

  if (!(await hasOrganizationHolidayTable()) || orgIds.length === 0) {
    return holidayMap;
  }

  const orgIdList = orgIds.join(',');
  const rows = await prisma.$queryRawUnsafe(
    `SELECT "orgId", "holidayDate" FROM "OrganizationHoliday" WHERE "orgId" IN (${orgIdList})`
  );

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const orgId = Number(row.orgId);
    const holidayDate = normalizeDateKey(row.holidayDate);
    if (!Number.isFinite(orgId) || !holidayDate) return;
    if (!holidayMap.has(orgId)) {
      holidayMap.set(orgId, new Set(normalizedExtras));
    }
    holidayMap.get(orgId).add(holidayDate);
  });

  return holidayMap;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const monthKeys = options.months.map((value) => normalizeMonthKey(value)).filter(Boolean);
  if (monthKeys.length === 0) {
    throw new Error('Provide --months=YYYY-MM,YYYY-MM');
  }

  const monthRanges = monthKeys.map((monthKey) => monthRange(monthKey)).filter(Boolean);
  if (options.dateFrom && options.dateTo && options.dateTo < options.dateFrom) {
    throw new Error('--date-to must be greater than or equal to --date-from');
  }
  const boundedMonthRanges = monthRanges
    .map((range) => ({
      ...range,
      dateFrom: options.dateFrom && options.dateFrom > range.dateFrom ? options.dateFrom : range.dateFrom,
      dateTo: options.dateTo && options.dateTo < range.dateTo ? options.dateTo : range.dateTo,
    }))
    .filter((range) => range.dateFrom <= range.dateTo);
  if (boundedMonthRanges.length === 0) {
    throw new Error('No working date range remains after applying date bounds.');
  }
  const minDate = boundedMonthRanges.map((item) => item.dateFrom).sort()[0];
  const maxDate = boundedMonthRanges.map((item) => item.dateTo).sort().slice(-1)[0];
  const workerNameSet = new Set(options.workerNames.map((value) => normalizeNameKey(value)));

  const employeeWhere = {
    factoryId: { not: null },
    orgRole: { not: 'ADMIN' },
    status: { in: ['ACTIVE', 'TERMINATED'] },
    ...(options.orgId ? { orgId: options.orgId } : {}),
    ...(options.factoryId ? { factoryId: options.factoryId } : {}),
    ...(options.factoryName
      ? {
          factory: {
            name: options.factoryName,
          },
        }
      : {}),
  };

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: {
      id: true,
      orgId: true,
      factoryId: true,
      name: true,
      position: true,
      joinedAt: true,
      leftAt: true,
      orgRole: true,
      status: true,
      role: {
        select: {
          code: true,
          name: true,
        },
      },
      factory: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ orgId: 'asc' }, { factoryId: 'asc' }, { id: 'asc' }],
  });

  const nameFilteredEmployees =
    workerNameSet.size > 0
      ? employees.filter((employee) => workerNameSet.has(normalizeNameKey(employee.name)))
      : employees;
  const eligibleEmployees = nameFilteredEmployees.filter((employee) =>
    isBackfillEligibleEmployee(employee)
  );
  const matchedWorkerNames = new Set(
    eligibleEmployees.map((employee) => normalizeNameKey(employee.name))
  );
  const unmatchedWorkerNames = options.workerNames.filter(
    (name) => !matchedWorkerNames.has(normalizeNameKey(name))
  );
  const attendanceRows = await prisma.attendanceEntry.findMany({
    where: {
      workDate: {
        gte: minDate,
        lte: maxDate,
      },
      workerId: {
        in: eligibleEmployees.map((employee) => employee.id),
      },
    },
    select: {
      orgId: true,
      factoryId: true,
      workerId: true,
      workDate: true,
      clockIn: true,
      clockOut: true,
      workedSeconds: true,
    },
  });

  const attendanceDateSet = new Set();
  attendanceRows.forEach((row) => {
    attendanceDateSet.add(`${row.orgId}:${row.factoryId}:${row.workerId}:${row.workDate}`);
  });

  const holidayMap = await loadHolidayMap(
    Array.from(new Set(eligibleEmployees.map((employee) => employee.orgId))),
    options.holidays
  );

  const workerMonthPlans = [];
  eligibleEmployees.forEach((employee) => {
    const joinedDateKey = resolveEmploymentDateKey(employee.joinedAt);
    const leftDateKey = resolveEmploymentDateKey(employee.leftAt);
    boundedMonthRanges.forEach((range) => {
      const workingDates = buildWorkingDates({
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        joinedDateKey,
        leftDateKey,
        holidaySet: holidayMap.get(employee.orgId) || new Set(),
      });
      if (workingDates.length === 0) return;

      const missingDates = workingDates.filter(
        (dateKey) =>
          !attendanceDateSet.has(
            `${employee.orgId}:${employee.factoryId}:${employee.id}:${dateKey}`
          )
      );
      if (missingDates.length === 0) return;

      workerMonthPlans.push({
        orgId: employee.orgId,
        factoryId: employee.factoryId,
        factoryName: employee.factory?.name || '',
        monthKey: range.monthKey,
        workerId: employee.id,
        workerName: employee.name || '',
        membershipRole: String(employee?.orgRole || '').trim().toUpperCase(),
        workingDates: missingDates,
      });
    });
  });

  const preview = workerMonthPlans.map((plan) => ({
    orgId: plan.orgId,
    factoryId: plan.factoryId,
    factoryName: plan.factoryName,
    monthKey: plan.monthKey,
    workerId: plan.workerId,
    workerName: plan.workerName,
    membershipRole: plan.membershipRole,
    fillDays: plan.workingDates.length,
  }));

  const summaryMap = new Map();
  preview.forEach((item) => {
    const key = `${item.orgId}:${item.factoryId}:${item.monthKey}`;
    const current = summaryMap.get(key) || {
      orgId: item.orgId,
      factoryId: item.factoryId,
      factoryName: item.factoryName,
      monthKey: item.monthKey,
      workerCount: 0,
      fillDays: 0,
    };
    current.workerCount += 1;
    current.fillDays += item.fillDays;
    summaryMap.set(key, current);
  });

  console.log(
    JSON.stringify(
      {
        dryRun: !options.apply,
        months: monthKeys,
        filters: {
          orgId: options.orgId,
          factoryId: options.factoryId,
          factoryName: options.factoryName || null,
          workerNames: options.workerNames,
          unmatchedWorkerNames,
          dateFrom: options.dateFrom || null,
          dateTo: options.dateTo || null,
          holidays: options.holidays,
        },
        summary: Array.from(summaryMap.values()),
        preview,
      },
      null,
      2
    )
  );

  if (!options.apply || workerMonthPlans.length === 0) {
    return;
  }

  let createdCount = 0;

  for (const plan of workerMonthPlans) {
    const created = await prisma.attendanceEntry.createMany({
      data: plan.workingDates.map((workDate) => ({
        orgId: plan.orgId,
        factoryId: plan.factoryId,
        workerId: plan.workerId,
        workDate,
        clockIn: DEFAULT_CLOCK_IN,
        clockOut: DEFAULT_CLOCK_OUT,
        workedSeconds: DEFAULT_WORKED_SECONDS,
        note: DEFAULT_NOTE,
      })),
      skipDuplicates: true,
    });
    createdCount += created.count;
  }

  console.log(
    JSON.stringify(
      {
        applied: true,
        workerMonthCount: workerMonthPlans.length,
        createdCount,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
