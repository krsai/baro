import {accountingCodeDescription} from './accountingCode.mjs';
export const expenseCodeDescription=accountingCodeDescription;

export function expenseLineDescription(line, language = 'ko', codes = []) {
  if (!line?.transactionCodeId) return line?.description || '';
  const code = codes.find(row => row.id === line?.transactionCodeId)
    || (line?.transactionCode?.id === line?.transactionCodeId ? line.transactionCode : null);
  return code ? expenseCodeDescription(code,language) : line?.description || '';
}

export function expenseRequestSummary(document, language = 'ko', codes = []) {
  const items = document?.items || [];
  if (!items.length) return '';
  const first = expenseLineDescription(items[0],language,codes);
  const count = items.length - 1;
  if (!count) return first;
  return language === 'ko' ? `${first} 외 ${count}건`
    : language === 'vi' ? `${first} và ${count} mục khác` : `${first} and ${count} more`;
}

// Only explicit local or source FKs establish equivalence. Legacy rows with no
// source FK are unknown; matching text never establishes an industry relation.
export function expenseIndustryMismatch(code, partner) {
  if (!code || !partner || partner.type === 'EMPLOYEE' || !Array.isArray(partner.serviceTypes)) return false;
  const industries = partner.serviceTypes;
  if (industries.some(row=>row.id===code.serviceTypeId)) return false;
  const sourceId = code.serviceType?.systemDefaultId || code.base?.serviceTypeId;
  if (!sourceId) return false;
  if (industries.some(row=>row.systemDefaultId===sourceId)) return false;
  return industries.every(row=>Boolean(row.systemDefaultId));
}
