// Move canonical nodes intact so route permissions, partner access keys and badges survive.
const GROUPS = [
  ['ORDER', 'salesWorkflow', ['/business-partner', '/customer-production-report']],
  ['RECORDS', 'productionWorkflow', ['/style', '/order', '/assignment', '/work-history']],
  ['INVENTORY', 'inventoryMaterials', ['/inventory/movements', '/inventory/stock', '/inventory/materials']],
  ['LOGISTICS', 'logistics', ['/shipping']],
  ['ACCOUNTING', 'finance', ['/invoices', '/outsourcing-record', '/payroll', '/bank-ledger']],
  ['ADMIN', 'peoplePayroll', ['/employee', '/attendance', '/work-time', '/holiday']],
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
  const shipping=leaves.get('/shipping')||items.find(item=>item.path==='/shipping');
  if(shipping)leaves.set('/shipping',shipping);
  if(orgType==='BRAND'){
    return [['RECORDS',['/style','/order']],['ORDER',['/customer-production-report']],['LOGISTICS',['/shipping']]].flatMap(([key,paths])=>{
      const source=groups.get(key),children=paths.map(path=>leaves.get(path)).filter(Boolean);
      return source&&children.length?[{...source,...(key==='LOGISTICS'?{label:translate('menu.logistics')}:key==='RECORDS'?{label:translate('menu.productionWorkflow')}:{}),children}]:children;
    });
  }
  const transport=orgType==='SERVICE'&&shipping;
  const used = new Set();
  // One navigation entry; retain the original independently authorized nodes.
  const material=leaves.get('/inventory/materials'),reference=leaves.get('/inventory/settings');
  if(material&&reference){leaves.set(material.path,{...material,mergedEntry:true,accessChildren:[material,reference]});used.add(reference.path);}
  const result = [...items.filter(item => !item.isParent && !['/shipping','/transport-exchange','/freight'].includes(item.path))];
  for (const [key, labelKey, sourcePaths] of GROUPS) {
    const paths=orgType==='SERVICE'?key==='ORDER'?sourcePaths.filter(path=>path!=='/customer-production-report'):key==='LOGISTICS'?[...sourcePaths,'/customer-production-report']:sourcePaths:sourcePaths;
    if(orgType==='SERVICE'&&key==='INVENTORY'){paths.forEach(path=>used.add(path));continue;}
    const source = groups.get(key);
    const children = paths.map(path => {
      used.add(path);
      const leaf=leaves.get(path);
      return transport&&path==='/business-partner'&&leaf?{...leaf,label:translate('menu.customerPartners')}:leaf;
    }).filter(Boolean);
    if (source && children.length) result.push({ ...source, label: translate(`menu.${orgType==='SERVICE'&&key==='ORDER'?'sales':labelKey}`), children });
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

export function resolveMergedMenuAccess(node,hasAccess){
 if(!node.mergedEntry)return hasAccess(node.path)?node:null;
 const children=node.accessChildren.filter(child=>hasAccess(child.path));
 return children.length?{...node,path:children[0].path,accessChildren:children}:null;
}
