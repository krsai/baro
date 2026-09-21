// Attendance belongs to the employment period, independently of office/production role.
export const isAttendanceEmployeeVisibleOnDate = (employee, workDateKey) => {
  if (!employee || !workDateKey) return false;
  const dateKey = (value) => String(value || '').slice(0, 10);
  const joined = dateKey(employee.joinedAt);
  const left = dateKey(employee.leftAt);
  const status = String(employee.status || '').toUpperCase();
  if (status && !['ACTIVE', 'TERMINATED', 'SUSPENDED'].includes(status)) return false;
  if (status === 'TERMINATED' && !left) return false;
  return (!joined || workDateKey >= joined) && (!left || workDateKey <= left);
};
