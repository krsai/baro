import dayjs from 'dayjs';

export const isFormerEmployee = (employee, today = dayjs().format('YYYY-MM-DD')) =>
  employee.status === 'TERMINATED' || Boolean(employee.leftAt && String(employee.leftAt).slice(0, 10) < today);

// Attendance belongs to the employment period, independently of office/production role.
export const isAttendanceManagementExcluded = (employee) =>
  Boolean(employee?.alwaysFullAttendance || employee?.payrollExcluded);

export const isAttendanceEmployeeVisibleOnDate = (employee, workDateKey) => {
  if (!employee || !workDateKey) return false;
  if (isAttendanceManagementExcluded(employee)) return false;
  const dateKey = (value) => String(value || '').slice(0, 10);
  const joined = dateKey(employee.joinedAt);
  const left = dateKey(employee.leftAt);
  const status = String(employee.status || '').toUpperCase();
  if (status && !['ACTIVE', 'TERMINATED', 'SUSPENDED'].includes(status)) return false;
  if (status === 'TERMINATED' && !left) return false;
  return (!joined || workDateKey >= joined) && (!left || workDateKey <= left);
};
