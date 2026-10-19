const localizedName = (row, language) => row?.[{ko:'nameKo',en:'nameEn',vi:'nameVi'}[language] || 'nameEn'] || row?.nameEn || '';

export function expenseCodeDescription(code, language = 'ko') {
  if (!code) return '';
  const process = {ko:'외주 공정',en:'Outsourced process',vi:'Công đoạn gia công'};
  const category = code.base?.entryMode === 'PROCESS'
    ? process[language] || process.en : localizedName(code.base?.expenseType,language);
  return [category,localizedName(code,language)].filter(Boolean).join(' - ');
}

// Only explicit local or source FKs establish equivalence. Legacy rows with no
// source FK are unknown; matching text never establishes an industry relation.
export function expenseIndustryMismatch(code, partner) {
  if (!code || !partner || !Array.isArray(partner.serviceTypes)) return false;
  const industries = partner.serviceTypes;
  if (industries.some(row=>row.id===code.serviceTypeId)) return false;
  const sourceId = code.serviceType?.systemDefaultId || code.base?.serviceTypeId;
  if (!sourceId) return false;
  if (industries.some(row=>row.systemDefaultId===sourceId)) return false;
  return industries.every(row=>Boolean(row.systemDefaultId));
}
