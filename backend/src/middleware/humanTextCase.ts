import type {RequestHandler} from 'express';
import {normalizeHumanPayload} from '../utils/humanTextCase';
import {createTextAcronymLoader} from '../services/textAcronyms';

// Normalize new input only. Responses, stored snapshots and authorization stay intact.
export const humanTextCaseInput:RequestHandler=(req,_res,next)=>{
 if(['POST','PUT','PATCH'].includes(req.method)&&req.is('application/json')&&req.body&&typeof req.body==='object'){
  req.body=normalizeHumanPayload(req.body,{path:req.path});
 }
 next();
};

export function createHumanTextCaseInput(db:any):RequestHandler{
 const load=createTextAcronymLoader(db);
 return async(req,res,next)=>{
  try{
   if(['POST','PUT','PATCH'].includes(req.method)&&req.is('application/json'))await load();
   humanTextCaseInput(req,res,next);
  }catch(error){next(error);}
 };
}
