import {AsYouType,parsePhoneNumberFromString,getCountryCallingCode,isSupportedCountry} from 'libphonenumber-js/min';

const phoneRegion=country=>country&&isSupportedCountry(country)?country:undefined;
export const countryCallingCode=country=>country&&isSupportedCountry(country)?'+'+getCountryCallingCode(country):'';
export const phoneInputCountry=value=>parsePhoneNumberFromString(String(value||''))?.country;

export function phoneInputDisplay(value,country){
 const text=String(value||''),{local}=splitEntityPhone(text,country);
 if(!/^[\d\s()+.-]*$/.test(local))return local;
 const parsed=text.startsWith('+')?parsePhoneNumberFromString(text):null;
 if(parsed?.isValid()){
  const formatted=parsed.formatNational();
  if(!local.replace(/\D/g,'').startsWith('0')||formatted.replace(/\D/g,'').startsWith('0'))return formatted;
 }
 return new AsYouType(phoneRegion(country)).input(local.replace(/\D/g,''));
}
export function phoneInputValue(typed,country,{localValue=false}={}){
 const text=String(typed||''),parsed=text.trimStart().startsWith('+')?parsePhoneNumberFromString(text):null;
 const digits=(text.trimStart().startsWith('+')?phoneInputDisplay(text.trimStart(),country||parsed?.country):text).replace(/\D/g,'');
 if(localValue||!digits)return digits;
 const number=parsePhoneNumberFromString(digits,phoneRegion(country)||parsed?.country);
 if(number?.isValid()&&number.formatNational().replace(/\D/g,'')===digits)return '+'+number.countryCallingCode+' '+number.nationalNumber;
 return [countryCallingCode(country)||(parsed?'+'+parsed.countryCallingCode:''),digits].filter(Boolean).join(' ');
}
export const phoneExample=country=>({KR:'010-1234-5678',VN:'0912 345 678'}[country]||'');

export function displayEntityPhone(value,country){
 const phone=String(value||'');
 if(!phone)return '';
 const parsed=parsePhoneNumberFromString(phone,phoneRegion(country));
 if(parsed?.isValid())return '+'+parsed.countryCallingCode+' '+phoneInputDisplay(phone,country||parsed.country);
 return phone.startsWith('+')?phone:[countryCallingCode(country),phone].filter(Boolean).join(' ');
}

export function splitEntityPhone(value, country) {
  const phone = String(value || '');
  const expected = countryCallingCode(country);
  const prefix = phone.startsWith('+')
    ? (expected && phone.startsWith(expected) ? expected : (()=>{const formatter=new AsYouType();formatter.input(phone);return formatter.getCallingCode()?'+'+formatter.getCallingCode():'';})())
    : expected;
  return { prefix, local: phone.startsWith('+') ? phone.slice(prefix.length).trimStart() : phone };
}

export function phoneForCountry(value, previousCountry, country) {
  if (!value) return '';
  const { local } = splitEntityPhone(value, previousCountry);
  return [countryCallingCode(country), local].filter(Boolean).join(' ');
}
