import {companyIndustryMenuFeatures} from './industryMenuPolicy';
export const accountingDashboardRole=(role:string)=>['ADMIN','ACCOUNTANT'].includes(role);
export const APPROVAL_MENU_FEATURES={EXPENSE:'OUTSOURCING_RECORD',BANK_LEDGER:'BANK_LEDGER',INVOICE:'INVOICE'} as const;
export async function dashboardApprovalMenus(db:any,orgId:number,orgType:string,actor:any,gates:any){
 const features=await companyIndustryMenuFeatures(db,orgId,orgType),menus=[] as string[];
 for(const [menu,feature] of Object.entries(APPROVAL_MENU_FEATURES))if(features.includes(feature)&&await gates.canAccess?.({orgType,orgRole:actor.orgRole,feature}))menus.push(menu);
 return menus;
}
