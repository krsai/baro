import type {RequestHandler} from 'express';
import {normalizeHumanPayload} from '../utils/humanTextCase';

// Normalize new input only. Responses, stored snapshots and authorization stay intact.
export const humanTextCaseInput:RequestHandler=(req,_res,next)=>{
 if(['POST','PUT','PATCH'].includes(req.method)&&req.is('application/json')&&req.body&&typeof req.body==='object'){
  req.body=normalizeHumanPayload(req.body,{path:req.path});
 }
 next();
};
