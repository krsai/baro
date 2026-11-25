import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('official HS 2022 selection contains only six-digit subheadings and retains its source',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../frontend/src/data/hs2022.json',import.meta.url),'utf8'));
 assert.equal(catalog.edition,'HS 2022');assert.equal(catalog.source,'https://comtradeapi.un.org/files/v1/app/reference/H6.json');assert.match(catalog.sha256,/^[a-f0-9]{64}$/);
 assert.equal(catalog.rows.length,5612);assert.equal(new Set(catalog.rows.map(row=>row.code)).size,catalog.rows.length);
 assert.ok(catalog.rows.every(row=>/^\d{6}$/.test(row.code)&&Number(row.code.slice(0,2))<=97&&row.name.trim()&&row.id===row.code));
 assert.match(catalog.rows.find(row=>row.code==='610910').name,/cotton/i);assert.ok(!catalog.rows.some(row=>row.code==='999999'));
});
