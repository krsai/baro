import { resolveEmployeeEffectivePayType } from './employeeCompensation';
import { normalizeEmployeePayTypePolicy } from './employeePayTypePolicy';
import { resolveSalaryAttendanceParameters } from './salaryAttendanceParameters';
import { evaluateSalaryFormula } from './salaryFormula';
import { employmentDateKey, hasPreviousYearSixMonthsService, isTenureSalaryItem, resolveSalaryTenureYears } from './salaryTenure';
import { resolvePayrollManagement } from './payrollManagement';

export const buildSalaryPreview = ({ month, employees, factories, policies, holidays, includeInactive = false, today = employmentDateKey(new Date()) }: {
  month: string; employees: any[]; factories: any[]; policies: any[]; holidays: string[]; includeInactive?: boolean; today?: string;
}) => {
  const visible = employees.filter(employee => ['ACTIVE', 'SUSPENDED', 'TERMINATED'].includes(employee.status)
    && (includeInactive || (employee.status === 'ACTIVE' && (!employmentDateKey(employee.joinedAt) || employmentDateKey(employee.joinedAt) <= today) && (!employmentDateKey(employee.leftAt) || employmentDateKey(employee.leftAt) >= today))));
  const groups = factories.map(factory => {
    const version = factory.salarySystemVersions?.[0];
    const snapshot = version?.snapshot;
    const items: any[] = Array.isArray(snapshot?.items) ? snapshot.items : [];
    const rates: any[] = Array.isArray(snapshot?.rates) ? snapshot.rates : [];
    const productionVersion = factory.productionAllowanceRates?.[0];
    const configuredWage = productionVersion ? Number(productionVersion.wagePerSecond)
      : factory._count?.productionAllowanceRates > 0 ? NaN : factory.wagePerSecond == null ? NaN : Number(factory.wagePerSecond);
    const wage = Number.isFinite(configuredWage) && configuredWage > 0 ? configuredWage : NaN;
    const standards = ['GENERAL', 'OUTPUT_FIXED', 'OUTPUT'].map(payType => {
      const policy = normalizeEmployeePayTypePolicy(policies.find(row => row.payType === payType), payType);
      const attendance = resolveSalaryAttendanceParameters({ month, payType, holidayDateKeys: holidays, attendanceEntries: [], policy, alwaysFullAttendance: true });
      return { ...policy, scheduledWorkdays: attendance.SCHEDULED_WORKDAYS, regularHours: attendance.SCHEDULED_WORKDAYS * policy.standardWorkMinutes / 60 };
    });
    const rows = visible.filter(employee => employee.factoryId === factory.id).map(employee => {
      const payType = resolveEmployeeEffectivePayType(employee);
      const standard = standards.find(row => row.payType === payType)!;
      const management = resolvePayrollManagement(employee, month);
      const tenureEligible = hasPreviousYearSixMonthsService(employee, month);
      const parameters = {
        GRADE_RATE: 0, TENURE_YEARS: resolveSalaryTenureYears(employee.joinedAt ?? employee.approvedAt ?? employee.createdAt, month), ACTUAL_WORKDAYS: standard.scheduledWorkdays,
        SCHEDULED_WORKDAYS: standard.scheduledWorkdays, FULL_ATTENDANCE_FACTOR: standard.scheduledWorkdays > 0 ? 1 : 0,
        HOLIDAY_WORKDAYS: 0, WORK_HOURS: standard.regularHours, OVERTIME_HOURS: 0, HOLIDAY_HOURS: 0,
        PRODUCTION_ALLOWANCE: payType === 'OUTPUT' ? standard.regularHours * 3600 * wage : 0,
        PRODUCTION_ST_EXCESS_PERCENT: 0,
      };
      const salaryItems = items.map(item => {
        const code = String(item.code || item.id || '');
        const types: string[] = Array.isArray(item.payTypes) ? item.payTypes : [];
        const active = types.includes(payType) || (payType === 'OUTPUT_FIXED' && item.category !== 'INCENTIVE' && types.includes('OUTPUT'));
        const paymentMonths: number[] = Array.isArray(item.paymentMonths) ? item.paymentMonths.map(Number) : [];
        const reason = !active ? 'NOT_APPLICABLE' : management.payrollExcluded ? 'PAYROLL_EXCLUDED'
          : paymentMonths.length > 0 && !paymentMonths.includes(Number(month.slice(5,7))) ? 'NOT_PAYMENT_MONTH'
          : isTenureSalaryItem(item) && !tenureEligible ? 'TENURE_INELIGIBLE' : null;
        if (reason) return { code, amount: 0, reason };
        const candidates = rates.filter(rate => rate.salaryItemCode === code && Number(rate.gradeId) === employee.gradeId);
        const rate = candidates.find(row => row.payType === payType) || (payType === 'OUTPUT_FIXED' ? candidates.find(row => row.payType === 'OUTPUT') : null);
        const formula: string[] = Array.isArray(item.formula) ? item.formula : [];
        if (formula[0] === 'GRADE_RATE' && !rate) return { code, amount: null, reason: 'MISSING_RATE' };
        if (formula.includes('PRODUCTION_ALLOWANCE') && !Number.isFinite(parameters.PRODUCTION_ALLOWANCE)) return { code, amount: null, reason: 'MISSING_PRODUCTION_RATE' };
        try {
          let amount = Number(evaluateSalaryFormula(formula, {...parameters, GRADE_RATE: Number(rate?.amount || 0)}));
          if (item.capValue != null && item.capValue !== '') amount = Math.min(amount, Number(item.capValue));
          if (!Number.isFinite(amount)) return {code,amount:null,reason:'INVALID_FORMULA'};
          const rounded = Math.max(0, Math.round(amount));
          return { code, amount: rounded, reason: rounded === 0 && isTenureSalaryItem(item) && formula.includes('TENURE_YEARS') && parameters.TENURE_YEARS === 0 ? 'TENURE_ZERO_YEARS' : null };
        } catch { return { code, amount: null, reason: 'INVALID_FORMULA' }; }
      });
      const complete = Boolean(version && items.length) && salaryItems.every(item => item.amount !== null);
      return { id: employee.id, name: employee.name || employee.email || String(employee.id), employeeNo: employee.employeeNo,
        status: employee.status, grade: employee.grade, payType, payrollExcluded: management.payrollExcluded,
        tenureEligible, tenureYears: parameters.TENURE_YEARS, scheduledWorkdays: standard.scheduledWorkdays, regularHours: standard.regularHours,
        salaryItems, subtotal: salaryItems.reduce((sum, item) => sum + (item.amount || 0), 0), total: complete ? salaryItems.reduce((sum, item) => sum + (item.amount || 0), 0) : null,
        error: !version || !items.length ? 'MISSING_SALARY_VERSION' : !complete ? 'INCOMPLETE' : null };
    });
    return { id: factory.id, name: factory.name, currencyCode: snapshot?.currencyCode || factory.salaryCurrency?.code || factory.organization?.salaryCurrency?.code || 'VND',
      versionNumber: version?.versionNumber || null, items, standards, employees: rows };
  }).filter(group => group.employees.length);
  const unassigned = visible.filter(employee => !factories.some(factory => factory.id === employee.factoryId)).map(employee => ({id:employee.id,name:employee.name || employee.employeeNo || String(employee.id)}));
  return {month, factories: groups, unassigned, assumptions: {fullAttendance:true, overtimeHours:0, holidayHours:0, tenureBasis:'EMPLOYMENT_DATE', productionEfficiencyPercent:100}};
};
