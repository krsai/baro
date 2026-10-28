// Move canonical nodes intact so route permissions, partner access keys and badges survive.
const GROUPS = [
  ['ORDER', 'salesWorkflow', ['/business-partner', '/style', '/order', '/customer-production-report']],
  ['RECORDS', 'productionWorkflow', ['/assignment', '/work-history', '/production-analysis']],
  ['INVENTORY', 'materialsInventory', ['/inventory/materials', '/inventory/stock', '/inventory/movements', '/inventory/settings']],
  ['ADMIN', 'peoplePayroll', ['/employee', '/attendance', '/holiday', '/payroll']],
  ['ACCOUNTING', 'finance', ['/invoices', '/outsourcing-record', '/bank-ledger']],
  ['OPERATIONS', 'managementAnalysis', ['/revenue-forecast', '/revenue-analysis']],
  ['SETTINGS', 'settings', ['/business', '/employee-system', '/salary-system', '/approval-settings', '/personal-settings', '/app-settings', '/system-setting/access-policy']],
];

export function organizeCompanyMenu(items, translate) {
  const leaves = new Map();
  const groups = new Map();
  for (const item of items) {
    if (item.isParent) {
      groups.set(item.menuGroupKey, item);
      for (const child of item.children || []) if (child.path) leaves.set(child.path, child);
    }
  }
  const used = new Set();
  const result = [...items.filter(item => !item.isParent)];
  for (const [key, labelKey, paths] of GROUPS) {
    const source = groups.get(key);
    const children = paths.map(path => {
      used.add(path);
      return leaves.get(path);
    }).filter(Boolean);
    if (source && children.length) result.push({ ...source, label: translate(`menu.${labelKey}`), children });
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
