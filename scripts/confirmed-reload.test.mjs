import test from 'node:test';
import assert from 'node:assert/strict';
import {isConfirmedReload,reloadAfterConfirmation} from '../frontend/src/utils/confirmedReload.mjs';
test('only an explicitly approved reload bypasses duplicate unload warnings and approval expires',async()=>{
 let reloads=0;
  assert.equal(isConfirmedReload(),false);
  reloadAfterConfirmation(()=>{reloads++;assert.equal(isConfirmedReload(),true);assert.equal(isConfirmedReload(),true,'all form listeners see the same approval');});
  assert.equal(reloads,1);await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(isConfirmedReload(),false,'later browser navigation remains protected');
});
