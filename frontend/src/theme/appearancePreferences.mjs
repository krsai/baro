import {buildPersonalPreferencesKey} from '../utils/personalPreferences.js';
const EVENT='baro:appearance-changed';
const temporary=new Map();
export const appearanceKey=(profile,user)=>buildPersonalPreferencesKey(profile,user)+':appearance';
export const normalizeAppearance=value=>value==='compact'?'compact':'standard';
export function readAppearance(key){
 if(temporary.has(key))return temporary.get(key);
 try{return normalizeAppearance(window.localStorage.getItem(key));}catch{return 'standard';}
}
export function writeAppearance(key,value){
 const next=normalizeAppearance(value);
 try{window.localStorage.setItem(key,next);temporary.delete(key);}catch{temporary.set(key,next);}
 window.dispatchEvent(new Event(EVENT));
}
export function subscribeAppearance(callback){
 const storage=event=>{if(event.key===null||event.key?.endsWith(':appearance')){if(event.key===null)temporary.clear();else temporary.delete(event.key);callback();}};
 window.addEventListener(EVENT,callback);window.addEventListener('storage',storage);
 return()=>{window.removeEventListener(EVENT,callback);window.removeEventListener('storage',storage);};
}
