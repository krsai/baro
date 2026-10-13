import dayjs from 'dayjs';

export const isFormerEmployee = (employee, today = dayjs().format('YYYY-MM-DD')) =>
  employee.status === 'TERMINATED' || Boolean(employee.leftAt && String(employee.leftAt).slice(0, 10) < today);

// Attendance belongs to the employment period, independently of office/production role.
export const resolvePayrollManagement = (employee, month) => {
  const version = (employee?.payrollManagementVersions || []).filter(row => row.effectiveMonth <= month)
    .sort((a, b) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.id - a.id)[0];
  return { ...employee,
    alwaysFullAttendance: Boolean(version?.alwaysFullAttendance ?? employee?.alwaysFullAttendance),
    payrollExcluded: Boolean(version?.payrollExcluded ?? employee?.payrollExcluded) };
};
export const isAttendanceManagementExcluded = (employee, workDateKey) => {
  const resolved = resolvePayrollManagement(employee, String(workDateKey || dayjs().format('YYYY-MM-DD')).slice(0, 7));
  return Boolean(resolved.alwaysFullAttendance || resolved.payrollExcluded);
};

export const isAttendanceEmployeeVisibleOnDate = (employee, workDateKey) => {
  if (!employee || !workDateKey) return false;
  if (isAttendanceManagementExcluded(employee, workDateKey)) return false;
  const dateKey = (value) => String(value || '').slice(0, 10);
  const joined = dateKey(employee.joinedAt);
  const left = dateKey(employee.leftAt);
  const status = String(employee.status || '').toUpperCase();
  if (status && !['ACTIVE', 'TERMINATED', 'SUSPENDED'].includes(status)) return false;
  if (status === 'TERMINATED' && !left) return false;
  return (!joined || workDateKey >= joined) && (!left || workDateKey <= left);
};
