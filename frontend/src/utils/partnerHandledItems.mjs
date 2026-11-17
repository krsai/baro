export const handledIndustryBases=(options,industryId)=>(options?.bases||[]).filter(base=>base.isActive!==false&&base.industryLinks?.some(link=>link.systemIndustryId===industryId));
export function missingHandledIndustries(options,classification,value){
 return (options?.industries||[]).filter(industry=>classification?.industryIds?.includes(industry.id)&&!handledIndustryBases(options,industry.id).some(base=>value?.industries?.find(group=>group.industryId===industry.id)?.baseIds?.includes(base.id)));
}
