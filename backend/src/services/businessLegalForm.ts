import {createHttpError} from '../utils/http';
export function businessLegalForm(value:unknown):string|null|undefined{
 if(value===undefined)return undefined;
 if(value===null||value==='')return null;
 if(value==='CORPORATION'||value==='SOLE_PROPRIETOR')return value;
 throw createHttpError(400,'INVALID_BUSINESS_LEGAL_FORM');
}
