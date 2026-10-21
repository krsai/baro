const LABELS={
 ko:{ADMIN:'조직·가입 관리',ATTRIBUTE:'공통 기준정보',PROCESS_MASTER:'공정 기준정보',MISC:'비용·거래 기준',SYSTEM:'시스템 설정'},
 en:{ADMIN:'Organizations & onboarding',ATTRIBUTE:'Shared reference data',PROCESS_MASTER:'Process reference data',MISC:'Expense & partner data',SYSTEM:'System settings'},
 vi:{ADMIN:'Tổ chức & đăng ký',ATTRIBUTE:'Dữ liệu dùng chung',PROCESS_MASTER:'Danh mục công đoạn',MISC:'Chi phí & đối tác',SYSTEM:'Cài đặt hệ thống'},
};
const GROUPS=[
 ['ADMIN',['/system-setting','/system-onboarding','/employee']],
 ['ATTRIBUTE',['/system-setting/static-options','/attribute/colors','/attribute/categories']],
 ['PROCESS_MASTER',['/attribute/processes/targets','/attribute/processes/actions','/attribute/processes/specs']],
 ['MISC',['/system-setting/expense-types','/system-setting/partner-industries','/system-setting/transaction-codes']],
 ['SYSTEM',['/system-setting/access-policy','/system-setting/app-defaults','/employee-system','/salary-system','/personal-settings','/app-settings']],
];

// Reuse the canonical menu nodes, including permission checks and badges.
// Only the SYSTEM navigation groups/order differ from the SaaS organization UI.
export function organizeSystemMenu(items,languageCode='ko'){
 const leaves=new Map(),groups=new Map();
 const visit=nodes=>nodes.forEach(node=>{if(node.isParent){groups.set(node.menuGroupKey,node);visit(node.children||[]);}else if(node.path)leaves.set(node.path,node);});visit(items);
 const used=new Set(['/dashboard']);
 const result=GROUPS.map(([key,paths])=>{
  const source=groups.get(key)||groups.get('SYSTEM');
  const children=paths.map(path=>{used.add(path);return leaves.get(path);}).filter(Boolean);
  return {...source,icon:key==='MISC'?(groups.get('ACCOUNTING')?.icon||source?.icon):source?.icon,label:(LABELS[languageCode]||LABELS.en)[key],menuGroupKey:key,isParent:true,children};
 }).filter(group=>group.children.length);
 // New canonical routes remain visible until deliberately placed in a group.
 const remaining=[...leaves.values()].filter(node=>!used.has(node.path));
 if(remaining.length){const system=result.find(group=>group.menuGroupKey==='SYSTEM');if(system)system.children.push(...remaining);}
 return [leaves.get('/dashboard'),...result].filter(Boolean);
}

export function findMenuGroupForPath(items,path){
 let best=null;
 const visit=(nodes,group)=>nodes.forEach(node=>{if(node.isParent)visit(node.children||[],node.menuGroupKey);else if(node.path&&(path===node.path||path.startsWith(`${node.path}/`))&&(!best||node.path.length>best.length))best={key:group,length:node.path.length};});
 visit(items,null);return best?.key||null;
}
