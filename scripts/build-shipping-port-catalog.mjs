// Rebuild only the generated tail of the new, unshipped catalogue migration.
// Never run this against a migration that has already been deployed.
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory=process.argv[2];
if(!directory)throw Error('Pass the directory containing the official UN/LOCODE CSV parts.');
const parse=text=>{const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}else field+=c;}if(field||row.length){row.push(field);rows.push(row);}return rows;};
const ports=new Map(),sources=[],duplicates=[],dates=new Map();
for(const file of readdirSync(directory).filter(file=>/CodeListPart\d\.csv$/.test(file)).sort()){
 const raw=readFileSync(path.join(directory,file));sources.push({file,sha256:createHash('sha256').update(raw).digest('hex')});
 for(const row of parse(raw.toString('utf8'))){const [change,country,location,name,ascii,subdivision,functions,status,date,iata,coordinates]=row;
  if(change==='X'||!/^1/.test(functions||'')||!/^\w{2}$/.test(country||'')||!/^\w{3}$/.test(location||''))continue;
  const code=country+location,sourceDate=(Number(date.slice(0,2))>26?'19':'20')+date;
  if(ports.has(code)){duplicates.push({code,previous:ports.get(code),candidate:row});if((dates.get(code)||'')>=sourceDate)continue;}
  dates.set(code,sourceDate);
  ports.set(code,{code,country,name,ascii,subdivision,functions,status,iata,coordinates});
 }
}
if(ports.size<5000)throw Error('Incomplete source: expected a worldwide maritime catalogue.');
const quote=value=>"'"+value.replaceAll("'","''")+"'",file='backend/prisma/migrations/20261113080000_shipping_port_catalog/migration.sql',marker='-- GENERATED UN/LOCODE 2025-1 maritime locations';
let sql=readFileSync(file,'utf8').split(marker)[0]+marker+'\n';
const rows=[...ports.values()].sort((a,b)=>a.code.localeCompare(b.code));
for(let i=0;i<rows.length;i+=500)sql+='INSERT INTO "ShippingPort" (code,country,name,"asciiName",subdivision,functions,status,iata,coordinates,"sourceVersion") VALUES\n'+rows.slice(i,i+500).map(row=>'('+[...Object.values(row),'2025-1'].map(quote).join(',')+')').join(',\n')+'\nON CONFLICT (code) DO NOTHING;\n';
writeFileSync(file,sql);
mkdirSync('backend/data',{recursive:true});
writeFileSync('backend/data/shipping-ports-source.json',JSON.stringify({publisher:'United Nations Economic Commission for Europe (UNECE)',release:'2025-1',source:'https://unlocode.unece.org/publications/',download:'https://opensource.unicc.org/un/unece/uncefact/vocab-locode/-/jobs/artifacts/2025-1/download?job=package-release',license:'CC BY 4.0',filter:'Function 1 (maritime port), excluding change indicator X. Maritime locations, not a certification of container handling.',count:rows.length,sources},null,2)+'\n');
writeFileSync('backend/data/shipping-ports-duplicates.json',JSON.stringify({policy:'Same UN/LOCODE only: retain the newest source Date; keep first on equal dates. Original alternatives retained here.',duplicates},null,2)+'\n');
console.log(`Generated ${rows.length} maritime locations from official UN/LOCODE 2025-1; ${duplicates.length} duplicate-code alternatives retained.`);
