import test from 'node:test';
import assert from 'node:assert/strict';
import {splitEntityPhone,phoneForCountry,displayEntityPhone,phoneInputDisplay,phoneInputValue} from '../frontend/src/utils/entityPhone.mjs';

test('international phone edits preserve subscriber digits and avoid duplicate prefixes', () => {
  assert.deepEqual(splitEntityPhone('+84 08555 00100', 'VN'), { prefix: '+84', local: '08555 00100' });
  assert.deepEqual(splitEntityPhone('+821012345678', 'KR'), { prefix: '+82', local: '1012345678' });
  assert.equal(phoneForCountry('+84 08555 00100', 'VN', 'KR'), '+82 08555 00100');
  assert.equal(phoneForCountry('08555 00100', 'VN', 'KR'), '+82 08555 00100');
  assert.equal(phoneForCountry('', 'VN', 'KR'), '');
  assert.deepEqual(splitEntityPhone('+82 12345', 'VN'), { prefix: '+82', local: '12345' });
  assert.equal(displayEntityPhone('0901234567','VN'),'+84 0901 234 567');
  assert.equal(displayEntityPhone('+82 0101234','VN'),'+82 0101234');
  assert.equal(displayEntityPhone('0101234',''),'0101234');
  assert.equal(displayEntityPhone('','KR'),'');
});

test('domestic entry formats by number type and removes only the country-specific trunk prefix internationally',()=>{
 for(const [country,input,display,stored]of [
  ['KR','01012345678','010-1234-5678','+82 1012345678'],
  ['KR','07012345678','070-1234-5678','+82 7012345678'],
  ['KR','021234567','02-123-4567','+82 21234567'],
  ['VN','0912345678','0912 345 678','+84 912345678'],
  ['IT','0212345678','02 1234 5678','+39 0212345678'],
 ]){
  assert.equal(phoneInputDisplay(input,country),display);
  assert.equal(phoneInputValue(input,country),stored);
  assert.equal(phoneInputDisplay(stored,country),display);
  assert.equal(phoneInputValue(input,country,{localValue:true}),input);
 }
 assert.equal(phoneInputValue('+82 10-1234-5678','KR',{localValue:true}),'01012345678');
 assert.equal(phoneInputValue('010-1234-5678abc','KR'),'+82 1012345678');
 assert.equal(phoneInputValue('0','KR',{localValue:true}),'0');
  for(let i=1;i<=11;i++){
   const typed='01012345678'.slice(0,i);
   assert.equal(phoneInputDisplay(phoneInputValue(typed,'KR'),'KR').replace(/\D/g,''),typed);
  }
  assert.equal(phoneInputDisplay('+82 0101234','KR'),'010-1234');
  assert.equal(displayEntityPhone('01012345678','KR'),'+82 010-1234-5678');
  assert.equal(displayEntityPhone('+821012345678','KR'),'+82 010-1234-5678');
 assert.equal(phoneInputValue('','KR'),'');
 assert.equal(phoneInputDisplay('Historical contact text','KR'),'Historical contact text');
  assert.equal(phoneInputDisplay('01012345678','Legacy country name'),'01012345678');
 assert.deepEqual(splitEntityPhone('+84912345678',''),{prefix:'+84',local:'912345678'});
});
