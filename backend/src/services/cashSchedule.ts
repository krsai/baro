import {createHttpError} from '../utils/http';

// A business date, not a timestamp or evidence of payment.
export function cashScheduleDate(value:unknown):string|null {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01')throw createHttpError(400,'INVALID_CASH_SCHEDULE_DATE');
  const date=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw createHttpError(400,'INVALID_CASH_SCHEDULE_DATE');
  return value;
}
