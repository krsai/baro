import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {resolvePartnerIdentity,subscriberProfilePatch}=require('../backend/dist/services/entityProfile');
const {publicCompanyDetails}=require('../backend/dist/services/companyIdentity');
test('subscriber identity ignores local party-kind edits and only canonical public fields are copied',()=>{
 const company={subscriberOrgId:2,partyKind:'CORPORATE',code:'DEXL',name:'DEX',businessNumber:'123',email:'official@example.com',bankAccounts:[{accountNumber:'secret'}]};
 assert.deepEqual(resolvePartnerIdentity({partyKind:'INDIVIDUAL',businessNumber:'123'},'Local',{partyKind:'INDIVIDUAL',code:'OLD'},company),{partyKind:'CORPORATE',code:'OLD'});
 const patch=subscriberProfilePatch(company);assert.equal(patch.name,'DEX');assert.equal(patch.email,'official@example.com');assert.equal('bankAccounts' in patch,false);
 assert.deepEqual(subscriberProfilePatch({...company,subscriberOrgId:null}),{});
 assert.equal(resolvePartnerIdentity({partyKind:'CORPORATE',businessNumber:'123'},'Local',{partyKind:'INDIVIDUAL',code:null},{...company,partyKind:null}).partyKind,'CORPORATE');
});

test('missing subscriber kind accepts selection and preserves the local identity',()=>{
 const company={subscriberOrgId:2,partyKind:null,code:'DEXL'};
 const previous={id:44,partyKind:null,code:'DEXL',businessNumber:'123'};
 const selected=resolvePartnerIdentity({partyKind:'CORPORATE'},'DEX',previous,company);
 assert.deepEqual(selected,{partyKind:'CORPORATE',code:'DEXL'});
 assert.deepEqual(resolvePartnerIdentity({},'DEX',{...previous,...selected},company),selected);
 assert.equal(company.partyKind,null);
 assert.throws(()=>resolvePartnerIdentity({partyKind:'CORPORATE',businessNumber:''},'DEX',previous,company),/PARTNER_BUSINESS_NUMBER_REQUIRED/);
});
test('subscriber status is resolved from the current real active organization, not technical type alone',async()=>{
 let active=false;
 const db={organization:{findFirst:async({where})=>{assert.equal(where.ownerOrgId,null);assert.deepEqual(where.employees,{some:{status:'ACTIVE'}});return active?{id:2}:null;}}};
 assert.equal((await publicCompanyDetails(db,{id:2})).subscriberOrgId,null);active=true;assert.equal((await publicCompanyDetails(db,{id:2})).subscriberOrgId,2);
});
