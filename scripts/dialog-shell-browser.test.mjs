import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';

const file=path.resolve('frontend/dialog-shell-acceptance.html'),port=43457;
assert.ok(!existsSync(file));
writeFileSync(file,`<!doctype html><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ThemeProvider,CssBaseline,Button,DialogTitle,DialogContent,DialogActions,Stack,TextField} from '@mui/material';
import AppDialog from '/src/components/AppDialog';import ListDetailDialog from '/src/components/ListDetailDialog';import DialogRecordList from '/src/components/DialogRecordList';import DialogRecordActions from '/src/components/DialogRecordActions';import PageActions from '/src/components/PageActions';import theme from '/src/theme';
const e=React.createElement,p=new URLSearchParams(location.search),lang=p.get('lang'),mode=p.get('mode'),t={ko:['등록 정보와 연락처 관리','닫기','선택한 정보를 현재 문서에 적용','새 항목','삭제','수정 내용 저장'],en:['Manage records and contacts','Close','Apply selected record to document','New record','Delete','Save record changes'],vi:['Quản lý thông tin và liên hệ','Đóng','Áp dụng thông tin vào chứng từ','Thêm mới','Xóa','Lưu thông tin chỉnh sửa']}[lang];
function Screen(){const [open,setOpen]=React.useState(true),[nested,setNested]=React.useState(false),[name,setName]=React.useState('Preserved draft'),[selected,setSelected]=React.useState(1),[query,setQuery]=React.useState('');
 const body=e(Stack,{spacing:2},e(TextField,{label:'Name',value:name,onChange:ev=>setName(ev.target.value)}),e(TextField,{label:'Address'}),e('div',{style:{height:1300,flexShrink:0}},'Long editable content'));
 const actions=e(PageActions,{secondary:e(Button,{onClick:()=>setOpen(false)},t[1]),primary:e(Button,{variant:'contained'},t[2])});
 const shell=mode==='manager'?e(ListDetailDialog,{open,onClose:()=>setOpen(false),title:t[0],onNew:()=>setSelected(null),newLabel:t[3],search:e(TextField,{fullWidth:true,label:'Search',value:query,onChange:ev=>setQuery(ev.target.value)}),list:e(DialogRecordList,{languageCode:lang,rows:Array.from({length:35},(_,i)=>({id:i+1,name:'Record '+(i+1),phone:'090000'+i})),columns:[{key:'name',label:'Name',value:r=>r.name},{key:'phone',label:'Phone',value:r=>r.phone}],selectedKey:selected,onSelect:r=>setSelected(r.id)}),frameDetail:true,detailTitle:'Record information',detail:body,detailFooter:e(DialogRecordActions,{onDelete:()=>setSelected(null),deleteLabel:t[4],onSave:()=>{},saveLabel:t[5]}),actions}):e(AppDialog,{open,onClose:()=>setOpen(false),fullWidth:true,maxWidth:'md',fullScreen:mode==='fullscreen'},e(DialogTitle,null,e(Stack,{direction:'row',alignItems:'center',justifyContent:'space-between',gap:1},e('span',null,t[0]),e(Button,{onClick:()=>setNested(true)},'Open nested'))),e(DialogContent,null,body),e(DialogActions,null,actions));
 return e(ThemeProvider,{theme},e(CssBaseline),shell,e(AppDialog,{open:nested,onClose:()=>setNested(false)},e(DialogTitle,null,'Nested record'),e(DialogContent,null,e(TextField,{label:'Nested name'})),e(DialogActions,null,e(Button,{onClick:()=>setNested(false)},'Close nested'))));}
createRoot(document.getElementById('root')).render(e(Screen));
</script>`);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.resolve('frontend'),stdio:'ignore',windowsHide:true});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/dialog-shell-acceptance.html`)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium'].find(existsSync),headless:true});
 for(const lang of ['ko','en','vi'])for(const mode of ['form','manager','fullscreen'])for(const [width,height] of [[1920,900],[900,900],[600,900],[390,900],[320,900],[900,360]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto(`http://127.0.0.1:${port}/dialog-shell-acceptance.html?lang=${lang}&mode=${mode}`);
  const dialog=page.locator('[data-app-dialog=true] [role=dialog]').first();await dialog.waitFor();
  await dialog.getByRole('textbox',{name:'Name',exact:true}).fill('Edited draft');
  const geometry=await dialog.evaluate(el=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};const content=el.querySelector(':scope > .MuiDialogContent-root'),title=el.querySelector(':scope > .MuiDialogTitle-root'),footer=el.querySelector(':scope > .MuiDialogActions-root');return {paper:rect(el),title:rect(title),content:rect(content),footer:rect(footer),buttons:[...footer.querySelectorAll('button')].map(rect),radius:getComputedStyle(el).borderRadius};});
  assert.ok(geometry.paper.x>=-1&&geometry.paper.y>=-1&&geometry.paper.x+geometry.paper.w<=width+1&&geometry.paper.y+geometry.paper.h<=height+1,JSON.stringify({mode,width,height,geometry}));
  for(const b of geometry.buttons)assert.ok(b.x>=geometry.paper.x-1&&b.x+b.w<=geometry.paper.x+geometry.paper.w+1&&b.y+b.h<=height+1);
  assert.ok(geometry.buttons[0].y<geometry.buttons[1].y+1||geometry.buttons[0].x<geometry.buttons[1].x);
  await dialog.locator(':scope > .MuiDialogContent-root').evaluate(el=>el.scrollTop=el.scrollHeight);
  const after=await dialog.locator(':scope > .MuiDialogActions-root').boundingBox();assert.ok(Math.abs(after.y-geometry.footer.y)<1,'Body scrolling cannot move footer');
  if(mode==='fullscreen'){assert.equal(Math.round(geometry.paper.w),width);assert.equal(Math.round(geometry.paper.h),height);assert.equal(geometry.radius,'0px');}
  if(mode==='form'){
   await dialog.getByRole('button',{name:'Open nested',exact:true}).click();const nested=page.getByRole('dialog').last();await nested.getByRole('textbox',{name:'Nested name',exact:true}).fill('Child draft');await nested.getByRole('button',{name:'Close nested',exact:true}).click();assert.equal(await dialog.getByRole('textbox',{name:'Name',exact:true}).inputValue(),'Edited draft');
  }
  if(mode==='manager'){
   const panes=await dialog.locator('[data-list-detail] > div').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width};}));if(width>=900)assert.ok(Math.abs(panes[0].y-panes[1].y)<2,'List and detail begin on the same line');else assert.ok(panes[1].y>panes[0].y,'Mobile detail follows list');
   await dialog.getByRole('button',{name:'Record 2',exact:true}).click();assert.equal(await dialog.getByRole('button',{name:'Record 2',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await dialog.getByRole('textbox',{name:'Name',exact:true}).inputValue(),'Edited draft','Preview does not reset the independent editor');
   if(lang==='ko'&&[1920,390].includes(width)&&height===900){await dialog.locator(':scope > .MuiDialogContent-root').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(tmpdir(),'baro-dialog-manager-'+width+'.png'),animations:'disabled'});}
  }
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS shared dialogs: ko/en/vi, 54 form/manager/fullscreen viewport combinations, scrolling, aligned actions, nested draft preservation and record preview.');
}finally{await browser?.close();server.kill();unlinkSync(file);}
