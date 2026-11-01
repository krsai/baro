// Independent server definition: never import browser access policy code.
export const SERVICE_FEATURES = ['DASHBOARD','BANK_LEDGER','ATTENDANCE','OUTSOURCING_RECORD','PAYROLL','BUSINESS','EMPLOYEE','EMPLOYEE_SYSTEM','SALARY_SYSTEM','CUSTOMER','OUTSOURCING_PARTNER','MATERIAL_SUPPLIER','LOGISTICS_PARTNER','PERMISSION','HOLIDAY'];
export const SERVICE_ROLE_DEFAULTS = {
  ADMIN: [...SERVICE_FEATURES],
  ACCOUNTANT: ['DASHBOARD','BANK_LEDGER','OUTSOURCING_RECORD','PAYROLL','BUSINESS','EMPLOYEE','HOLIDAY'],
  OPERATOR: ['DASHBOARD','ATTENDANCE','OUTSOURCING_RECORD','EMPLOYEE','CUSTOMER','OUTSOURCING_PARTNER','MATERIAL_SUPPLIER','LOGISTICS_PARTNER'],
  WORKER: ['DASHBOARD'],
};
export const supportsWorkplaces = (org: {type?: string|null}|null|undefined) => org?.type === 'MANUFACTURER' || org?.type === 'SERVICE';
export const companyBusinessTimeZone = (org: {type?:string|null;country?:string|null}|null|undefined) => org?.type==='SERVICE'&&org.country==='VN'?'Asia/Ho_Chi_Minh':process.env.BUSINESS_TIME_ZONE||'Asia/Seoul';
