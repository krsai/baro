// Windows "Copy as path" wraps paths in quotes; those are not part of the path.
export function evidenceReference(value){
 const text=String(value??''),trimmed=text.trim(),quote=trimmed[0];
 if((quote==='"'||quote==="'")&&trimmed.at(-1)===quote){
  const path=trimmed.slice(1,-1);
  if(/^(?:[a-z]:[\\/]|\\\\|\/|https?:\/\/)/i.test(path))return path;
 }
 return text;
}
