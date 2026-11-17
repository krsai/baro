import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {chromium} from 'playwright-core';
const html='frontend/dashboard-hover-acceptance.html',jsx='frontend/dashboard-hover-acceptance.jsx',port=43493;
for(const file of [html,jsx])assert.ok(!existsSync(file));
writeFileSync(html,'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/dashboard-hover-acceptance.jsx"></script>');
writeFileSync(jsx,`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,CssBaseline,Box,Button}from'@mui/material';import theme from'/src/theme';import Item from'/src/components/DashboardAlertItem';const lang=new URLSearchParams(location.search).get('lang');window.sourceCount=0;window.reviewCount=0;createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><Box sx={{p:2,maxWidth:800,display:'grid',gap:2}}><Item title="Accounting mismatch" detail="2026-11-04 · DEX LOGIS · LNCE" languageCode={lang} showConfirm={false} onClick={()=>window.sourceCount++} actions={<Button size="small" onClick={()=>window.reviewCount++}>Review</Button>}/><Item title="Missing records" detail="HANOI · 0 / 60" countLabel="2" kind="missing-record" languageCode={lang} onClick={()=>window.sourceCount++}/><Item title="Pending" detail="Waiting for approval" languageCode={lang} showConfirm={false} actions={<Button size="small" disabled>Pending</Button>}/></Box></ThemeProvider>);
`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:'frontend',stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/dashboard-hover-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 for(const lang of ['ko','en','vi'])for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${port}/dashboard-hover-acceptance.html?lang=${lang}`);
  const cards=page.locator('[data-dashboard-card]');await cards.first().waitFor();
  for(const card of await cards.all()){
   const main=card.locator('[data-dashboard-card-main]'),actions=card.locator('[data-dashboard-card-actions]');
   const colors=()=>card.evaluate(root=>{const effective=node=>{for(let n=node;n;n=n.parentElement){const color=getComputedStyle(n).backgroundColor;if(color!=='transparent'&&color!=='rgba(0, 0, 0, 0)')return color;}return 'transparent';};return {row:effective(root),main:effective(root.querySelector('[data-dashboard-card-main]')),actions:effective(root.querySelector('[data-dashboard-card-actions]')),button:effective(root.querySelector('[data-dashboard-card-actions] button'))};});
   await main.hover();let c=await colors();assert.notEqual(c.row,'rgb(255, 255, 255)');assert.notEqual(c.row,'transparent');assert.ok(Object.values(c).every(color=>color===c.row),JSON.stringify(c));
   await actions.getByRole('button').hover({force:true});c=await colors();assert.ok(Object.values(c).every(color=>color===c.row),JSON.stringify(c));
  }
  const review=cards.first().getByRole('button',{name:'Review',exact:true});await review.focus();let c=await cards.first().evaluate(el=>getComputedStyle(el).backgroundColor);assert.notEqual(c,'rgba(0, 0, 0, 0)');await review.press('Enter');assert.equal(await page.evaluate(()=>window.reviewCount),1);assert.equal(await page.evaluate(()=>window.sourceCount),0,'review does not also open the source');await cards.first().getByRole('button',{name:/Accounting mismatch/}).click();assert.equal(await page.evaluate(()=>window.sourceCount),1);assert.equal(await page.evaluate(()=>window.reviewCount),1);
  assert.equal(await cards.last().getByRole('button',{name:'Pending',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);await page.close();console.log('PASS full dashboard card hover/focus',lang,width);
 }
}finally{await browser?.close();server.kill();for(const file of [html,jsx])if(existsSync(file))unlinkSync(file);}
