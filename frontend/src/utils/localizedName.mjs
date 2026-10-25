const text = value => typeof value === 'string' ? value.trim() : '';

// `name` is the English slot on entity profiles; it is only a compatibility
// alias on records which also have nameEn. Never invent missing translations.
export function normalizeLocalizedName(value = {}, englishField = 'nameEn') {
  value ||= {};
  const nameKo = text(value.nameKo), nameVi = text(value.nameVi);
  const legacy = Object.hasOwn(value, englishField) ? '' : text(value.name) || text(value.label);
  const nameEn = text(value[englishField]) || nameKo || nameVi || legacy;
  return { name: nameEn, nameEn, nameKo, nameVi };
}
export const hasLocalizedName = (value, englishField = 'nameEn') => Boolean(normalizeLocalizedName(value, englishField).nameEn);
