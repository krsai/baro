import {Prisma} from '@prisma/client';
import {parseVolumeInput} from './volumeFormula';
import {createHttpError} from './http';
export function validateVolumeFormula(value:any,formula:any,code='FREIGHT_INVALID_INPUT'){
 if(formula===undefined||formula==='')return '';
 const parsed=typeof formula==='string'&&formula.trim().startsWith('=')?parseVolumeInput(formula):null;
 if(!parsed||value==null||!/^\d+(?:\.\d+)?$/.test(String(value))||!new Prisma.Decimal(String(value)).equals(parsed.cbm))throw createHttpError(400,code);
 return parsed.cbmFormula;
}
