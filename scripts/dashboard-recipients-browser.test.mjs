import assert from 'node:assert/strict';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {dashboardRecipientText,dashboardSettingsTitle} from '../frontend/src/constants/dashboardRecipientSettings.js';
const html='frontend/dashboard-recipients-test.html',jsx='frontend/dashboard-recipients-test.jsx',port=43523;
assert.ok(!existsSync(html)&&!existsSync(jsx));
writeFileSync(html,'<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dashboard-recipients-test.jsx"></script></html>');
writeFileSync(jsx,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Button}from'@mui/material';import{MemoryRouter}from'react-router-dom';import theme from'/src/theme';import{AppProvider}from'/src/context/AppContext';import{useAuth}from'/src/context/AuthContext';import Settings from'/src/components/DashboardRecipientSettings';import useVisibility from'/src/hooks/useAccountingAlertVisibility';
const params=new URLSearchParams(location.search),lang=params.get('lang');function Demo(){const[org,setOrg]=React.useState(1),[widget,setWidget]=React.useState(null),auth={...useAuth(),activeOrgId:org},visibility=useVisibility(auth);window.switchOrg=setOrg;return <><output data-testid="alert-visible">{String(Boolean(visibility.show))}</output>{auth.activeProfile.orgRole==='ADMIN'&&<><Button onClick={()=>setWidget({id:'notifications',label:'Notifications',orgId:org})}>Settings</Button><Button onClick={()=>setWidget({id:'work-requests',label:'Work requests',orgId:org})}>Other settings</Button><Button onClick={()=>setWidget({id:'suspected-errors',label:'Suspected errors',orgId:org})}>Error settings</Button></>}{widget?.orgId===org&&<Settings key={org} orgId={org} widget={widget} languageCode={lang} onClose={()=>setWidget(null)}/>}</>;}createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><MemoryRouter><AppProvider><Demo/></AppProvider></MemoryRouter></ThemeProvider>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/dashboard-recipients-test.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const policies=new Map([[1,{revision:0,handledRoles:['ADMIN','ACCOUNTANT']}],[2,{revision:0,handledRoles:['ADMIN','ACCOUNTANT']}]]),writes=[],errors=[],t=dashboardRecipientText[lang];let firstRead=true,firstSave=true;
  const setup=async role=>{
   const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
   await page.route('**/src/context/AuthContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`const p={entryType:'ORG',orgType:'SERVICE',orgRole:'${role}',orgId:1,employeeId:1};export const useAuth=()=>({activeOrgId:1,activeProfile:p,accessProfile:p,isAuthenticated:true});`}));
   await page.route('**/src/context/LanguageContext.jsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useLanguage=()=>({languageCode:'${lang}'});`}));
   await page.route(/\/dashboard\/(alert-recipients|accounting-alert-scope)\?/,async r=>{
    const request=r.request(),url=new URL(request.url()),org=Number(url.searchParams.get('orgId')),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
    if(request.method()==='OPTIONS')return r.fulfill({status:204,headers});
    if(url.pathname.endsWith('accounting-alert-scope'))return r.fulfill({headers,json:{handled:policies.get(org).handledRoles.includes(role)}});
    assert.equal(role,'ADMIN');const current=policies.get(org);
    if(request.method()==='GET'){if(firstRead){firstRead=false;return r.fulfill({status:503,headers,json:{error:'READ_FAILED'}});}return r.fulfill({headers,json:current});}
    assert.equal(request.method(),'PUT');const body=request.postDataJSON();writes.push({org,body});assert.deepEqual(Object.keys(body).sort(),body.uncodedRoles?['revision','uncodedRoles']:['handledRoles','revision']);
    if(current.revision!==body.revision){if(current.revision===body.revision+1&&JSON.stringify(current.handledRoles)===JSON.stringify(body.handledRoles))return r.fulfill({headers,json:current});return r.fulfill({status:409,headers,json:{error:'DASHBOARD_RECIPIENTS_CHANGED'}});}
    const next={...current,revision:current.revision+1,...(body.uncodedRoles?{uncodedRoles:body.uncodedRoles}:{handledRoles:body.handledRoles})};policies.set(org,next);
    if(firstSave){firstSave=false;return r.fulfill({status:503,headers,json:{error:'RESULT_UNKNOWN'}});}return r.fulfill({headers,json:next});
   });
   await page.goto(`http://127.0.0.1:${port}/dashboard-recipients-test.html?lang=${lang}`);return page;
  };
  const admin=await setup('ADMIN'),operator=await setup('OPERATOR');await operator.getByTestId('alert-visible').filter({hasText:'false'}).waitFor();assert.equal(await operator.getByRole('button',{name:'Settings',exact:true}).count(),0);
  await admin.getByRole('button',{name:'Settings',exact:true}).click();await admin.getByText(t.failed,{exact:true}).waitFor();let dialog=admin.getByRole('dialog');await dialog.getByRole('heading',{name:dashboardSettingsTitle('Notifications',lang),exact:true}).waitFor();assert.equal(await dialog.getByRole('checkbox').count(),0);await admin.getByRole('button',{name:t.retry,exact:true}).click();await dialog.getByRole('checkbox',{name:t.ACCOUNTANT,exact:true}).waitFor();
  assert.equal(await dialog.getByRole('checkbox',{name:t.ADMIN,exact:true}).isChecked(),true);assert.equal(await dialog.getByRole('checkbox',{name:t.ADMIN,exact:true}).isDisabled(),false);
  const boxes=await dialog.getByRole('checkbox').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y};}));
  if(width>600){assert.equal(boxes[0].y,boxes[1].y);assert.ok(boxes[1].x>boxes[0].x);}
  assert.equal(await dialog.getByText(t.mandatory,{exact:true}).count(),0);
  assert.equal(await dialog.getByText(t.permission,{exact:true}).count(),0);
  await dialog.getByRole('checkbox',{name:t.ADMIN,exact:true}).uncheck();
  await dialog.getByRole('checkbox',{name:t.ACCOUNTANT,exact:true}).uncheck();await dialog.getByRole('checkbox',{name:t.OPERATOR,exact:true}).check();await dialog.getByRole('button',{name:t.save,exact:true}).click();await admin.getByText(t.failed,{exact:true}).waitFor();assert.equal(await dialog.getByRole('checkbox',{name:t.OPERATOR,exact:true}).isChecked(),true);
  await admin.getByRole('button',{name:t.retry,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(policies.get(1),{revision:1,handledRoles:['OPERATOR']});
  await operator.evaluate(async()=>{const{emitWorkspaceDataChanged}=await import('/src/utils/workspaceDataEvents.js');emitWorkspaceDataChanged({orgId:1,topics:['accounting-alerts']});});await operator.getByTestId('alert-visible').filter({hasText:'true'}).waitFor();
  await admin.getByRole('button',{name:'Settings',exact:true}).click();dialog=admin.getByRole('dialog');await dialog.getByRole('checkbox',{name:t.OPERATOR,exact:true}).waitFor();assert.equal(await dialog.getByRole('checkbox',{name:t.OPERATOR,exact:true}).isChecked(),true);assert.equal(await dialog.getByRole('checkbox',{name:t.ACCOUNTANT,exact:true}).isChecked(),false);
  // A second administrator changes the company rule while this form stays open.
  policies.set(1,{revision:2,handledRoles:['ADMIN','ACCOUNTANT','OPERATOR']});await dialog.getByRole('checkbox',{name:t.OPERATOR,exact:true}).uncheck();await dialog.getByRole('button',{name:t.save,exact:true}).click();await admin.getByText(t.changed,{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:t.save,exact:true}).isDisabled(),true);assert.equal(await dialog.getByRole('checkbox',{name:t.OPERATOR,exact:true}).isChecked(),false);
  await admin.getByRole('button',{name:t.reload,exact:true}).click();await admin.getByRole('button',{name:({ko:'변경 사항 버리기',en:'Discard changes',vi:'Bỏ thay đổi'})[lang],exact:true}).click();await dialog.getByRole('checkbox',{name:t.ACCOUNTANT,exact:true}).check();await admin.waitForFunction(()=>document.querySelectorAll('[role=dialog] input[type=checkbox]:checked').length===3);
  assert.equal(await dialog.evaluate(node=>node.scrollWidth>node.clientWidth+1),false);await dialog.getByRole('button',{name:t.close,exact:true}).click();await dialog.waitFor({state:'hidden'});
  await admin.getByRole('button',{name:'Other settings',exact:true}).click();dialog=admin.getByRole('dialog');await dialog.getByText(t.empty,{exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:t.save,exact:true}).count(),0);await dialog.getByRole('button',{name:t.close,exact:true}).click();await dialog.waitFor({state:'hidden'});
  const preserved=policies.get(1).handledRoles;await admin.getByRole('button',{name:'Error settings',exact:true}).click();dialog=admin.getByRole('dialog');await dialog.getByText(t.uncoded,{exact:true}).waitFor();await dialog.getByRole('checkbox',{name:t.ADMIN,exact:true}).uncheck();await dialog.getByRole('checkbox',{name:t.ACCOUNTANT,exact:true}).uncheck();await dialog.getByRole('button',{name:t.save,exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(policies.get(1).uncodedRoles,[]);assert.deepEqual(policies.get(1).handledRoles,preserved);
  await admin.evaluate(()=>window.switchOrg(2));await admin.getByRole('button',{name:'Settings',exact:true}).click();dialog=admin.getByRole('dialog');await dialog.getByRole('checkbox',{name:t.ACCOUNTANT,exact:true}).waitFor();assert.equal(await dialog.getByRole('checkbox',{name:t.OPERATOR,exact:true}).isChecked(),false);assert.equal(policies.get(2).revision,0);assert.deepEqual(errors,[]);await admin.close();await operator.close();console.log('PASS company recipients',lang,width);
 }
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
