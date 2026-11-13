// Move canonical nodes intact so route permissions, partner access keys and badges survive.
const GROUPS = [
  ['ORDER', 'salesWorkflow', ['/business-partner', '/shipping', '/style', '/order', '/customer-production-report']],
  ['RECORDS', 'productionWorkflow', ['/assignment', '/work-history', '/order-shipments']],
  ['INVENTORY', 'materialsInventory', ['/inventory/materials', '/inventory/stock', '/inventory/movements', '/inventory/settings']],
  ['ADMIN', 'peoplePayroll', ['/employee', '/attendance', '/work-time', '/holiday']],
  ['ACCOUNTING', 'finance', ['/invoices', '/outsourcing-record', '/bank-ledger', '/payroll']],
  ['OPERATIONS', 'managementAnalysis', ['/account-overview', '/revenue-analysis']],
  ['SETTINGS', 'settings', ['/business', '/employee-system', '/salary-system', '/approval-settings', '/personal-settings', '/app-settings', '/system-setting/access-policy']],
];

export function organizeCompanyMenu(items, translate, orgType) {
  const leaves = new Map();
  const groups = new Map();
  for (const item of items) {
    if (item.isParent) {
      groups.set(item.menuGroupKey, item);
      for (const child of item.children || []) if (child.path) leaves.set(child.path, child);
    }
  }
  const shipping=items.find(item=>item.path==='/shipping');
  if(orgType==='BRAND'){
    const children=['/style','/order','/customer-production-report'].map(path=>leaves.get(path)).filter(Boolean),source=groups.get('ORDER');
    return source&&children.length?[{...source,children}]:children;
  }
  if(shipping)leaves.set('/shipping',shipping);
  const transport=orgType==='SERVICE'&&shipping;
  const used = new Set();
  const result = [...items.filter(item => !item.isParent && !['/shipping','/transport-exchange','/freight'].includes(item.path))];
  for (const [key, labelKey, paths] of GROUPS) {
    const source = groups.get(key);
    const children = (transport&&key==='ORDER'?['/shipping',...paths.filter(path=>path!=='/shipping')]:paths).map(path => {
      used.add(path);
      const leaf=leaves.get(path);
      return transport&&path==='/business-partner'&&leaf?{...leaf,label:translate('menu.customerPartners')}:leaf;
    }).filter(Boolean);
    if (source && children.length) result.push({ ...source, label: translate(`menu.${orgType==='SERVICE'&&key==='ORDER'?'transportWorkflow':labelKey}`), children });
  }
  // Preserve every unassigned menu, including all SYSTEM reference/admin routes.
  for (const item of items.filter(item => item.isParent)) {
    const children = (item.children || []).filter(child => !used.has(child.path));
    if (!children.length) continue;
    const target = result.find(group => group.menuGroupKey === item.menuGroupKey);
    if (target) target.children.push(...children);
    else result.push({ ...item, children });
  }
  return result;
}
