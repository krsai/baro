import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const html=path.resolve('frontend/notification-toast-acceptance.html'),source=html.replace('.html','.jsx');assert.ok(!existsSync(html)&&!existsSync(source));
writeFileSync(html,'<!doctype html><html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/notification-toast-acceptance.jsx"></script>');
writeFileSync(source,`import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Box,Button,Dialog,DialogContent} from '@mui/material';import theme from '/src/theme';import {AppProvider,useAppActions} from '/src/context/AppContext';import Notice from '/src/components/ActionNotice';
const message={ko:'저장했습니다.',en:'Saved.',vi:'Đã lưu.'}[new URLSearchParams(location.search).get('lang')];
function Demo(){const {showNotification}=useAppActions(),[event,setEvent]=React.useState(null),[modal,setModal]=React.useState(false);return <Box sx={{p:2}}><Button onClick={()=>setEvent({severity:'success',message})}>Save</Button><Button onClick={()=>setEvent({severity:'error',message:'Check input'})}>Fail</Button><Button onClick={()=>setModal(true)}>Dialog</Button><Button onClick={()=>showNotification('Replacement','success')}>Replace</Button><Button onClick={()=>showNotification('Long message '.repeat(30),'success')}>Long</Button>{event&&<Notice severity={event.severity} eventKey={event}>{event.message}</Notice>}<Box data-testid="form" sx={{height:100}}>Form</Box><Dialog open={modal} onClose={()=>setModal(false)}><DialogContent><Button onClick={()=>setEvent({severity:'success',message})}>Save in dialog</Button></DialogContent></Dialog></Box>;}createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><AppProvider><Demo/></AppProvider></ThemeProvider>);`);
const port=43285,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/notification-toast-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${port}/notification-toast-acceptance.html?lang=${lang}`);const before=await page.getByTestId('form').boundingBox();
  await page.getByRole('button',{name:'Save',exact:true}).click();const toast=page.getByRole('status');await toast.waitFor();assert.equal(await page.getByRole('status').count(),1);assert.equal((await page.getByTestId('form').boundingBox()).y,before.y);const box=await toast.boundingBox();assert.ok(box.y<40&&box.x>=0&&box.x+box.width<=width);assert.ok(Math.abs(box.x+box.width/2-width/2)<2);
  await toast.waitFor({state:'hidden',timeout:4500});assert.equal((await page.getByTestId('form').boundingBox()).y,before.y);
  await page.getByRole('button',{name:'Save',exact:true}).click();await toast.waitFor();await page.getByRole('button',{name:'Replace',exact:true}).click();await toast.getByText('Replacement',{exact:true}).waitFor();assert.equal(await page.getByRole('status').count(),1);await toast.getByRole('button').click();await toast.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Long',exact:true}).click();await toast.waitFor();assert.equal(await toast.evaluate(node=>node.scrollWidth>node.clientWidth+1),false);await toast.getByRole('button').click();
  await page.getByRole('button',{name:'Fail',exact:true}).click();await page.getByRole('alert').getByText('Check input',{exact:true}).waitFor();assert.equal(await page.getByRole('status').count(),0);
  await page.getByRole('button',{name:'Dialog',exact:true}).click();await page.getByRole('button',{name:'Save in dialog',exact:true}).click();await toast.waitFor();const point=await toast.boundingBox();assert.ok(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('[role="status"]')),{x:point.x+point.width/2,y:point.y+point.height/2}));
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Global toast passed ko/en/vi desktop/mobile: no layout shift, auto dismissal, repeated success, replacement, close, long text, persistent validation errors and modal stacking.');
}finally{await browser?.close();server.kill();unlinkSync(html);unlinkSync(source);}
