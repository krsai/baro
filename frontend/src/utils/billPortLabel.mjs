const countries=new Intl.DisplayNames(['en'],{type:'region'});
// Code is an actual selected port identifier. Never change it or match ports by name.
export function billPortLabel(value,code){
 const text=String(value||'').trim(),suffix=/\s*\(([A-Za-z]{2}[A-Za-z0-9]{3})\)\s*$/.exec(text);
 const selected=code||suffix?.[1]?.toUpperCase();
 if(!selected||! /^[A-Z]{2}[A-Z0-9]{3}$/.test(selected))return text.toUpperCase();
 const name=suffix&&suffix[1].toUpperCase()===selected?text.slice(0,suffix.index).trim():text;
 if(!name||name.toUpperCase()===selected)return text.toUpperCase();
 const region=selected.slice(0,2),country=region==='KR'?'KOREA':countries.of(region)?.toUpperCase();
 if(!country||country===region)return name.toUpperCase();
 if(name.toUpperCase().endsWith(', '+country))return name.toUpperCase();
 return `${name.toUpperCase()}, ${country}`;
}
