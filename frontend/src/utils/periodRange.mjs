// Inclusive date filters select intersecting monthly documents without rewriting their snapshots.
export function periodMonthKeys(startValue,endValue){
 const start=String(startValue||'').slice(0,10),end=String(endValue||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)return [];
 if([start,end].some(value=>!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))return [];
 const keys=[];let year=Number(start.slice(0,4)),month=Number(start.slice(5,7));
 if(month<1||month>12)return [];
 while(year+'-'+String(month).padStart(2,'0')<=end.slice(0,7)){
  keys.push(year+'-'+String(month).padStart(2,'0'));month++;if(month===13){year++;month=1;}
 }
 return keys;
}
export const periodMonthNote={ko:'선택한 기간에 포함된 월별 자료입니다. 계산·확정은 각 월 전체를 기준으로 하며 기존 확정 내역은 유지됩니다.',en:'Monthly records overlapping the selected dates. Calculation and confirmation cover each full month; existing confirmed records are preserved.',vi:'Dữ liệu tháng giao với khoảng ngày đã chọn. Tính và xác nhận theo cả tháng; giữ nguyên dữ liệu đã xác nhận.'};
