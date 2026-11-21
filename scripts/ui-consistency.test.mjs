import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {auditUi} from './check-ui-consistency.mjs';
const directory=mkdtempSync(path.join(tmpdir(),'baro-ui-audit-'));
try{
 writeFileSync(path.join(directory,'Example.jsx'),`import {Autocomplete,Alert} from '@mui/material';export default ()=> <><Table><TableBody>{!rows.length&&<TableRow><TableCell colSpan={3}>No data</TableCell></TableRow>}</TableBody></Table><Stack><Button disabled={page===1} onClick={previous}>Previous</Button><Button disabled={!next} onClick={next}>Next</Button></Stack><Autocomplete/><select/></>`);
 const result=auditUi(directory);
 assert.equal(result.inlineStatusRows.length,1);assert.equal(result.inlinePagination.length,1);assert.equal(result.rawAlerts.length,1);assert.equal(result.muiAutocomplete.length,1);assert.equal(result.nativeSelects.length,1);
 writeFileSync(path.join(directory,'Example.jsx'),`import Autocomplete from './SearchableSelect';export default ()=> <><Table><TableBody><TableStatusRow colSpan={3}/><TableRow><TableCell colSpan={3}><Collapse><Table/></Collapse></TableCell></TableRow><TableRow data-ledger-row-error><TableCell colSpan={3}>{error}</TableCell></TableRow></TableBody></Table><ListPagination/><Autocomplete/></>`);
 const shared=auditUi(directory);assert.equal(shared.inlineStatusRows.length,0);assert.equal(shared.muiAutocomplete.length,0);assert.equal(shared.sharedStatusRows,1);assert.equal(shared.sharedPagination,1);
 const repo=auditUi();for(const key of ['inlineStatusRows','inlinePagination','rawAlerts','muiAutocomplete','nativeSelects'])assert.equal(repo[key].length,0,key);
 console.log('PASS: UI audit catches duplicated status/pagination/select/notice implementations and preserves business detail rows.');
}finally{rmSync(directory,{recursive:true,force:true});}
