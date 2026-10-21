import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { EXPENSE_REQUEST_TEXT, EXPENSE_HEADER_TEXT } from '../frontend/src/constants/expenseRequest.js';
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
  for(const mode of ['GENERAL','PROCESS','SAVED','BACKGROUND','BANKLESS'])for(const lang of mode==='BACKGROUND'?['ko']:['ko','en','vi'])for(const locked of ['SAVED','BACKGROUND','BANKLESS'].includes(mode)?[false]:[false,true]) {
    console.log('Checking expense editor',mode,lang,locked);
    const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],requests=[],attempts=[];let submitted,releaseSave,registeredBanks=[];const saveGate=new Promise(resolve=>{releaseSave=resolve;});
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    page.on('request',r=>{if(r.url().includes('/work-logs'))requests.push(r.url());});
    await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1,accessProfile:{orgName:"BARO",employeeName:"Current editor"}});'}));
    await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route('**/src/context/ManagementPeriodContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useManagementPeriod=()=>({startDate:"2026-04-01",loading:false});'}));
    await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:(path,options)=>{document.documentElement.dataset.saved="true";window.expenseNavigations=(window.expenseNavigations||[]).concat([{path,options}]);},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{}});'}));
    await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useRequestScopeContext=()=>({active:!window.expenseBackground,scopeId:"/outsourcing-record/edit/legacy/78"});'}));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const service={isActive:true,entryMode:['SAVED','BACKGROUND'].includes(mode)?'GENERAL':mode,requiredFields:[],expenseTypeId:1,serviceTypeId:4};
    const mocks={ 'business-partners':[{id:11,name:'Selected vendor',type:'PROCESS_OUTSOURCING',contactName:'Accounts desk',contactPhone:'0901234567',isActive:true,partnerExpenseTypeId:1,serviceTypes:[{id:44,systemDefaultId:4,nameKo:'\uB2E8\uCD94\uAD6C\uBA4D',nameEn:'Buttonhole',nameVi:'Th\u00f9a khuy'}]}],
      'transaction-codes':[{id:7,code:'BTHE',nameKo:'Buttonhole',nameEn:'Buttonhole',nameVi:'Buttonhole',isActive:true,vatEnabled:false,serviceTypeId:4,base:service}],
      'orders':[{id:'public-30',dbId:30,ownerOrgId:1,orderNumber:'L17-1'}], 'app-settings':{defaultVatRate:'10'} };
    for(const [endpoint,json] of Object.entries(mocks))await page.route(`**/${endpoint}?*`,r=>r.fulfill({headers,json}));
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
      return r.fulfill({headers,json:{remark:'',approverEmployeeIds:[],canonicalSource:{kind:'legacy',id:'78'},requestDate:'2026-07-31',partnerOrgId:11,partner:{id:11,name:'Selected vendor'},createdByEmployee:{id:21,name:'Original author'},revision:'server-revision',version:mode==='SAVED'?3:null,updatedAt:mode==='SAVED'?'2026-10-19T09:00:00Z':null,updatedByEmployee:mode==='SAVED'?{id:20,name:'Latest editor'}:null,readOnly:locked,
        items:[{sourceRecordId:78,itemId:null,transactionCodeId:mode==='SAVED'?7:'',currency:'VND',quantity:'170',unitPrice:'3000',vatRate:'0',description:'Original buttonhole expense',details:{},workOrderId:30,styleId:40,styleProcessId:50,assignmentPlanId:60,productionLinked:true,productionLocked:mode==='PROCESS',enabled:{order:true,style:true,process:true},
          preservedReferences:{order:{id:30,orderNumber:'L17-1'},style:{id:40,name:'Shirt',code:'AM02058',styleProcesses:[{id:50,processName:'Buttonhole',processCode:'BH'}]},plan:{id:60,styleId:40,processIds:[50]}}}]}});
    });
    await page.route('**/transaction-request-options?*',r=>r.fulfill({headers,json:{styles:[{id:40,name:'Shirt',code:'AM02058',styleProcesses:[{id:51,processName:'Buttonhole second',processCode:'BH2'}]}],plans:[{id:61,styleId:40,processIds:[51],factoryName:'Factory A'}]}}));
    await page.route('**/entities/11/bank-accounts?*',async r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()==='POST'){registeredBanks=[{...r.request().postDataJSON(),id:'new-bank',currency:{id:1,code:'VND'},isDefault:true}];return r.fulfill({headers,json:registeredBanks[0]});}return r.fulfill({headers,json:{accounts:mode==='BANKLESS'?registeredBanks:[{id:'bank-1',currencyId:1,currency:{id:1,code:'VND'},bankName:'Test bank',accountNumber:'001234',accountHolder:'Selected vendor',isActive:true,isDefault:true}],currencies:[{id:1,code:'VND'}]}});});
    await page.route('**/expense-approval-candidates?*',r=>r.fulfill({headers,json:[{id:20,name:'First approver'},{id:21,name:'Second approver'}]}));
    await page.goto(`http://127.0.0.1:${port}/expense-editor-acceptance.html`);
    const l=EXPENSE_REQUEST_TEXT[lang],lookup=EXPENSE_LOOKUP_TEXT[lang];
    await page.getByLabel('REMARK',{exact:false}).waitFor();
    assert.equal(await page.getByTestId('expense-author-context').count(),0);
    const payeeInfo=page.getByLabel(EXPENSE_HEADER_TEXT[lang].payeeInfo,{exact:true});
    if(mode!=='BANKLESS')await page.waitForFunction(()=>Array.from(document.querySelectorAll('input')).some(el=>el.value.includes('Test bank')));
    if(mode!=='BANKLESS')assert.match(await payeeInfo.inputValue(),/Accounts desk.*0901234567.*Test bank.*001234/);
    assert.equal(await payeeInfo.evaluate(el=>el.readOnly),true);
    if(mode==='GENERAL'&&!locked){
      await page.getByRole('button',{name:l.payee+' \u00b7 '+lookup.search,exact:true}).click();
      const dialog=page.getByRole('dialog'),category={ko:'\uC678\uC8FC \uC5C5\uCCB4',en:'Outsourcing partner',vi:'\u0110\u1ed1i t\u00e1c gia c\u00f4ng'}[lang],industry={ko:'\uB2E8\uCD94\uAD6C\uBA4D',en:'Buttonhole',vi:'Th\u00f9a khuy'}[lang];
      await dialog.getByRole('cell',{name:category,exact:true}).waitFor();
      assert.equal(await dialog.getByRole('cell',{name:industry,exact:true}).count(),1);
      await dialog.getByLabel(lookup.keyword,{exact:true}).fill(category);
      assert.equal(await dialog.getByRole('cell',{name:'Selected vendor',exact:true}).count(),1);
      await dialog.getByRole('button',{name:lookup.close,exact:true}).click();
      const b=ENTITY_TEXT[lang],edit=EXPENSE_HEADER_TEXT[lang].editPayee;
      await page.getByRole('button',{name:edit,exact:true}).click();
      const profile=page.getByRole('dialog');
      await profile.getByRole('heading',{name:edit,exact:true}).waitFor();
      await profile.getByLabel(b.businessNumber,{exact:true}).fill('TAX-123');
      await profile.getByLabel(b.email,{exact:true}).fill('updated@example.com');
      await profile.getByLabel(b.address,{exact:true}).fill('Updated address');
      await profile.getByRole('button',{name:b.cancel,exact:true}).click();
      assert.equal(profileWrites.length,0,'Cancel must not save the profile');
      await page.getByRole('button',{name:edit,exact:true}).click();
      assert.equal(await profile.getByLabel(b.email,{exact:true}).inputValue(),'');
      await profile.getByLabel(b.businessNumber,{exact:true}).fill('TAX-123');
      await profile.getByLabel(b.email,{exact:true}).fill('updated@example.com');
      await profile.getByLabel(b.address,{exact:true}).fill('Updated address');
      await profile.getByRole('button',{name:b.save,exact:true}).click();
      if(lang==='ko'){
        await profile.getByRole('alert').filter({hasText:'temporary profile error'}).waitFor();
        assert.equal(await profile.getByLabel(b.email,{exact:true}).inputValue(),'updated@example.com');
        await profile.getByRole('button',{name:b.save,exact:true}).click();
      }
      await profile.waitFor({state:'hidden'});
      assert.match(await payeeInfo.inputValue(),/TAX-123.*updated@example.com.*Updated address/);
      assert.deepEqual(profileWrites.at(-1).serviceTypeIds,[44]);
      assert.equal(profileWrites.at(-1).type,'PROCESS_OUTSOURCING');
      assert.equal(submitted,undefined,'Master profile changes must not save the expense');
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
      await description.fill('Conflicting edit');await save.click();
      await page.locator('.MuiAlert-standardError').waitFor();
      assert.notEqual(await page.locator('.MuiAlert-standardError').innerText(),l.invalid);
      assert.equal(submitted.version,3);
      assert.equal(await page.getByLabel('REMARK',{exact:true}).inputValue(),'Conflicting edit');
      assert.deepEqual(errors,[]);await page.close();continue;
    }
    if(locked){assert.equal(await page.getByLabel('REMARK',{exact:false}).isDisabled(),true);assert.equal(await page.getByTestId('expense-line').getByLabel(l.price,{exact:false}).isDisabled(),true);}
    else {
      const code=page.getByTestId('expense-line').getByRole('combobox',{name:l.code,exact:false});
      await code.fill('BT');
      await page.getByRole('option',{name:/BTHE/}).waitFor();
      await page.getByRole('option',{name:/BTHE/}).click();
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
      if(mode==='BANKLESS'){
        const b=ENTITY_TEXT[lang];
        assert.equal(await page.locator('button.MuiButton-contained').first().isDisabled(),true);
        await page.getByRole('alert').getByRole('button',{name:EXPENSE_HEADER_TEXT[lang].editPayee,exact:true}).click();
        await page.getByRole('dialog').getByRole('button',{name:b.add,exact:true}).click();
        const dialog=page.getByRole('dialog').last();
        await dialog.getByLabel(b.bank,{exact:false}).fill('Test bank');
        await dialog.getByLabel(b.number,{exact:false}).fill('001234');
        await dialog.getByLabel(b.holder,{exact:false}).fill('Selected vendor');
        await dialog.getByRole('button',{name:b.save,exact:true}).click();
        await page.getByRole('dialog').getByText('001234',{exact:true}).waitFor();
        await page.getByRole('dialog').getByRole('button',{name:b.cancel,exact:true}).click();
        assert.equal(await page.getByLabel('REMARK',{exact:true}).inputValue(),'');
        await page.waitForFunction(()=>!document.querySelector('button.MuiButton-contained')?.disabled);
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
          await details.getByRole('combobox',{name:l.style,exact:false}).click();await page.getByRole('option',{name:'Shirt (AM02058)',exact:true}).click();
          await details.getByRole('combobox',{name:l.process,exact:false}).click();await page.getByRole('option',{name:'Buttonhole second (BH2)',exact:true}).click();
        }
      }else{
        await page.getByLabel('REMARK',{exact:false}).fill('Updated request');
        await page.getByLabel(l.price,{exact:false}).fill('5000');assert.equal(await page.getByLabel(l.price,{exact:false}).inputValue(),'5,000');
      }
      const h=EXPENSE_HEADER_TEXT[lang];
      await page.getByRole('button',{name:h.approval,exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:h.addApprover,exact:true}).click();
      assert.equal(await page.getByRole('dialog').getByRole('button',{name:h.apply,exact:true}).isDisabled(),true);
      await page.getByRole('dialog').getByRole('combobox').click();
      await page.getByRole('option',{name:'First approver',exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:h.apply,exact:true}).click();
      await save.click();
      if(mode==='BACKGROUND'){
        await page.evaluate(()=>window.changeWorkspace('/dashboard'));releaseSave();await page.waitForTimeout(250);
        assert.equal(await page.evaluate(()=>window.expenseNavigations?.length || 0),0,'A background save must not reopen its closed workspace');
        assert.deepEqual(errors,[]);await page.close();continue;
      }
      if(mode==='PROCESS'&&lang==='ko'){await page.getByRole('button',{name:l.retry,exact:true}).click();assert.deepEqual(attempts[0],attempts[1]);}
      await page.waitForFunction(()=>document.documentElement.dataset.saved==='true');
      assert.equal(await page.evaluate(()=>window.expenseNavigations.length),1);
      await page.evaluate(()=>window.changeWorkspace('/dashboard'));await page.waitForTimeout(100);
      await page.evaluate(()=>window.changeWorkspace('/outsourcing-record/edit/legacy/78'));await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>window.expenseNavigations.length),1,'Closing or returning to a saved form must not trigger another navigation');
      assert.deepEqual(submitted.approverEmployeeIds,[20]);
      assert.equal(submitted.remark,mode==='PROCESS'?'':'Updated request');assert.equal(submitted.revision,'server-revision');
      assert.equal(submitted.items[0].sourceRecordId,78);assert.equal(submitted.items[0].assignmentPlanId,60);assert.equal(submitted.items[0].unitPrice,mode==='PROCESS'?'3000':'5000');
      assert.equal(submitted.items[0].description,undefined);
      if(mode==='PROCESS'&&lang==='ko'){assert.equal(submitted.items.length,2);assert.equal(submitted.items[1].sourceRecordId,undefined);assert.equal(submitted.items[1].assignmentPlanId,61);assert.equal(submitted.items[1].quantity,'200');}
    }
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Expense edit form passed: ko/en/vi, selected source values, immutable production FKs, PUT edits, automatic payee information, one-time save navigation, inactive-save completion and final-lock read-only.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
