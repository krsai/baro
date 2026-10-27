export const LOGIN_COMPANIES = [
  { key: 'BARO', label: 'BARO GARMENT', codes: ['BARO'], names: ['BARO GARMENT'] },
  { key: 'DEX', label: 'DEX LOGIS', codes: ['DEX', 'DEXS'], names: ['DEX LOGIS', 'DEXS LOGIS'] },
  { key: 'SYSTEM', label: 'SYSTEM', codes: [], names: [] },
];
const PENDING_KEY = 'baro:login-company';
export const readLoginCompany = () => {
  try { const key = sessionStorage.getItem(PENDING_KEY); return LOGIN_COMPANIES.some(company => company.key === key) ? key : null; }
  catch { return null; }
};
export const rememberLoginCompany = key => {
  if (!LOGIN_COMPANIES.some(company => company.key === key)) throw new Error('INVALID_LOGIN_COMPANY');
  sessionStorage.setItem(PENDING_KEY, key);
};
export const clearLoginCompany = () => sessionStorage.removeItem(PENDING_KEY);
// Match only an authorized server choice; a public login label never grants access.
export const findLoginWorkspace = (workspaces, key) => {
  const company = LOGIN_COMPANIES.find(row => row.key === key);
  if (!company) return null;
  if (key === 'SYSTEM') return workspaces.find(row => row.key === 'system' && row.type === 'SYSTEM' && row.role === 'SYSTEM_ADMIN') || null;
  const normalize = value => String(value || '').trim().toUpperCase();
  const byCode = workspaces.filter(row => company.codes.includes(normalize(row.code)) && row.key?.startsWith('org:'));
  if (byCode.length) return byCode.length === 1 ? byCode[0] : null;
  const byName = workspaces.filter(row => company.names.includes(normalize(row.name)) && row.key?.startsWith('org:'));
  return byName.length === 1 ? byName[0] : null;
};
