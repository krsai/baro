// Common party attributes. Business roles, tenancy and authentication are separate.
export const normalizePartnerCode = (value: any): string | null => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw Object.assign(new Error('INVALID_PARTNER_CODE'), {status:400});
  const code=value.trim().toUpperCase();
  if (!code) return null;
  if (!/^[A-Z0-9._-]{1,40}$/.test(code)) throw Object.assign(new Error('INVALID_PARTNER_CODE'), {status:400});
  return code;
};
export const resolvePartnerCode = (value: any, englishName: unknown): string => {
  const explicit=normalizePartnerCode(value);
  if(explicit)return explicit;
  const generated=typeof englishName==='string'?englishName.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6):'';
  if(!generated)throw Object.assign(new Error('PARTNER_CODE_REQUIRED'),{status:400});
  return generated;
};
export const entityProfile = (entity:any) => ({
  entityId:entity.id,name:entity.name,nameKo:entity.nameKo ?? null,nameVi:entity.nameVi ?? null,
  code:entity.code ?? null,businessNumber:entity.businessNumber ?? null,
  country:entity.country ?? null,countryCode:entity.countryCode ?? null,address:entity.address ?? null,
  contactName:entity.representative ?? null,contactPhone:entity.phone ?? null,email:entity.email ?? null,
});
export const partnerProfilePatch = (body:any) => {
  const result:any={};
  if(body?.code!==undefined)result.code=normalizePartnerCode(body.code);
  for(const [field,max] of Object.entries({nameKo:200,nameVi:200,businessNumber:100,country:2,countryCode:10,address:2000,email:254})) {
    if(body?.[field]===undefined)continue;
    if(body[field]!==null && (typeof body[field]!=='string'||body[field].length>max))throw Object.assign(new Error('INVALID_ENTITY_PROFILE'),{status:400});
    result[field]=typeof body[field]==='string'?body[field].trim()||null:null;
  }
  if(result.country && !/^[A-Z]{2}$/.test(result.country))throw Object.assign(new Error('INVALID_ENTITY_PROFILE'),{status:400});
  return result;
};
