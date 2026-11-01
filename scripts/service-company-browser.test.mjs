import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const fixture=path.resolve('frontend/service-company-acceptance.html');assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';
const params=new URLSearchParams(location.search),screen=params.get('screen'),paths={dashboard:'/src/pages/App/WorkspaceDashboard.jsx',workplace:'/src/pages/App/organization/WorkplaceBoard.jsx',attendance:'/src/pages/App/attendance/AttendanceList.jsx',expense:'/src/pages/App/TransactionRequestEntry.jsx',registration:'/src/pages/Auth/CompanyChooser.jsx',employees:'/src/pages/App/employee/EmployeeBoard.jsx',salary:'/src/pages/App/SalarySystem.jsx'};
const Page=(await import(paths[screen])).default;createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement(ThemeProvider,{theme},React.createElement(CssBaseline),React.createElement(Page,{languageCode:params.get('lang')}))));</script></body></html>`);
const port=43378,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
const COPY={ko:{add:'사업장 등록',name:'사업장명',code:'사업장 코드',start:'관리 시작일',save:'저장',register:'물류 회사 등록',admin:'관리자 이름',template:'직급·근태·결재 기준 회사',create:'등록'},en:{add:'Add workplace',name:'Workplace name',code:'Workplace code',start:'Management start date',save:'Save',register:'Register a logistics company',admin:'Administrator name',template:'Administration template company',create:'Register'},vi:{add:'Thêm nơi làm việc',name:'Tên nơi làm việc',code:'Mã nơi làm việc',start:'Ngày bắt đầu quản lý',save:'Lưu',register:'Đăng ký công ty logistics',admin:'Tên quản trị viên',template:'Công ty mẫu quản trị',create:'Đăng ký'}};
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/service-company-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390])for(const screen of (process.env.SERVICE_SCREENS?.split(',')||['dashboard','workplace','attendance','expense','registration','employees','salary'])){
  console.log('Checking SERVICE',lang,width,screen);
  const page=await browser.newPage({viewport:{width,height:950}}),errors=[],requests=[],writes=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});const t=COPY[lang];
  await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`import{getDefaultRoleAccessPolicy}from'/src/utils/roleAccessPolicyCore.mjs';const user={email:'krsailer82@gmail.com',id:'private-admin'},p={entryType:'ORG',orgType:'SERVICE',orgRole:'ADMIN',orgId:2,employeeName:'정동원',email:user.email,accessPolicy:getDefaultRoleAccessPolicy()};export const useAuth=()=>({user,isAuthenticated:true,activeProfile:p,accessProfile:p,activeOrgId:2,activeOrgType:'SERVICE',activeOrgRole:'ADMIN',activeFactoryId:20,updateActiveProfile:()=>{},workspaces:[],canCreateCompany:true,selectWorkspace:()=>{},reloadWorkspaces:()=>{},loading:false});`}));
  await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}',setLanguageCode:()=>{}});`}));
  await page.route('**/src/context/AppContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:'const actions={navigateToPath:()=>{},showNotification:()=>{},setUnsavedChangesGuard:()=>{},clearUnsavedChangesGuard:()=>{},clearTabChanged:()=>{},markTabChanged:()=>{}};export const useAppActions=()=>actions;'}));
  await page.route('**/src/context/ManagementPeriodContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useManagementPeriod=()=>({startDate:'2026-11-01',loading:false,factories:[{id:20,startDate:'2026-11-01'}]});"}));
  await page.route('**/src/context/RequestScopeContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:"export const useRequestScopeContext=()=>({active:true,scopeId:'/test'});export const RequestScopeBoundary=({children})=>children;"}));
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'},workplace={id:20,orgId:2,name:'DEX LOGIS',factoryCode:'HQ',managementStartDate:'2026-11-01'};
  const endpoints={'expense-approval-overview':{rows:[],total:0,page:0,pageSize:10},'bank-ledger/changes':{rows:[],total:0,page:0,pageSize:10},factories:[workplace],employees:[{id:1,orgId:2,factoryId:20,name:'정동원',payType:'GENERAL',payrollExcluded:true,status:'ACTIVE',joinedAt:'2026-11-01'}],'attendance-entries':[],'organization-holidays':[],'expense-payees':[],'transaction-codes':[],'expense-units':[],'app-settings':{defaultVatRate:'10'},'expense-approval-settings':{drafter:{id:1,name:'정동원',orgRole:'ADMIN'},candidates:[]},'auth/workspace-templates':[{id:1,name:'BARO GARMENT'}]};
  const grades=[{id:1,name:'Staff',grades:[{id:10,code:'STAFF',name:'Staff',nameEn:'Staff',nameKo:'직원',nameVi:'Nhân viên',isActive:true,isDefault:true}]}];
  Object.assign(endpoints,{'org-memberships':[],attributes:{roles:[{id:4,code:'WORKER_GENERAL',name:'직원',defaultPayType:'GENERAL'}],colors:[],categories:[],processes:[]},'employee-grades':grades,'salary-system':{factoryId:20,editRevision:'r1',currencyCode:'VND',items:[{id:'baseSalary',code:'baseSalary',name:'Base Salary',nameEn:'Base Salary',nameKo:'기본급',nameVi:'Lương cơ bản',category:'BASE',payTypes:['GENERAL'],formula:['GRADE_RATE'],payCycle:'MONTHLY',paymentMonths:[1,2,3,4,5,6,7,8,9,10,11,12],required:true,sortOrder:0}],rates:[],versions:[]}});
  for(const [endpoint,json] of Object.entries(endpoints))await page.route(`**/${endpoint}{,?*}`,r=>{requests.push(endpoint);return r.fulfill({headers,json});});
  await page.route('**/factories?*',r=>{requests.push('factories');if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});if(r.request().method()==='POST')writes.push(r.request().postDataJSON());return r.fulfill({headers,json:r.request().method()==='POST'?workplace:[workplace]});});
  await page.route('**/auth/workspaces',r=>{if(r.request().method()==='OPTIONS')return r.fulfill({headers,status:204});writes.push(r.request().postDataJSON());return r.fulfill({headers,json:{id:2}});});
  page.on('request',r=>{if(/\/(orders|assignment-plans|work-logs|production-summary)(\?|$)/.test(r.url()))requests.push('PRODUCTION');});
  await page.clock.install({time:new Date('2026-11-01T12:00:00+07:00')});
  await page.goto(`http://127.0.0.1:${port}/service-company-acceptance.html?`+new URLSearchParams({screen,lang}));
  if(screen==='dashboard'){await page.getByTestId('approval-dashboard').waitFor();await page.getByTestId('ledger-changes-dashboard').waitFor();}
  if(screen==='workplace'){
   await page.getByText('DEX LOGIS',{exact:true}).waitFor();await page.getByRole('button',{name:t.add,exact:true}).click();const dialog=page.getByRole('dialog');
   await dialog.getByLabel(t.name,{exact:false}).fill('DEX Office');await dialog.getByLabel(t.code,{exact:false}).fill('DN');await dialog.getByLabel(t.start,{exact:false}).fill('2026-11-01');await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(writes[0].managementStartDate,'2026-11-01');assert.ok(!('wagePerSecond' in writes[0]));
  }
  if(screen==='attendance'){await page.getByRole('heading',{level:1}).waitFor();await page.waitForFunction(()=>document.querySelector('body').innerText.includes('DEX LOGIS'));assert.ok(!(await page.locator('body').innerText()).includes('정동원'));}
  if(screen==='expense'){await page.getByTestId('expense-approval-stages').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-testid="expense-approval-button"]').disabled);}
  if(screen==='employees'){
   await page.getByRole('button',{name:({ko:'직원 추가',en:'Add Employee',vi:'Them nhan vien'})[lang],exact:true}).click();const drawer=page.locator('.MuiDrawer-paper');await drawer.waitFor();
   const payType=drawer.getByRole('combobox',{name:({ko:'급여 타입',en:'Pay Type',vi:'Loai luong'})[lang],exact:false});await payType.click();assert.equal(await page.getByRole('option').count(),1);await page.keyboard.press('Escape');
   assert.ok(!(await drawer.innerText()).includes('봉제'));assert.ok(!(await drawer.innerText()).includes('OUTPUT'));
  }
  if(screen==='salary'){
   await page.locator('[data-salary-rate-matrix]').getByText('STAFF',{exact:true}).waitFor();
   assert.equal(await page.locator('[data-salary-rate-matrix] thead tr').first().locator('th').count(),2,'Only the general pay type is shown');
   assert.ok(!(await page.locator('[data-salary-rate-matrix]').innerText()).includes('Production'));
  }
  if(screen==='registration'){
   await page.getByRole('button',{name:t.register,exact:true}).click();const dialog=page.getByRole('dialog');assert.equal(await dialog.getByLabel(t.admin,{exact:false}).inputValue(),'정동원');
   await dialog.getByRole('combobox',{name:t.template,exact:true}).click();await page.getByRole('option',{name:'BARO GARMENT',exact:true}).click();await dialog.getByRole('button',{name:t.create,exact:true}).click();await dialog.waitFor({state:'hidden'});
   assert.equal(writes[0].name,'DEX LOGIS');assert.equal(writes[0].adminName,'정동원');assert.equal(writes[0].managementStartDate,'2026-11-01');assert.equal(writes[0].templateOrgId,1);assert.equal(writes[0].country,'VN');assert.equal(writes[0].currencyCode,'VND');
  }
  assert.ok(!requests.includes('PRODUCTION'),screen+' must not fetch manufacturing data');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,screen+' overflow');assert.deepEqual(errors,[]);await page.close();
 }
 console.log('SERVICE company ko/en/vi desktop/mobile: dashboard, workplace registration, attendance exclusion, expense loading without production reads, and DEX first-admin registration passed.');
}finally{await browser?.close();server.kill();if(existsSync(fixture))unlinkSync(fixture);}
