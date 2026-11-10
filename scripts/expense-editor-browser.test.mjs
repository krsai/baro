import {expensePaymentText} from '../frontend/src/constants/expensePaymentSchedule.js';
const layoutOnly=process.argv.includes('--layout-only');
import {cashScheduleText} from '../frontend/src/constants/cashSchedule.js';
const scheduleOnly=process.argv.includes('--schedule-only');
const lookupOnly=process.argv.includes('--lookup-only')||process.env.EXPENSE_EDITOR_LOOKUP_ONLY==='1';
import {documentNumberText} from '../frontend/src/constants/documentNumber.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { EXPENSE_REQUEST_TEXT, EXPENSE_HEADER_TEXT } from '../frontend/src/constants/expenseRequest.js';
import {expenseHeaderActions} from '../frontend/src/constants/expenseHeaderActions.js';
import { ENTITY_TEXT } from '../frontend/src/constants/entityProfile.js';
import { EXPENSE_LOOKUP_TEXT } from '../frontend/src/constants/expenseLookup.js';
import { expenseCodeDescription } from '../frontend/src/utils/expenseCodePresentation.mjs';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/expense-editor-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useNavigate,useOutlet} from 'react-router-dom';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Entry from '/src/pages/App/TransactionRequestEntry.jsx';
function RetainedWorkspace(){const outlet=useOutlet();const cached=React.useRef(outlet);const navigate=useNavigate();window.changeWorkspace=path=>{window.expenseBackground=path==='/dashboard';navigate(path);};return cached.current;}
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/outsourcing-record/edit/legacy/78']},React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Routes,null,React.createElement(Route,{path:'/',element:React.createElement(RetainedWorkspace)},React.createElement(Route,{path:'/outsourcing-record/edit/:sourceKind/:sourceId',element:React.createElement(Entry)}),React.createElement(Route,{path:'/dashboard',element:React.createElement('div',null,'Dashboard')}))))));</script></body></html>`);
const port=43209,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/expense-editor-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const mode of (layoutOnly?['GENERAL']:lookupOnly?['GENERAL','PROCESS']:((scheduleOnly?['SAVED']:process.env.EXPENSE_EDITOR_MODES?.split(','))||['GENERAL','PROCESS','SAVED','BACKGROUND','BANKLESS'])))for(const lang of mode==='BACKGROUND'?['ko']:['ko','en','vi'])for(const locked of layoutOnly||['SAVED','BACKGROUND','BANKLESS'].includes(mode)?[false]:[false,true]) {
    console.log('Checking expense editor',mode,lang,locked);
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],requests=[],attempts=[];let submitted,releaseSave,registeredBanks=[];const saveGate=new Promise(resolve=>{releaseSave=resolve;});
    let releaseDocument,releaseCatalog,settingsReads=0;
    const documentGate=new Promise(resolve=>{releaseDocument=resolve;}),catalogGate=new Promise(resolve=>{releaseCatalog=resolve;});
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    page.on('request',r=>{if(r.url().includes('/work-logs'))requests.push(r.url());});
    await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,activeOrgRole:"ADMIN",accessProfile:{orgName:"BARO",employeeName:"Current editor"}});'}));
    await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route('**/src/context/ManagementPeriodContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useManagementPeriod=()=>({startDate:"2026-04-01",loading:false});'}));
    await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:(path,options)=>{document.documentElement.dataset.saved="true";window.expenseNavigations=(window.expenseNavigations||[]).concat([{path,options}]);},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
    await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useRequestScopeContext=()=>({active:!window.expenseBackground,scopeId:"/outsourcing-record/edit/legacy/78"});'}));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const service={isActive:true,entryMode:['SAVED','BACKGROUND'].includes(mode)?'GENERAL':mode,requiredFields:[],expenseTypeId:1,serviceTypeId:4};
    const mocks={'expense-units':[{id:1,code:'PCS',nameKo:'개',nameEn:'Piece',nameVi:'Cái',isActive:true}], 'business-partners':[{id:11,name:'Selected vendor',type:'PROCESS_OUTSOURCING',contactName:'Accounts desk',contactPhone:'0901234567',isActive:true,partnerExpenseTypeId:1,serviceTypes:[{id:44,systemDefaultId:4,nameKo:'\uB2E8\uCD94\uAD6C\uBA4D',nameEn:'Buttonhole',nameVi:'Th\u00f9a khuy'}]}],
      'transaction-codes':[{id:7,code:'BTHE',nameKo:'Buttonhole',nameEn:'Buttonhole',nameVi:'Buttonhole',isActive:true,vatEnabled:false,serviceTypeId:4,base:service}],
      'orders':[{id:'public-30',dbId:30,ownerOrgId:1,orderNumber:'L17-1'}], 'app-settings':{defaultVatRate:'10'} };
    await page.route('**/expense-payees?*',r=>r.fulfill({headers,json:mocks['business-partners']}));
    const role={id:3,code:'PROCESS_OUTSOURCING',nameEn:'Production outsourcing'},industry={id:4,code:'BUTTONHOLE',nameEn:'Buttonhole',partnerRoleId:3,partnerRole:role};
    await page.route('**/partner-classifications/options?*',r=>r.fulfill({headers,json:{roles:[role],industries:[industry]}}));
    await page.route('**/partner-classifications/11?*',r=>r.fulfill({headers,json:{revision:2,roleIds:[3],industryIds:[4],industries:[industry],legacyGeneral:[]}}));
    for(const [endpoint,json] of Object.entries(mocks))await page.route(`**/${endpoint}?*`,async r=>{if(mode==='SAVED'&&endpoint==='orders')await catalogGate;return r.fulfill({headers,json});});
    await page.route('**/outsourcing-service-types?*',r=>r.fulfill({headers,json:mocks['business-partners'][0].serviceTypes}));
    const profileWrites=[];
    await page.route('**/business-partners/11?*',r=>{
      if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
      const body=r.request().postDataJSON();profileWrites.push(body);
      if(lang==='ko'&&profileWrites.length===1)return r.fulfill({headers,status:500,json:{error:'temporary profile error'}});
      return r.fulfill({headers,json:{...mocks['business-partners'][0],...body}});
    });
    await page.route('**/expense-request-editor/legacy/78?*',async r=>{
      if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});
      if(r.request().method()==='PUT'){if(mode==='SAVED'){submitted=r.request().postDataJSON();return r.fulfill({headers,status:409,json:{error:'EXPENSE_REQUEST_CHANGED'}});}submitted=r.request().postDataJSON();attempts.push(submitted);if(mode==='BACKGROUND')await saveGate;if(mode==='PROCESS'&&lang==='ko'&&attempts.length===1)return r.fulfill({headers,status:500,json:{error:'internal server error'}});return r.fulfill({headers,json:{requestId:1}});}
      if(mode==='SAVED')await documentGate;
      return r.fulfill({headers,json:{scheduledPaymentDate:scheduleOnly?'2026-12-10':null,managementNumber:mode==='SAVED'?'EXP-2026-000008':'',remark:'',approvalSelection:mode==='SAVED'?{seniorEmployeeId:21}:null,approverEmployeeIds:[],canonicalSource:mode==='SAVED'?{kind:'request',id:'18'}:{kind:'legacy',id:'78'},requestDate:'2026-07-31',partnerOrgId:11,partner:{id:11,name:'Selected vendor'},createdByEmployee:{id:21,name:'Original author'},revision:'server-revision',version:mode==='SAVED'?3:null,updatedAt:mode==='SAVED'?'2026-10-19T09:00:00Z':null,updatedByEmployee:mode==='SAVED'?{id:20,name:'Latest editor'}:null,readOnly:locked,
        items:[{sourceRecordId:78,itemId:null,transactionCodeId:mode==='SAVED'?7:'',currency:'VND',quantity:'170',unitPrice:'3000',vatRate:'0',description:'Original buttonhole expense',details:{reference:'REF-001'},workOrderId:30,styleId:40,styleProcessId:50,assignmentPlanId:60,productionLinked:true,productionLocked:mode==='PROCESS',enabled:{order:true,style:true,process:true},
          preservedReferences:{order:{id:30,orderNumber:'L17-1'},style:{id:40,name:'Shirt',code:'AM02058',styleProcesses:[{id:50,processName:'Buttonhole',processCode:'BH'}]},plan:{id:60,styleId:40,processIds:[50]}}}]}});
    });
    await page.route('**/transaction-request-options?*',r=>r.fulfill({headers,json:{styles:[{id:40,name:'Shirt',code:'AM02058',styleProcesses:[{id:51,processName:'Buttonhole second',processCode:'BH2'}]}],plans:[{id:61,styleId:40,processIds:[51],factoryName:'Factory A'}]}}));
    await page.route('**/entities/11/bank-accounts?*',async r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()==='POST'){registeredBanks=[{...r.request().postDataJSON(),id:'new-bank',currencyId:1,currency:{id:1,code:'VND'},isDefault:true,isActive:true}];return r.fulfill({headers,json:registeredBanks[0]});}return r.fulfill({headers,json:{accounts:mode==='BANKLESS'?registeredBanks:[{id:'bank-1',currencyId:1,currency:{id:1,code:'VND'},bankName:'Test bank',accountNumber:'001234',accountHolder:'Selected vendor',isActive:true,isDefault:true}],currencies:[{id:1,code:'VND'}]}});});
    await page.route('**/expense-approval-settings?*',r=>{settingsReads++;return r.fulfill({headers,json:{drafter:{id:20,name:'Current editor',orgRole:'ADMIN'},candidates:[{id:21,name:'First approver'},{id:22,name:'Second approver'}]}});});
    await page.route('**/expense-requests/18/approval?*',r=>r.fulfill({headers,json:{version:3,exempt:true,exemptionReason:'SAVED_POLICY',steps:[]}}));
    await page.route('**/expense-approval-preview?*',r=>{const selection=r.request().postDataJSON()?.selection||{};return r.fulfill({headers,json:{complete:selection.seniorEmployeeId===21,ids:selection.seniorEmployeeId?[21]:[],drafter:{id:20,name:mode==='SAVED'?'Original author':'Current editor'},stages:[{key:'senior',employeeId:selection.seniorEmployeeId||null,name:selection.seniorEmployeeId?'First approver':null,candidates:[{id:21,name:'First approver'},{id:22,name:'Second approver'}]}],policy:{totals:[{currency:'VND',amount:'510000'}]}}});});
    await page.goto(`http://127.0.0.1:${port}/expense-editor-acceptance.html`,{timeout:90000});
    if(mode==='SAVED'){
      const strip=page.getByTestId('expense-approval-stages');await strip.waitFor();
      assert.equal(await strip.locator('[data-approval-state]').count(),0,'No guessed author or self-approval before document response');
      assert.equal(settingsReads,0,'Saved documents do not fetch current editor settings on entry');
      releaseDocument();
      await strip.getByText('Original author',{exact:true}).first().waitFor();
      await page.waitForFunction(()=>document.querySelectorAll('[data-testid="expense-approval-stages"] [data-approval-state="approved"]').length===1);
      assert.equal(await strip.getByText('Current editor',{exact:true}).count(),0);
      assert.equal(await page.getByTestId('expense-approval-button').isDisabled(),true,'References are still loading');
      assert.equal(await page.getByTestId('expense-line').getByLabel(EXPENSE_REQUEST_TEXT[lang].quantity,{exact:false}).inputValue(),'170','Document content does not wait for reference data');
      assert.equal(settingsReads,0);
      releaseCatalog();await page.waitForFunction(()=>!document.querySelector('[data-testid="expense-approval-button"]').disabled);
      await page.getByTestId('expense-approval-button').click();
      const reference=page.getByRole('dialog');await reference.waitFor();
      assert.equal(await reference.locator('#expense-stage-drafter').inputValue(),'Original author');
      assert.equal(await reference.locator('#expense-stage-drafter').evaluate(el=>el.readOnly),true);
      await reference.locator('#expense-stage-senior').waitFor();assert.ok(settingsReads>=1,'Opening the chooser loads candidate metadata without replacing the document author');
      await page.keyboard.press('Escape');await reference.waitFor({state:'hidden'});
    }
    if(layoutOnly){
      const text=EXPENSE_REQUEST_TEXT[lang],payment=expensePaymentText[lang],row=page.getByTestId('expense-line').first();await row.waitFor();await page.waitForFunction(()=>{const b=document.querySelector('[data-testid="expense-line"] [data-table-action="add"]');return b&&!b.disabled;});
      await row.getByRole('combobox',{name:payment.mode,exact:true}).waitFor();assert.equal(await row.getByRole('combobox',{name:payment.mode,exact:true}).count(),1);assert.equal(await page.getByTestId('expense-line-payment-details').count(),0);
      const position=await row.getByRole('combobox',{name:payment.mode,exact:true}).evaluate(el=>el.closest('.MuiFormControl-root').getBoundingClientRect().top),quantityPosition=await row.getByLabel(text.quantity,{exact:false}).evaluate(el=>el.closest('.MuiFormControl-root').getBoundingClientRect().top);assert.ok(Math.abs(position-quantityPosition)<2);
      const add=row.getByRole('button',{name:text.add,exact:true}),remove=row.getByRole('button',{name:text.remove,exact:true});assert.equal(await add.getAttribute('data-table-action'),'add');assert.equal(await remove.getAttribute('data-table-action'),'delete');assert.equal(await remove.isDisabled(),true);assert.equal(Math.round((await add.boundingBox()).width),28);assert.equal(Math.round((await remove.boundingBox()).width),28);
      await page.setViewportSize({width:1920,height:1000});const scroll=page.locator('.MuiTableContainer-root').filter({has:row}).first();assert.equal(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
      await add.click();await page.waitForFunction(()=>document.querySelectorAll('[data-testid="expense-line"]').length===2);await page.getByTestId('expense-line').nth(1).getByRole('button',{name:text.remove,exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-testid="expense-line"]').length===1);
      await row.getByRole('combobox',{name:payment.mode,exact:true}).click();await page.getByRole('option',{name:payment.split,exact:true}).click();await page.getByTestId('expense-line-payment-details').waitFor();
      await row.getByRole('combobox',{name:payment.mode,exact:true}).click();await page.getByRole('option',{name:payment.single,exact:true}).click();await page.getByTestId('expense-line-payment-details').waitFor({state:'hidden'});
      for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await add.evaluate(el=>getComputedStyle(el.closest('td')).position),'sticky');}
      assert.deepEqual(errors,[]);await page.close();continue;
    }
    if(scheduleOnly){
      const date=page.getByLabel(cashScheduleText[lang].payment,{exact:true});await date.waitFor();assert.equal(await date.inputValue(),'2026-12-10');await date.fill('2026-12-20');assert.equal(await date.inputValue(),'2026-12-20');
      for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await date.isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
      assert.deepEqual(errors,[]);await page.close();continue;
    }
    const l=EXPENSE_REQUEST_TEXT[lang],lookup=EXPENSE_LOOKUP_TEXT[lang];
    await page.getByLabel('REMARK',{exact:false}).waitFor();
    assert.equal(await page.getByTestId('expense-author-context').count(),0);
    const h=expenseHeaderActions[lang];
    assert.equal(await page.getByLabel(documentNumberText[lang].expense,{exact:true}).count(),0);
    assert.equal(await page.getByLabel(l.date,{exact:true}).count(),0);
    assert.equal(await page.getByTestId('expense-line').getByLabel(l.description,{exact:false}).evaluate(el=>el.readOnly),true);
    const entryHeader=page.getByTestId('document-entry-header'),approvalBox=await page.getByTestId('document-entry-approval').boundingBox(),payeeBox=await page.getByTestId('expense-payee-button').boundingBox();
    assert.equal(await page.getByTestId('expense-payee-button').getByRole('combobox').getAttribute('required'),'');
    assert.equal(await page.getByTestId('expense-payee-button').locator('label').getAttribute('data-shrink'),'true','Payee label stays visible even when empty');
    assert.ok(approvalBox.x>payeeBox.x+payeeBox.width);assert.equal(await page.getByTestId('expense-approval-stages').count(),1);
    const approvalStrip=await page.getByTestId('expense-approval-stages').boundingBox(),approvalBlock=await page.getByTestId('document-entry-approval').boundingBox(),currentPayeeBox=await page.getByTestId('expense-payee-button').boundingBox();assert.ok(approvalStrip.height>=36);assert.ok(Math.abs((approvalBlock.y+approvalBlock.height/2)-(currentPayeeBox.y+currentPayeeBox.height/2))<1,'Payee and approval controls share the same vertical center');
    assert.equal(await page.getByTestId('expense-approval-stages').evaluate(element=>element.scrollWidth<=element.clientWidth),true,'Approval states fit the header without scrolling');
    if(mode==='GENERAL'&&lang==='ko'&&!locked){
      const tableScroll=page.locator('.MuiTableContainer-root').filter({has:page.getByTestId('expense-line')}).first(),header=page.getByTestId('document-entry-header'),before=await header.boundingBox();
      await tableScroll.evaluate(element=>{element.scrollLeft=500;});assert.ok(await tableScroll.evaluate(element=>element.scrollLeft)>0);assert.deepEqual(await header.boundingBox(),before,'Table scrolling does not move the approval header');await tableScroll.evaluate(element=>{element.scrollLeft=0;});
    }
    const remarkBox=await page.getByTestId('expense-summary').getByLabel('REMARK',{exact:true}).locator('..').boundingBox(),totalsBox=await page.getByTestId('expense-totals').boundingBox();assert.ok(remarkBox.x<totalsBox.x);assert.ok(Math.abs(remarkBox.height-totalsBox.height)<3);
    if(mode==='GENERAL'&&lang==='ko'&&!locked){
      await page.setViewportSize({width:430,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const mobileRemark=await page.getByLabel('REMARK',{exact:true}).boundingBox(),mobileTotals=await page.getByTestId('expense-totals').boundingBox();assert.ok(mobileRemark.y<mobileTotals.y);
      await page.setViewportSize({width:1600,height:1000});
    }
    if(!locked&&mode!=='SAVED'){assert.equal(await page.getByTestId('expense-approval-button').isDisabled(),false);await page.getByTestId('expense-approval-button').getByText('Current editor',{exact:true}).first().waitFor();}
    if(!locked&&mode!=='SAVED'){
      await page.locator('button.MuiButton-contained').first().click();
      await page.getByTestId('expense-validation').waitFor();assert.equal(submitted,undefined);assert.equal(await page.getByRole('dialog').count(),0);
      assert.ok((await page.getByTestId('expense-validation').innerText()).includes(l.code));
    }
    const confirmLine=async()=>{
      const dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:h.approval,exact:true}).waitFor();
      assert.equal(await dialog.locator('#expense-stage-drafter').inputValue(),mode==='SAVED'?'Original author':'Current editor');assert.equal(await dialog.locator('#expense-stage-drafter').evaluate(el=>el.readOnly),true);
      await dialog.getByRole('combobox').click();await page.getByRole('option',{name:'First approver',exact:true}).click();
      await dialog.getByRole('button',{name:h.confirmSave,exact:true}).click();await dialog.waitFor({state:'hidden'});
    };
    if(mode==='GENERAL'&&!locked){
      await page.getByLabel('REMARK',{exact:true}).fill('Preserve this draft');
      await page.getByRole('button',{name:h.choosePayee,exact:true}).click();
      const picker=page.getByRole('dialog');await picker.getByText('001234',{exact:false}).waitFor();
      const payeeDetails=picker.getByTestId('payee-details'),account=payeeDetails.getByTestId('payee-account');
      await payeeDetails.getByText('Accounts desk',{exact:true}).waitFor();await payeeDetails.getByText('0901234567',{exact:true}).waitFor();
      await payeeDetails.getByText({ko:'단추구멍',en:'Buttonhole',vi:'Thùa khuy'}[lang],{exact:true}).waitFor();
      await account.getByText('Test bank',{exact:true}).waitFor();await account.getByText('001234',{exact:true}).waitFor();await account.getByText('Selected vendor',{exact:true}).waitFor();
      if(lang==='ko'){await page.setViewportSize({width:430,height:1000});assert.ok(await picker.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'payee details stay within the mobile dialog');await page.setViewportSize({width:1600,height:1000});}
      await picker.getByLabel(h.search,{exact:true}).fill('Selected vendor');assert.equal(await picker.locator('tbody tr').count(),1);
      const b=ENTITY_TEXT[lang];await picker.getByRole('button',{name:h.information,exact:true}).click();
      let profile=page.getByRole('dialog').last();
      await profile.getByLabel(b.email,{exact:true}).fill('cancelled@example.com');await profile.getByRole('button',{name:b.cancel,exact:true}).click();assert.equal(profileWrites.length,0);
      await picker.getByRole('button',{name:h.information,exact:true}).click();profile=page.getByRole('dialog').last();assert.equal(await profile.getByLabel(b.email,{exact:true}).inputValue(),'');
      await profile.getByLabel(b.businessNumber,{exact:true}).fill('TAX-123');await profile.getByLabel(b.email,{exact:true}).fill('updated@example.com');await profile.getByLabel(b.address,{exact:true}).fill('Updated address');await profile.getByRole('button',{name:b.save,exact:true}).click();
      if(lang==='ko'){await profile.getByRole('alert').filter({hasText:'temporary profile error'}).waitFor();assert.equal(await profile.getByLabel(b.email,{exact:true}).inputValue(),'updated@example.com');await profile.getByRole('button',{name:b.save,exact:true}).click();}
      await page.getByRole('dialog').last().getByText(/TAX-123/).waitFor();
      assert.deepEqual(profileWrites.at(-1).classification,{revision:2,roleIds:[3],industryIds:[4]});assert.equal(submitted,undefined);
      await picker.getByRole('button',{name:h.cancel,exact:true}).click();assert.equal(await page.getByLabel('REMARK',{exact:true}).inputValue(),'Preserve this draft');await page.getByLabel('REMARK',{exact:true}).fill('');
    }
    assert.equal(await page.getByTestId('expense-line').count(),1);
    assert.equal(await page.getByLabel(l.price,{exact:false}).inputValue(),'3,000');
    assert.equal(await page.getByLabel(l.quantity,{exact:false}).inputValue(),'170');
    assert.equal(await page.getByRole('button',{name:l.remove,exact:true}).isDisabled(),true);
    if(mode==='SAVED'){
      const save=page.locator('button.MuiButton-contained').first(),description=page.getByLabel('REMARK',{exact:true});
      assert.equal(await save.isDisabled(),true);
      await description.fill('Reviewed expense');await page.waitForFunction(()=>!document.querySelector('button.MuiButton-contained')?.disabled);
      await description.fill('');assert.equal(await save.isDisabled(),true);
      await description.fill('Conflicting edit');await save.click();await confirmLine();
      await page.locator('.MuiAlert-standardError').waitFor();
      assert.notEqual(await page.locator('.MuiAlert-standardError').innerText(),l.invalid);
      assert.equal(submitted.version,3);
      assert.equal(await page.getByLabel('REMARK',{exact:true}).inputValue(),'Conflicting edit');
      assert.deepEqual(errors,[]);await page.close();continue;
    }
    if(locked&&lookupOnly){assert.equal(await page.getByTestId('expense-line').getByRole('combobox',{name:l.code,exact:false}).isDisabled(),true);assert.deepEqual(errors,[]);await page.close();continue;}
    if(locked){assert.equal(await page.getByLabel('REMARK',{exact:false}).isDisabled(),true);assert.equal(await page.getByTestId('expense-line').getByLabel(l.price,{exact:false}).isDisabled(),true);}
    else {
      const code=page.getByTestId('expense-line').getByRole('combobox',{name:l.code,exact:false});
      await code.fill('BT');
      await code.press('Enter');
      assert.equal(await code.inputValue(),'BTHE');
      await code.fill('');
      await code.locator('..').getByRole('button',{name:new RegExp(lookup.search)}).click();
      const keyword=page.getByRole('dialog').getByLabel(lookup.keyword,{exact:false});
      await keyword.fill('Buttonhole');
      assert.equal(await page.getByRole('dialog').locator('tbody tr').count(),1);
      assert.match(await page.getByRole('dialog').locator('tbody').innerText(),/BTHE/);
      await keyword.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
      assert.equal(await keyword.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
      await page.getByRole('dialog').getByRole('button',{name:lookup.select,exact:true}).click();
      await code.fill('BTHE');await code.press('Enter');
      // A unique exact code resolves directly; no legacy work group is requested.
      if(await page.getByRole('dialog').count())await page.getByRole('dialog').getByRole('button',{name:lookup.select,exact:true}).click();
      assert.equal(await page.getByLabel(l.description,{exact:false}).inputValue(),expenseCodeDescription(mocks['transaction-codes'][0],lang));
      if(lookupOnly){assert.deepEqual(errors,[]);console.log('PASS actual expense code focus/dropdown/F2 '+mode+' '+lang);await page.close();continue;}
      if(mode==='BANKLESS'){
        const b=ENTITY_TEXT[lang];await page.getByLabel('REMARK',{exact:true}).fill('Keep request while adding account');
        await page.getByRole('button',{name:h.choosePayee,exact:true}).click();const picker=page.getByRole('dialog');await picker.getByText(h.noAccount,{exact:true}).waitFor();assert.equal(await picker.getByRole('button',{name:h.apply,exact:true}).isDisabled(),true);
        await picker.getByRole('button',{name:h.information,exact:true}).click();await page.getByRole('dialog').last().getByRole('button',{name:b.add,exact:true}).click();
        const account=page.getByRole('dialog').last();await account.getByRole('textbox',{name:b.bank,exact:false}).fill('Test bank');await account.getByLabel(b.number,{exact:false}).fill('001234');await account.getByLabel(b.holder,{exact:false}).fill('Selected vendor');await account.getByRole('button',{name:b.save,exact:true}).click();
        const profile=page.getByRole('dialog').last();await profile.getByText('001234',{exact:true}).waitFor();await profile.getByRole('button',{name:b.cancel,exact:true}).click();await picker.getByRole('button',{name:h.apply,exact:true}).click();
        assert.equal(await page.getByLabel('REMARK',{exact:true}).inputValue(),'Keep request while adding account');
      }
      assert.equal(await page.locator('.MuiAlert-standardWarning').count(),0,'Shared source FK must not produce an industry warning');
      const save=page.locator('button.MuiButton-contained').first();
      if(mode==='PROCESS'){
        assert.equal(await page.getByLabel('REMARK',{exact:false}).inputValue(),'');
        assert.equal(await page.getByTestId('expense-line').first().getByLabel(l.price,{exact:false}).isDisabled(),true);
        await page.waitForFunction(()=>!document.querySelector('button.MuiButton-contained')?.disabled);
        if(lang==='ko'){
          await page.getByRole('button',{name:l.addProcess,exact:true}).click();
          assert.equal(await page.getByTestId('expense-line').count(),2);
          const second=page.getByTestId('expense-line').nth(1);
          await second.getByLabel(l.quantity,{exact:false}).fill('200');await second.getByLabel(l.price,{exact:false}).fill('2500');
          const details=page.locator('tbody[data-rfd-draggable-id]').nth(1);
          await details.getByRole('combobox',{name:l.style,exact:true}).click();await page.getByRole('option',{name:'Shirt (AM02058)',exact:true}).click();
          await details.getByRole('combobox',{name:l.process,exact:false}).click();await page.getByRole('option',{name:'Buttonhole second (BH2)',exact:true}).click();
        }
      }else{
        await page.getByLabel('REMARK',{exact:false}).fill('Updated request');
        await page.getByLabel(l.price,{exact:false}).fill('5000');assert.equal(await page.getByLabel(l.price,{exact:false}).inputValue(),'5,000');
      }
      for(const reference of await page.getByRole('textbox',{name:({ko:'증빙·운송장 번호',en:'Document / tracking number',vi:'Số chứng từ / vận đơn'})[lang],exact:false}).all())if(!await reference.inputValue())await reference.fill('REF-002');
      if(mode==='GENERAL'){
        await save.click();const modal=page.getByRole('dialog');await modal.getByRole('heading',{name:h.approval,exact:true}).waitFor();await modal.getByRole('button',{name:h.cancel,exact:true}).click();assert.equal(submitted,undefined);assert.equal(await page.getByLabel('REMARK',{exact:true}).inputValue(),'Updated request');
      }
      await save.click();await confirmLine();
      if(mode==='BACKGROUND'){
        await page.evaluate(()=>window.changeWorkspace('/dashboard'));releaseSave();await page.waitForTimeout(250);
        assert.equal(await page.evaluate(()=>window.expenseNavigations?.length || 0),0,'A background save must not reopen its closed workspace');
        assert.deepEqual(errors,[]);await page.close();continue;
      }
      if(mode==='PROCESS'&&lang==='ko'){await Promise.all([page.waitForResponse(response=>response.request().method()==='PUT'&&response.url().includes('/expense-request-editor/')),page.getByRole('button',{name:l.retry,exact:true}).click()]);assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);}
      await page.waitForFunction(()=>document.documentElement.dataset.saved==='true');
      assert.equal(await page.evaluate(()=>window.expenseNavigations.length),1);
      await page.evaluate(()=>window.changeWorkspace('/dashboard'));await page.waitForTimeout(100);
      await page.evaluate(()=>window.changeWorkspace('/outsourcing-record/edit/legacy/78'));await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>window.expenseNavigations.length),1,'Closing or returning to a saved form must not trigger another navigation');
      assert.equal(submitted.approvalSelection.seniorEmployeeId,21);assert.equal(submitted.managementNumber,undefined);assert.equal(submitted.automaticRequestDate,true);assert.equal(submitted.requestDate,undefined);
      assert.equal(submitted.remark,mode==='PROCESS'?'':'Updated request');assert.equal(submitted.revision,'server-revision');
      assert.equal(submitted.items[0].sourceRecordId,78);assert.equal(submitted.items[0].assignmentPlanId,60);assert.equal(submitted.items[0].unitPrice,mode==='PROCESS'?'3000':'5000');
      assert.equal(submitted.items[0].description,undefined);
      if(mode==='PROCESS'&&lang==='ko'){assert.equal(submitted.items.length,2);assert.equal(submitted.items[1].sourceRecordId,undefined);assert.equal(submitted.items[1].assignmentPlanId,61);assert.equal(submitted.items[1].quantity,'200');}
    }
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await page.close();
  }
  console.log(lookupOnly?'Expense lookup UI passed: ko/en/vi, general/process and disabled states.':'Expense edit form passed: ko/en/vi, selected source values, immutable production FKs, PUT edits, automatic payee information, one-time save navigation, inactive-save completion and final-lock read-only.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
