// Whole-number 1/2/5 steps, including negative balances and an all-zero series.
export function balanceChartScale(values) {
 const finite=values.filter(Number.isFinite),minimum=Math.min(0,...finite),maximum=Math.max(0,...finite);
 const raw=Math.max(1,(maximum-minimum)/4),power=10**Math.floor(Math.log10(raw)),ratio=raw/power;
 const step=(ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*power;
 const low=Math.floor(minimum/step)*step,high=Math.max(low+step,Math.ceil(maximum/step)*step);
 const ticks=Array.from({length:Math.round((high-low)/step)+1},(_,index)=>low+index*step);
 return {low,high,step,ticks};
}
