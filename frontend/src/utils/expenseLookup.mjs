export const normalizeLookupText = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[đĐ]/g,'d').toLocaleLowerCase().trim();
export function exactLookupCode(options, input) {
  const code = String(input ?? '').trim().toUpperCase();
  const matches = code ? options.filter(option => String(option.code ?? '').toUpperCase() === code) : [];
  return matches.length === 1 ? matches[0] : null;
}
