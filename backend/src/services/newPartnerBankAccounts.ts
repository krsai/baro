import {createHttpError} from '../utils/http';
import {saveEntityBankAccount} from './entityBankAccount';

export async function saveNewPartnerBankAccounts(tx:any,orgId:number,actorId:number,entityId:number,accounts:any){
 if(!Array.isArray(accounts)||accounts.length>20)throw createHttpError(400,'INVALID_BANK_ACCOUNT');
 for(const account of accounts){
  if(!account||typeof account!=='object'||account.id!=null||account.orgId!=null||account.entityId!=null)throw createHttpError(400,'INVALID_BANK_ACCOUNT');
  await saveEntityBankAccount(tx,orgId,actorId,entityId,null,account);
 }
}
