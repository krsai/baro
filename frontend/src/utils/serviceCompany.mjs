// Service tenants reuse company administration without garment production.
export const SERVICE_FEATURES = ['WORK_TIME','INVOICE','FREIGHT','ACCOUNT_OVERVIEW','DASHBOARD','INVOICE','BANK_LEDGER','ATTENDANCE','OUTSOURCING_RECORD','PAYROLL','BUSINESS','EMPLOYEE','EMPLOYEE_SYSTEM','SALARY_SYSTEM','CUSTOMER','OUTSOURCING_PARTNER','MATERIAL_SUPPLIER','LOGISTICS_PARTNER','PERMISSION','HOLIDAY'];
export const SERVICE_ROLE_DEFAULTS = {
  ADMIN: [...SERVICE_FEATURES],
  ACCOUNTANT: ['WORK_TIME','DASHBOARD','BANK_LEDGER','OUTSOURCING_RECORD','PAYROLL','BUSINESS','EMPLOYEE','HOLIDAY'],
  OPERATOR: ['WORK_TIME','DASHBOARD','ATTENDANCE','OUTSOURCING_RECORD','EMPLOYEE','CUSTOMER','OUTSOURCING_PARTNER','MATERIAL_SUPPLIER','LOGISTICS_PARTNER'],
  WORKER: ['WORK_TIME','DASHBOARD'],
};
export const workplaceText = (value, orgType) => orgType !== 'SERVICE' || typeof value !== 'string' ? value : value
  .replaceAll('공장','사업장').replace(/Factories/g,'Workplaces').replace(/factories/g,'workplaces').replace(/Factory/g,'Workplace').replace(/factory/g,'workplace').replace(/Nhà máy/g,'Nơi làm việc').replace(/nhà máy/g,'nơi làm việc');
