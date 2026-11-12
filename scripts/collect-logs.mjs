import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const LOG_LIMITS=Object.freeze({maxFiles:20,maxBytes:10*1024*1024,maxAgeDays:14});
const logName=name=>/\.log(?:\.\d+)?$/i.test(name);
const inside=(parent,file)=>file.startsWith(parent+path.sep);
const excluded=new Set(['.git','node_modules','backups','backup','originals']);

// Scope is deliberately limited to top-level development logs and logs/.
// No runtime, database, backup, JSON, Markdown or source-file cleanup.
export function scanDevelopmentLogs(workspace){
 const root=fs.realpathSync(workspace),logRoot=path.join(root,'logs'),files=[];
 const visit=(directory,recurse)=>{
  if(!fs.existsSync(directory)||fs.lstatSync(directory).isSymbolicLink())return;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
   if(entry.isSymbolicLink())continue;
   const file=path.join(directory,entry.name);
   if(entry.isDirectory()){if(recurse&&!excluded.has(entry.name))visit(file,true);}
   else if(entry.isFile()&&logName(entry.name)){const stat=fs.statSync(file);files.push({file,bytes:stat.size,mtimeMs:stat.mtimeMs});}
  }
 };
 visit(root,false);visit(logRoot,true);
 return files;
}

export function rootDevelopmentLogs(workspace){
 const root=fs.realpathSync(workspace);
 return fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isFile()&&logName(entry.name)).map(entry=>entry.name).sort();
}

function assertLogPath(root,file){
 const resolved=path.resolve(file),logRoot=path.join(root,'logs');
 if(!logName(path.basename(resolved))||!(path.dirname(resolved)===root||inside(logRoot,resolved)))throw Error('Development log path is outside the allowed scope');
 const actual=fs.realpathSync(resolved);
 if(actual!==resolved||fs.lstatSync(resolved).isSymbolicLink()||!fs.lstatSync(resolved).isFile())throw Error('Refusing linked or non-file log');
}

export function planLogCleanup(workspace,options={}){
 const limits={...LOG_LIMITS,...options},now=options.now??Date.now();
 if(!Number.isSafeInteger(limits.maxFiles)||limits.maxFiles<0||!Number.isSafeInteger(limits.maxBytes)||limits.maxBytes<0||!Number.isFinite(limits.maxAgeDays)||limits.maxAgeDays<0)throw Error('Invalid log retention limits');
 const files=scanDevelopmentLogs(workspace).sort((a,b)=>b.mtimeMs-a.mtimeMs||a.file.localeCompare(b.file));
 const keep=[],remove=[];let bytes=0;
 for(const file of files){
  if(options.all||now-file.mtimeMs>limits.maxAgeDays*86400000||keep.length>=limits.maxFiles||bytes+file.bytes>limits.maxBytes)remove.push(file);
  else{keep.push(file);bytes+=file.bytes;}
 }
 return {keep,remove};
}

export function cleanDevelopmentLogs(workspace,options={}){
 const root=fs.realpathSync(workspace),plan=planLogCleanup(root,options),failures=[];let removed=0;
 if(!options.dryRun)for(const item of plan.remove){try{assertLogPath(root,item.file);fs.unlinkSync(item.file);removed++;}catch(error){failures.push({file:path.relative(root,item.file),code:error.code||'UNSAFE_PATH'});}}
 return {scanned:plan.keep.length+plan.remove.length,removed,wouldRemove:plan.remove.length,removedBytes:options.dryRun?0:plan.remove.filter(item=>!failures.some(f=>f.file===path.relative(root,item.file))).reduce((sum,item)=>sum+item.bytes,0),failures};
}

export function collectDevelopmentLogs(workspace){
 const root=fs.realpathSync(workspace),logRoot=path.join(root,'logs'),failures=[];let moved=0,discardedOlder=0;
 if(fs.existsSync(logRoot)&&fs.lstatSync(logRoot).isSymbolicLink())throw Error('Refusing linked log directory');
 fs.mkdirSync(logRoot,{recursive:true});
 for(const item of scanDevelopmentLogs(root).filter(item=>path.dirname(item.file)===root)){
  try{
   assertLogPath(root,item.file);const destination=path.join(logRoot,path.basename(item.file));
   if(fs.existsSync(destination)){
    assertLogPath(root,destination);
    if(fs.statSync(destination).mtimeMs>item.mtimeMs){fs.unlinkSync(item.file);discardedOlder++;continue;}
   }
   fs.renameSync(item.file,destination);moved++;
  }catch(error){failures.push({file:path.relative(root,item.file),code:error.code||'UNSAFE_PATH'});}
 }
 return {moved,discardedOlder,failures};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const flags=process.argv.slice(2);if(flags.some(flag=>!['--clean','--all','--dry-run','--check'].includes(flag)))throw Error('Use --clean, --all, --dry-run or --check');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dryRun=flags.includes('--dry-run');
  if(flags.includes('--check')){
   if(flags.length!==1)throw Error('Use --check on its own');
   const files=rootDevelopmentLogs(root);
   if(files.length){console.error(`Root development logs found (${files.length}). Move them to logs/; use npm run logs:collect to collect with retention cleanup.`);process.exitCode=1;}
   else console.log('Log location check passed: no development logs in the repository root.');
  }else{
  const collection=flags.includes('--clean')||flags.includes('--all')||dryRun?null:collectDevelopmentLogs(root);
  const cleanup=cleanDevelopmentLogs(root,{all:flags.includes('--all'),dryRun});
  console.log(JSON.stringify({dryRun,limits:LOG_LIMITS,collection,cleanup}));
  if(collection?.failures.length||cleanup.failures.length)process.exitCode=1;
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
}
