import {spawn} from 'node:child_process';
// Isolated local browser fixtures; no operational data or migration commands.
const suites=[
 ['shipping-requests-browser'],['freight-jobs-browser'],
 ['brand-sewing-browser'],['work-lookup-review-browser'],['work-style-overview-browser'],
 ['style-product-ownership-browser'],['process-version-protection-browser'],['order-layout-drag-browser'],
 ['expense-editor-browser','--lookup-only'],['ledger-flow-lookup-browser'],
 ['keyboard-actions-browser'],['workspace-tabs-browser'],['business-accounts-browser'],['dashboard-widgets-browser'],['work-time-approval-settings-browser'],
 ['employee-salary-preview-browser'],['holiday-leave-browser'],['work-time-requests-browser'],['payroll-management-browser'],
];
const results=[];
const requested=process.argv.slice(2);
if(requested.some(name=>!suites.some(row=>row[0]===name)))throw Error('Unknown domain suite');
if(requested.length)for(let i=suites.length-1;i>=0;i--)if(!requested.includes(suites[i][0]))suites.splice(i,1);
async function worker(){while(suites.length){const [name,...args]=suites.shift();console.log('CHECK',name);const code=await new Promise(resolve=>{const child=spawn(process.execPath,['scripts/'+name+'.test.mjs',...args],{stdio:'inherit',windowsHide:true});child.once('error',error=>{console.error(error.message);resolve(1);});child.once('exit',code=>resolve(code??1));});results.push({name,code});}}
// Cold Vite compilation of large sewing pages exceeds navigation deadlines
// when several suites build their dependency graphs at the same time.
await worker();
console.log('Domain browser results:',JSON.stringify(results));
if(results.some(row=>row.code))process.exitCode=1;
