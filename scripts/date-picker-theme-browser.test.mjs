import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(existsSync);
assert.ok(executablePath,'Chrome required');
const fixture=path.resolve('frontend/date-picker-theme-acceptance.html');
assert.ok(!existsSync(fixture));
writeFileSync(fixture,`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Stack,Box,TextField,Autocomplete,MenuItem,Button} from '@mui/material';import theme from '/src/theme';import Picker from '/src/components/CustomDatePicker.jsx';import Month from '/src/components/MonthSelector.jsx';import Range from '/src/components/MonthRangeSelector.jsx';import '/src/styles/form.css';
const h=React.createElement,lang=new URLSearchParams(location.search).get('lang');
function App(){const[day,setDay]=React.useState('2026-10-15'),[month,setMonth]=React.useState('2026-10-01'),[native,setNative]=React.useState('2026-10'),[start,setStart]=React.useState('2026-10-15'),[end,setEnd]=React.useState('2026-10-20');return h(ThemeProvider,{theme},h(CssBaseline),h(Stack,{spacing:3,sx:{p:3}},h(Box,{'data-testid':'date'},h(Picker,{label:'Date',adapterLocale:lang,value:day,minDate:'2026-10-10',maxDate:'2026-10-20',onChange:v=>setDay(v.format('YYYY-MM-DD'))})),h(Box,{'data-testid':'month'},h(Picker,{label:'Month',monthOnly:true,adapterLocale:lang,value:month,minDate:'2026-04-01',maxDate:'2027-12-31',onChange:v=>setMonth(v.format('YYYY-MM-DD'))})),h(Box,{'data-testid':'native'},h(Month,{value:native,onChange:setNative,min:'2026-04',max:'2026-11',label:'Native month'})),h(Box,{'data-testid':'range'},h(Range,{languageCode:lang,onShift:()=>{},monthOnly:false,startValue:start,endValue:end,onStartChange:v=>setStart(v.format('YYYY-MM-DD')),onEndChange:v=>setEnd(v.format('YYYY-MM-DD'))})),h(Box,{'data-testid':'controls'},h(TextField,{label:'Text'}),h(TextField,{label:'Select',select:true,defaultValue:'one'},h(MenuItem,{value:'one'},'One')),h(Autocomplete,{options:['Alpha','Beta'],renderInput:params=>h(TextField,{...params,label:'Autocomplete'})}),h(TextField,{label:'Notes',multiline:true,minRows:3}),h(Autocomplete,{multiple:true,options:['Long selected item A','Long selected item B','Long selected item C'],defaultValue:['Long selected item A','Long selected item B','Long selected item C'],sx:{width:200},renderInput:params=>h(TextField,{...params,label:'Multiple'})}),h(Button,{},'Action')),h('output',null,JSON.stringify({day,month,native,start,end}))));}createRoot(document.getElementById('root')).render(h(App));
</script></body></html>`);
const port=43219,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore'});
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/date-picker-theme-acceptance.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath,headless:true});
  for(const lang of ['ko','en','vi']){
    const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    await page.route('**/src/context/ManagementPeriodContext.jsx*',route=>route.fulfill({contentType:'application/javascript',body:'export const useManagementPeriod=()=>({startDate:"2026-04-01",loading:false,factories:[]});'}));
    await page.goto(`http://127.0.0.1:${port}/date-picker-theme-acceptance.html?lang=${lang}`);
    const state=async()=>JSON.parse(await page.locator('output').textContent());
    await page.getByTestId('date').locator('button').waitFor();
    for(const id of ['date','month','native']) {
      const height=await page.getByTestId(id).locator('.MuiInputBase-root, .MuiPickersInputBase-root').first().evaluate(el=>el.getBoundingClientRect().height);
      assert.equal(height,36,id+' field height');
    }
    const controls=page.getByTestId('controls');
    const controlRoots=controls.locator('.MuiOutlinedInput-root');
    for(const index of [0,1,2]) assert.equal((await controlRoots.nth(index).boundingBox()).height,36,'Standard control '+index);
    assert.ok((await controlRoots.nth(3).boundingBox()).height>36,'Multiline grows');
    assert.ok((await controlRoots.nth(4).boundingBox()).height>36,'Multiple selection grows');
    assert.equal((await controls.getByRole('button',{name:'Action',exact:true}).boundingBox()).height,36);
    const range=page.getByTestId('range');
    assert.equal((await range.getByRole('button').first().boundingBox()).height,36);
    for (const icon of ['ChevronLeftIcon','ChevronRightIcon']) {
      const arrow=range.getByTestId(icon);
      assert.equal((await arrow.boundingBox()).width,16);
      assert.equal((await arrow.locator('..').boundingBox()).width,20);
    }
    assert.equal((await range.getByRole('button',{name:'M+',exact:true}).boundingBox()).height,17);
    assert.equal((await range.getByRole('button',{name:'M-',exact:true}).boundingBox()).height,17);
    const fields=await range.locator('.MuiPickersInputBase-root').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
    assert.deepEqual(fields,[36,36]);
    await page.getByTestId('date').locator('button').click();
    const selected=page.locator('.MuiPickersDay-root.Mui-selected');
    await selected.waitFor();
    await page.waitForFunction(()=>['rgb(234, 242, 255)','rgb(201, 220, 255)'].includes(getComputedStyle(document.querySelector('.MuiPickersDay-root.Mui-selected')).backgroundColor));
    assert.ok(['rgb(234, 242, 255)','rgb(201, 220, 255)'].includes(await selected.evaluate(el=>getComputedStyle(el).backgroundColor)));
    assert.equal(await selected.evaluate(el=>getComputedStyle(el).color),'rgb(37, 99, 235)');
    const paper=page.locator('.MuiPickerPopper-paper');
    assert.equal(await paper.evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(231, 236, 242)');
    await page.getByRole('gridcell',{name:'9',exact:true}).isDisabled().then(value=>assert.equal(value,true));
    await page.getByRole('gridcell',{name:'16',exact:true}).click();
    assert.equal((await state()).day,'2026-10-16');
    await page.getByTestId('month').locator('button').click();
    const selectedMonth=page.locator('.MuiMonthCalendar-button.Mui-selected');
    await selectedMonth.waitFor();
    await page.waitForFunction(()=>['rgb(234, 242, 255)','rgb(201, 220, 255)'].includes(getComputedStyle(document.querySelector('.MuiMonthCalendar-button.Mui-selected')).backgroundColor));
    await page.locator('.MuiMonthCalendar-button').nth(10).click();
    assert.equal((await state()).month,'2026-11-01');
    await page.getByTestId('native').getByRole('button',{name:'M+',exact:true}).click();
    assert.equal((await state()).native,'2026-11');
    assert.equal(await page.getByTestId('native').getByRole('button',{name:'M+',exact:true}).isDisabled(),true);
    await page.getByTestId('range').getByRole('button').first().click();
    assert.equal((await state()).start,'2026-09-01');
    assert.equal((await state()).end,'2026-10-20');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('Date picker theme passed: ko/en/vi pastel selection and popup border, day bounds, month normalization, native month max and independent range navigation. No PNG generated.');
}finally{await browser?.close();server.kill();unlinkSync(fixture);}
