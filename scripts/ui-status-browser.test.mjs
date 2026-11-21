import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const html='frontend/ui-status-acceptance.html',entry='frontend/ui-status-acceptance.jsx',port=43537;
assert.ok(!existsSync(html)&&!existsSync(entry));
writeFileSync(html,'<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/ui-status-acceptance.jsx"></script>');
writeFileSync(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Table,TableHead,TableBody,TableRow,TableCell,TableContainer,Button}from'@mui/material';import theme from'/src/theme';import Status from'/src/components/TableStatusRow';import Pagination from'/src/components/ListPagination';const languageCode=new URLSearchParams(location.search).get('lang');function App(){const [state,setState]=React.useState('loading');return <ThemeProvider theme={theme}><CssBaseline/><Button onClick={()=>setState('empty')}>Finish</Button><Button onClick={()=>setState('error')}>Fail</Button>{[2,10].map(columns=><TableContainer key={columns} data-testid={'table-'+columns}><Table><TableHead><TableRow>{Array.from({length:columns},(_,i)=><TableCell key={i}>Column {i}</TableCell>)}</TableRow></TableHead><TableBody><Status languageCode={languageCode} state={state} colSpan={columns} onRetry={()=>setState('loading')}/></TableBody></Table></TableContainer>)}<Pagination languageCode={languageCode} previousDisabled nextDisabled={false} onNext={()=>window.nextCount=(window.nextCount||0)+1}/></ThemeProvider>}createRoot(document.getElementById('root')).render(<App/>);`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/ui-status-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/ui-status-acceptance.html?lang=${lang}`);
  await page.locator('[data-table-status="loading"]').first().waitFor();assert.equal(await page.locator('[data-table-status="empty"]').count(),0);await page.getByRole('button',{name:'Finish',exact:true}).click();
  const styles=await page.locator('[data-table-status="empty"] td').evaluateAll(cells=>cells.map(c=>({height:c.getBoundingClientRect().height,align:getComputedStyle(c).textAlign,color:getComputedStyle(c).color,text:c.innerText,position:getComputedStyle(c).position})));assert.equal(styles.length,2);assert.deepEqual(styles[0],styles[1]);assert.ok(styles[0].height>=84&&styles[0].height<=85);assert.equal(styles[0].align,'center');
  await page.getByRole('button',{name:'Fail',exact:true}).click();const failure=page.locator('[data-table-status="error"]').first();assert.equal(await failure.locator('td').evaluate(c=>getComputedStyle(c).position),'static');await failure.getByRole('button').click();assert.equal(await page.locator('[data-table-status="loading"]').count(),2);
  const navigation=page.locator('[data-list-pagination]');assert.equal(await navigation.getByRole('button').first().isDisabled(),true);await navigation.getByRole('button').last().click();assert.equal(await page.evaluate(()=>window.nextCount),1);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: ko/en/vi desktop/mobile shared empty geometry, loading/error/retry, non-sticky status and pagination behavior.');
}finally{await browser?.close();server.kill();unlinkSync(html);unlinkSync(entry);}

