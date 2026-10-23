export const latestRecordedMonthEnd = months => {
 const latest=(Array.isArray(months)?months:[]).filter(value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value)).sort().at(-1);
 if(!latest)return '';
 const [year,month]=latest.split('-').map(Number);
 return `${latest}-${String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0')}`;
};

export const clampRecordedRange = (start,end,maximum) => {
 if(!maximum)return {dateFrom:'',dateTo:''};
 const dateTo=!end||end>maximum?maximum:end;
 const dateFrom=!start||start>dateTo?dateTo.slice(0,7)+'-01':start;
 return {dateFrom,dateTo};
};
