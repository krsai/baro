const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function normalizeLocalizedName(value: any = {}, englishField = 'nameEn') {
  const nameKo = text(value?.nameKo), nameVi = text(value?.nameVi);
  const legacy = Object.hasOwn(value || {}, englishField) ? '' : text(value?.name) || text(value?.label);
  const nameEn = text(value?.[englishField]) || nameKo || nameVi || legacy;
  return { name: nameEn, nameEn, nameKo, nameVi };
}
export function validLocalizedName(value: any, max = 200): boolean {
  return Boolean(normalizeLocalizedName(value).nameEn) && ['name','nameEn','nameKo','nameVi'].every(key =>
    value?.[key] == null || typeof value[key] === 'string' && value[key].length <= max);
}

// Entity tables use `name` itself for English. Partial updates which do not
// include that slot must leave the existing English name alone.
export function normalizeEntityNameInput(req: any, _res: any, next: any) {
  const body = req.body;
  if (body && (Object.hasOwn(body, 'name') || req.method === 'POST' && ('nameKo' in body || 'nameVi' in body))) {
    body.name = normalizeLocalizedName(body, 'name').name;
  }
  next();
}
