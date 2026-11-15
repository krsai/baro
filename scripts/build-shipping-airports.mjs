import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=readFileSync(process.argv[2]),rows=[];
let row=[],field='',quoted=false;
const csv=raw.toString('utf8');
for(let i=0;i<csv.length;i++){
 const c=csv[i];
 if(c==='"'){if(quoted&&csv[i+1]==='"'){field+='"';i++;}else quoted=!quoted;continue;}
 if(c===','&&!quoted){row.push(field);field='';continue;}
 if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';continue;}
 field+=c;
}
const header=rows.shift(),at=key=>header.indexOf(key);
const scope=JSON.parse(readFileSync('backend/data/shipping-airports-scope.json','utf8'));
const airports=rows.filter(r=>['large_airport','medium_airport','small_airport'].includes(r[at('type')])&&scope.codes.includes(r[at('iata_code')])).map(r=>({id:r[at('ident')],code:r[at('iata_code')],name:r[at('name')],country:r[at('iso_country')],city:r[at('municipality')],icao:r[at('icao_code')]||r[at('gps_code')]})).sort((a,b)=>a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
if(airports.length!==scope.codes.length||!airports.some(r=>r.code==='ICN')||!airports.some(r=>r.code==='SGN'))throw Error('Incomplete airport catalogue');
writeFileSync('backend/data/shipping-airports.json',JSON.stringify(airports)+'\n');
writeFileSync('backend/data/shipping-airports-source.json',JSON.stringify({publisher:'OurAirports',source:'https://ourairports.com/data/',download:'https://raw.githubusercontent.com/datasets/airport-codes/main/archive/data.csv',retrieved:new Date().toISOString(),license:'Public domain',sha256:createHash('sha256').update(raw).digest('hex'),filter:'Explicit IATA shortlist in shipping-airports-scope.json; excludes closed facilities, heliports and seaplane bases. Codes are search labels, not unique record identifiers.',count:airports.length},null,2)+'\n');
console.log('Generated airport catalogue:',airports.length);
