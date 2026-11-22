export const countryCallingCode = country => ({ KR: '+82', VN: '+84' }[country] || '');

export function displayEntityPhone(value,country){
 const phone=String(value||'');
 return !phone||phone.startsWith('+')?phone:[countryCallingCode(country),phone].filter(Boolean).join(' ');
}

export function splitEntityPhone(value, country) {
  const phone = String(value || '');
  const expected = countryCallingCode(country);
  const prefix = phone.startsWith('+')
    ? (expected && phone.startsWith(expected) ? expected : phone.match(/^\+\d{1,3}/)?.[0] || '')
    : expected;
  return { prefix, local: phone.startsWith('+') ? phone.slice(prefix.length).trimStart() : phone };
}

export function phoneForCountry(value, previousCountry, country) {
  if (!value) return '';
  const { local } = splitEntityPhone(value, previousCountry);
  return [countryCallingCode(country), local].filter(Boolean).join(' ');
}
