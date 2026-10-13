// Flags on Employee are the pre-version baseline. Versions never change that baseline.
export const resolvePayrollManagement = (employee: any, month: string) => {
  const version = (employee?.payrollManagementVersions || [])
    .filter((row: any) => row.effectiveMonth <= month)
    .sort((a: any, b: any) => b.effectiveMonth.localeCompare(a.effectiveMonth) || b.id - a.id)[0];
  return {
    ...employee,
    alwaysFullAttendance: Boolean(version?.alwaysFullAttendance ?? employee?.alwaysFullAttendance),
    payrollExcluded: Boolean(version?.payrollExcluded ?? employee?.payrollExcluded),
  };
};

export const payrollManagementInclude = { orderBy: [{ effectiveMonth: 'desc' as const }, { id: 'desc' as const }] };
