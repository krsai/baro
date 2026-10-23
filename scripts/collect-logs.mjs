import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const logRoot=path.resolve(root,'logs');
const inside=(parent,file)=>file.startsWith(parent+path.sep);
if(!inside(root,logRoot))throw Error('Log destination must stay inside workspace');
fs.mkdirSync(logRoot,{recursive:true});
const excluded=new Set(['.git','node_modules','backups','logs']);
const files=[];
function visit(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;
  const source=path.resolve(directory,entry.name);
  if(!inside(root,source))throw Error('Log source must stay inside workspace');
  if(entry.isDirectory()){if(!excluded.has(entry.name))visit(source);}
  else if(/\.log(?:\.\d+)?$/i.test(entry.name))files.push(source);
 }
}
visit(root);
let moved=0;
for(const source of files){
 let destination=path.resolve(logRoot,path.relative(root,source));
 if(!inside(logRoot,destination))throw Error('Log target must stay inside log folder');
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 if(fs.existsSync(destination)){
  const extension=path.extname(destination),stem=destination.slice(0,-extension.length);let copy=1;
  while(fs.existsSync(`${stem}.${copy}${extension}`))copy++;
  destination=`${stem}.${copy}${extension}`;
 }
 try{fs.renameSync(source,destination);moved++;console.log(path.relative(root,source)+' -> '+path.relative(root,destination));}
 catch(error){console.error('Could not move '+path.relative(root,source)+' ('+error.code+'); close the writer and rerun.');process.exitCode=1;}
}
console.log(`Collected ${moved} log files in logs/.`);
