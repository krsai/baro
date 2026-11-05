const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
const apparelBrandNames=new Set(['의류 브랜드','Clothing brand','Apparel brand','Fashion brand','Thương hiệu thời trang','Thương hiệu may mặc'].map(normalize));

export function hasApparelBrandIndustry(classification){
 const selected=new Set((classification?.industryIds||[]).map(String));
 const roles=new Set((classification?.roleIds||[]).map(String));
 return (classification?.industries||[]).some(row=>selected.has(String(row.id))&&roles.has(String(row.partnerRoleId))&&[row.nameKo,row.nameEn,row.nameVi].some(name=>apparelBrandNames.has(normalize(name))));
}
