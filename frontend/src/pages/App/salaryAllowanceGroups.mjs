const ADDITIONAL_PARAMETERS = new Set(['OVERTIME_HOURS', 'HOLIDAY_HOURS', 'HOLIDAY_WORKDAYS', 'TENURE_YEARS']);
const ADDITIONAL_CODES = new Set(['holiday', 'overtime', 'night', 'seniority']);
// Existing user-defined items can have opaque draft codes and a flat-rate formula.
// Keep the three explicitly requested legacy names in the additional display group.
const ADDITIONAL_NAMES = new Set(['특근수당', '휴일근무수당', '야근수당', '근속수당']);

export const salaryDisplayGroup = item => {
  if (item.category !== 'ALLOWANCE') return item.category;
  const additional = ADDITIONAL_CODES.has(item.code || item.id)
    || (item.formula || []).some(token => ADDITIONAL_PARAMETERS.has(token))
    || [item.nameKo, item.name].some(name => ADDITIONAL_NAMES.has(String(name || '').replace(/\s/g, '')));
  return additional ? 'ADDITIONAL_ALLOWANCE' : 'ALLOWANCE';
};

export const isMonthlyBaseSalaryItem = item => item.payCycle === 'MONTHLY'
  && ['BASE', 'ALLOWANCE'].includes(salaryDisplayGroup(item));
