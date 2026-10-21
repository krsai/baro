// One screen identity for menus, workspace tabs and page headings. Route modes
// describe the screen's purpose; dirty state and record IDs never rename it.
export const PAGE_ROUTES = [
  ['/dashboard','dashboard','page'], ['/business','business','list'],
  ['/employee','employee','list'], ['/employee-system','employeeSystem','page'],
  ['/salary-system','salarySystem','page'], ['/permission','permission','page'],
  ['/system-setting','subscription','page'],
  ['/app-settings/transaction-codes','transactionCodes','page'],
  ['/app-settings','appSettings','page'],
  ['/system-setting/app-defaults','appDefaults','page'],
  ['/system-setting/expense-types','expenseTypes','page'],
  ['/system-setting/partner-industries','partnerIndustries','page'],
  ['/system-setting/transaction-codes','transactionMasters','page'],
  ['/system-setting/static-options','staticOptions','page'],
  ['/system-setting/access-policy','accessPolicy','page'],
  ['/system-onboarding','onboardingApproval','list'],
  ['/business-partner','partners','list'], ['/customer','partners','list'],
  ['/outsourcing-partner','partners','list'], ['/material-supplier','partners','list'],
  ['/customer-pricing','customerPricing','page'],
  ['/order','order','list','edit'], ['/style','style','list','edit'],
  ['/customer-production-report','customerProductionReport','page'],
  ['/st-review','standardReview','page'], ['/shipment-review','shipmentReview','page'],
  ['/qc-review','qcReview','page'], ['/assignment','assignment','page','detail'],
  ['/work-history','workHistory','list','edit'],
  ['/outsourcing-record','outsourcingRecord','list','edit'],
  ['/production-analysis','productionAnalysis','page','detail'],
  ['/work-history-monthly','productionAnalysis','page','detail'],
  ['/attendance','attendance','list','edit'],
  ['/inventory/stock','inventoryStock','page'],
  ['/inventory/movements','inventoryHistory','list'],
  ['/inventory/materials','materials','list'], ['/inventory/settings','materialSettings','page'],
  ['/payroll','payroll','list','detail'], ['/revenue-forecast','revenueForecast','page'],
  ['/invoices','invoice','list'], ['/revenue-analysis','revenueAnalysis','page'],
  ['/attribute/colors','attributeColors','page'],
  ['/attribute/categories','attributeCategories','page'],
  ['/attribute/processes/targets','processTargets','page'],
  ['/attribute/processes/actions','processActions','page'],
  ['/attribute/processes/specs','processSpecs','page'],
  ['/attribute/processes','attributeProcesses','page'], ['/attribute','attribute','page'],
  ['/holiday','holiday','page'], ['/profile','personalSettings','page'],
  ['/personal-settings','personalSettings','page'],
];
const ACTIONS = {
  ko: {list:'목록',create:'등록',edit:'수정',detail:'상세',revise:'개정'},
  en: {list:'List',create:'Create',edit:'Edit',detail:'Details',revise:'Revise'},
  vi: {list:'Danh sách',create:'Tạo',edit:'Sửa',detail:'Chi tiết',revise:'Điều chỉnh'},
};
export function formatPageTitle(name, mode, languageCode = 'ko') {
  const language = ACTIONS[languageCode] ? languageCode : 'en';
  const action = ACTIONS[language][mode];
  if (!action) return name;
  return language === 'ko' || language === 'en' && ['list','detail'].includes(mode)
    ? `${name} ${action}` : `${action} ${name}`;
}
export function resolvePageNaming(path, languageCode, translate) {
  const url = new URL(path || '/', 'https://baro.local');
  const pathname = url.pathname.replace(/\/$/,'') || '/';
  const row = PAGE_ROUTES.filter(([base]) => pathname === base || pathname.startsWith(`${base}/`))
    .sort((a,b) => b[0].length - a[0].length)[0];
  if (!row) return null;
  const [base,key,baseMode,childMode] = row;
  const rest = pathname.slice(base.length);
  let mode = rest ? childMode || 'detail' : baseMode;
  if (rest === '/new') mode = 'create';
  if (base === '/customer' && rest) mode = rest === '/new' ? 'create' : 'edit';
  if (base === '/invoices' && rest === '/new' && url.searchParams.has('revision')) mode = 'revise';
  const nameKey = base === '/customer' && rest ? 'customer'
    : base === '/inventory/movements' && rest === '/new' ? 'inventoryEntry' : key;
  const menuLabel = translate(`menu.${nameKey}`);
  return {path:pathname, key:nameKey, mode, menuLabel, title:formatPageTitle(menuLabel,mode,languageCode)};
}

export function applyPageMenuNames(items, languageCode, translate) {
  return items.map(item => ({
    ...item,
    label: item.path ? resolvePageNaming(item.path,languageCode,translate)?.menuLabel || item.label : item.label,
    ...(item.children ? {children:applyPageMenuNames(item.children,languageCode,translate)} : {}),
  }));
}
