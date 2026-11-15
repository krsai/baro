import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{searchShippingAirports}=require('../backend/dist/services/shippingAirports'),{shippingRouteFields}=require('../backend/dist/services/shippingRoute'),{transportSnapshot}=require('../backend/dist/services/transportExchange');
test('airport lookup searches IATA, ICAO, name and city with bounded literal results',()=>{
 assert.equal(searchShippingAirports('ICN').rows[0].code,'ICN');
 assert.ok(searchShippingAirports('Incheon').rows.some(row=>row.code==='ICN'));
 assert.ok(searchShippingAirports('RKSI').rows.some(row=>row.code==='ICN'));
 assert.ok(searchShippingAirports('Ho Chi Minh').rows.some(row=>row.code==='SGN'));
 assert.deepEqual(searchShippingAirports('%').rows,[]);
 assert.equal(searchShippingAirports('').rows.length,200);
 assert.equal(searchShippingAirports('').hasMore,true);
 assert.throws(()=>searchShippingAirports('x'.repeat(161)),/SHIPPING_INVALID/);
});
test('trucking terminal selections remain route addresses through validation and public snapshot',()=>{
 const data={workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},routeLocations:{ORIGIN_DOOR:'Haiphong (VNHPH)',DESTINATION_DOOR:'Incheon International Airport (ICN)'},routeLocationDetails:{ORIGIN_DOOR:{label:'Pickup terminal',contactName:'Kim',phone:'123'}}};
 const result=shippingRouteFields(data,'ROAD');
 assert.equal(result.origin,data.routeLocations.ORIGIN_DOOR);
 assert.equal(result.destination,data.routeLocations.DESTINATION_DOOR);
 assert.deepEqual(transportSnapshot({mode:'ROAD',data:{...data,...result}}).data.routeLocations,data.routeLocations);
});
