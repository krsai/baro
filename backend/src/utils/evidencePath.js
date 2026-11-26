// Windows "Copy as path" wraps paths in quotes; those are not part of the path.
export function evidenceReference(value){
 const text=String(value??''),trimmed=text.trim(),quote=trimmed[0];
 if((quote==='"'||quote==="'")&&trimmed.at(-1)===quote){
  const path=trimmed.slice(1,-1);
  if(/^(?:[a-z]:[\\/]|\\\\|\/|https?:\/\/)/i.test(path))return path;
 }
 return text;
}

// Mirrored in backend/src/utils/evidencePath.js. Syntax only; never opens a file or URL.
export function validEvidencePath(value){
 if(typeof value!=='string')return false;
 const path=evidenceReference(value).trim();
 if(!path||path.length>500||/[\u0000-\u001f\u007f<>"|*]/.test(path))return false;
 if(/^https?:\/\//i.test(path)){
  try{const url=new URL(path);return Boolean(url.hostname&&!url.username&&!url.password&&url.pathname!=='/'&&!url.pathname.endsWith('/')&&!/\s|\\|%(?![a-f\d]{2})/i.test(path));}catch{return false;}
 }
 if(/[?]/.test(path)||/[\\/]$/.test(path))return false;
 let parts;
 if(/^[a-z]:[\\/]/i.test(path))parts=path.slice(3).split(/[\\/]/);
 else if(/^\\\\/.test(path)){parts=path.slice(2).split('\\');if(parts.length<3)return false;}
 else if(path.startsWith('/')&&!path.startsWith('//'))parts=path.slice(1).split('/');
 else return false;
 return parts.every(part=>part.trim()&&part!=='.'&&part!=='..'&&!part.includes(':'));
}
