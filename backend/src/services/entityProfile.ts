// Common party attributes. Business roles, tenancy and authentication are separate.
export const entityProfile = (entity:any) => ({
  entityId:entity.id,name:entity.name,nameKo:entity.nameKo ?? null,nameVi:entity.nameVi ?? null,
  code:entity.code ?? null,businessNumber:entity.businessNumber ?? null,
  country:entity.country ?? null,countryCode:entity.countryCode ?? null,address:entity.address ?? null,
  contactName:entity.representative ?? null,contactPhone:entity.phone ?? null,email:entity.email ?? null,
});
export const partnerProfilePatch = (body:any) => {
  const result:any={};
  for(const [field,max] of Object.entries({nameKo:200,nameVi:200,businessNumber:100,country:2,countryCode:10,address:2000,email:254})) {
    if(body?.[field]===undefined)continue;
    if(body[field]!==null && (typeof body[field]!=='string'||body[field].length>max))throw Object.assign(new Error('INVALID_ENTITY_PROFILE'),{status:400});
    result[field]=typeof body[field]==='string'?body[field].trim()||null:null;
  }
  if(result.country && !/^[A-Z]{2}$/.test(result.country))throw Object.assign(new Error('INVALID_ENTITY_PROFILE'),{status:400});
  return result;
};
