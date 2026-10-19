import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert.ok(executablePath);
const fixture=path.resolve('frontend/code-bases-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline} from '@mui/material';import theme from '/src/theme';import Page from '/src/pages/App/CodeBaseSettings.jsx';createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page)));</script></body></html>`);
const port=43189,vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/code-bases-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi']){
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/src/context/AuthContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAuth=()=>({activeOrgId:1});'}));
    await page.route('**/src/context/LanguageContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
    await page.route('**/src/context/AppContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useAppActions=()=>({navigateToPath:()=>{}});'}));
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    const industry={id:4,code:'LOGISTICS',nameKo:'물류',nameEn:'Logistics',nameVi:'Vận chuyển',entryMode:'LOGISTICS',requiredFields:[],orderInput:'OPTIONAL',styleInput:'HIDDEN',processInput:'HIDDEN',isActive:true};
    const taxes=[{id:1,nameKo:'과세',nameEn:'VAT',nameVi:'Chịu thuế'},{id:2,nameKo:'영세율',nameEn:'Zero-rated',nameVi:'Thuế suất 0%'},{id:3,nameKo:'면세',nameEn:'Exempt',nameVi:'Không chịu thuế'}];
    const expenseType={id:2,nameKo:'물류 서비스',nameEn:'Logistics services',nameVi:'Dịch vụ vận chuyển',entryMode:'LOGISTICS',isActive:true};
    await page.route('**/expense-types',route=>route.fulfill({headers,json:[expenseType,{id:5,code:'OTHER',nameKo:'기타',nameEn:'Other',nameVi:'Khác',entryMode:'GENERAL',isActive:true}]}));
    let bases=[{id:7,code:'TRK',nameKo:'운송',nameEn:'Trucking',nameVi:'Vận chuyển',expenseTypeId:2,expenseType,entryMode:"LOGISTICS",requiredFields:[],orderInput:"OPTIONAL",styleInput:"HIDDEN",processInput:"HIDDEN",serviceTypeId:4,serviceType:industry,isActive:true,hasUsageHistory:false,variants:taxes.map((tax,i)=>({id:i+1,code:'TRK'+['V','Z','E'][i],taxTreatmentId:tax.id,taxTreatment:tax,isEnabled:true,isActive:true}))},{id:8,code:'SEW',nameKo:'봉제',nameEn:'Sewing',nameVi:'May',expenseTypeId:2,expenseType,entryMode:"LOGISTICS",requiredFields:[],orderInput:"OPTIONAL",styleInput:"HIDDEN",processInput:"HIDDEN",serviceTypeId:4,serviceType:industry,isActive:true,hasUsageHistory:true,variants:[]}];
    await page.route('**/system-setting-defaults/**',route=>{
      const url=new URL(route.request().url()),method=route.request().method();
      if(method==='OPTIONS')return route.fulfill({headers,status:204});
      if(method==='DELETE'){
        writes.push({path:url.pathname});
        if(url.pathname.includes('/services/'))return route.fulfill({headers,status:409,json:{error:'SETTING_IN_USE'}});
        bases=bases.filter(row=>row.id!==7);return route.fulfill({headers,json:{ok:true}});
      }
      if(url.pathname.endsWith('/other-expense-defaults'))return route.fulfill({headers,json:{expenseTypeId:5,baseId:9}});
      if(method==='POST'||method==='PUT'){const body=route.request().postDataJSON();writes.push({path:url.pathname,body});return route.fulfill({headers,json:{id:9,...body}});}
      return route.fulfill({headers,json:url.pathname.endsWith('/code-bases')?bases:[industry]});
    });
    const labels=lang==='ko'?{add:'기본 코드 등록',code:'기본 코드',save:'저장',remove:'삭제',industry:'업종·입력 옵션 관리',used:'사용 이력이나 연결 설정이 있어'}:lang==='en'?{add:'Add base code',code:'Base code',save:'Save',remove:'Delete',industry:'Industries & input options',used:'Usage history or linked settings'}:{add:'Thêm mã gốc',code:'Mã gốc',save:'Lưu',remove:'Xóa',industry:'Ngành và tùy chọn nhập',used:'Không thể xóa do có lịch sử sử dụng'};
    await page.goto(`http://127.0.0.1:${port}/code-bases-acceptance.html`);
    const used=page.locator('tbody tr').filter({hasText:'SEW'});await used.waitFor();assert.equal(await used.getByRole('button',{name:labels.remove,exact:true}).isDisabled(),true);
    assert.equal(await page.locator('thead th').count(),6);
    assert.equal(await used.getByRole('button',{name:labels.remove,exact:true}).locator('[data-testid="DeleteOutlineIcon"]').count(),1);
    assert.equal(await used.locator('[data-testid="EditIcon"]').count(),1);
    await page.getByRole('button',{name:labels.add,exact:true}).click();const dialog=page.getByRole('dialog');
    const modalSize=await dialog.boundingBox();assert.ok(modalSize.height<=952);
    const savePosition=await dialog.getByRole('button',{name:labels.save,exact:true}).boundingBox();assert.ok(savePosition.y+savePosition.height<1000);
    await dialog.getByLabel(labels.code,{exact:false}).fill('air');
    assert.equal(await dialog.getByLabel(labels.code,{exact:false}).inputValue(),'AIR');
    for(const [label,value] of [['한국어','항공'],['English','Air'],['Tiếng Việt','Hàng không']])await dialog.getByLabel(label,{exact:false}).fill(value);
    await dialog.getByRole('combobox').nth(0).click();assert.equal(await page.getByRole('option',{name:lang==='ko'?'기타':lang==='en'?'Other':'Khác',exact:true}).count(),1);await page.getByRole('option').first().click();
    await dialog.getByRole('combobox').nth(1).click();await page.getByRole('option').first().click();
    await dialog.getByRole('checkbox',{name:/^Z/}).uncheck();await dialog.getByRole('button',{name:labels.save,exact:true}).click();
    await dialog.waitFor({state:'hidden'});assert.equal(writes.at(-1).body.code,'AIR');assert.deepEqual(writes.at(-1).body.taxTreatmentIds,[1,3]);
    bases[0].hasUsageHistory=true;
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{source:'transaction-request',topics:['orders'],orgId:1}})));
    await page.waitForFunction(({remove,add})=>{
      const row=[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes('TRK'));
      const addButton=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===add);
      return row?.querySelector(`button[aria-label="${remove}"]`)?.disabled && addButton && !addButton.disabled;
    },{remove:labels.remove,add:labels.add});
    bases[0].hasUsageHistory=false;
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('baro:workspace-data-changed',{detail:{source:'transaction-request',topics:['orders'],orgId:1}})));
    await page.waitForFunction(remove=>{
      const row=[...document.querySelectorAll('tbody tr')].find(row=>row.textContent.includes('TRK'));
      return row && !row.querySelector(`button[aria-label="${remove}"]`)?.disabled;
    },labels.remove);
    await page.locator('tbody tr').filter({hasText:'TRK'}).getByRole('button',{name:labels.remove,exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:labels.remove,exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.ok(writes.some(write=>write.path.endsWith('/code-bases/7')));
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:labels.add,exact:true}).click();
    const mobileBox=await page.getByRole('dialog').boundingBox();assert.ok(mobileBox.x>=0&&mobileBox.x+mobileBox.width<=390);
    const mobileSave=await page.getByRole('dialog').getByRole('button',{name:labels.save,exact:true}).boundingBox();assert.ok(mobileSave.y+mobileSave.height<=844);
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Code base UI passed in ko/en/vi: uppercase 3-letter input, selected suffixes, used deletion disabled, unused deletion, independent expense type and input configuration.');
}finally{await browser?.close();vite.kill();unlinkSync(fixture);}
