export const payrollPaymentToday = () => new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Ho_Chi_Minh'});

// Retirement preserves the payable and limits new salary payments only.
export function canPayRetiredEmployee(employee:any, date=payrollPaymentToday()) {
 if(employee?.status!=='TERMINATED')return true;
 if(!employee.leftAt)return false;
 const left=new Date(employee.leftAt);
 if(Number.isNaN(left.getTime()))return false;
 const deadline=new Date(Date.UTC(left.getUTCFullYear(),left.getUTCMonth()+2,0));
 return date<=deadline.toISOString().slice(0,10);
}
