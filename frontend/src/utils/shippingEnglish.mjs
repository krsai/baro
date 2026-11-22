export function shippingEnglishValid(value,previous={},keys=['name','address','contactName']){
 return keys.every(key=>{
  const text=value?.[key];
  return typeof text!=='string'||text.trim()===String(previous?.[key]??'').trim()||!/[\r\n]/.test(text)&&![...text].some(char=>/\p{L}/u.test(char)&&!/\p{Script=Latin}/u.test(char));
 });
}
export const shippingEnglishText={ko:'이름·담당자·주소는 영문으로 입력해 주세요.',en:'Enter names, contacts and addresses in English.',vi:'Nhập tên, người liên hệ và địa chỉ bằng tiếng Anh.'};
