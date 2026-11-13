import assert from 'node:assert/strict';
export async function enterRouteAddress(page,node,address,t){
 const card=page.locator(`button[data-route-node="${node}"]`);await card.click();const dialog=page.getByTestId('route-address-dialog');
 assert.equal(await dialog.getByRole('textbox',{name:t.savedAddress,exact:true}).getAttribute('placeholder'),t.addressPlaceholder);
 assert.equal(await dialog.locator('.MuiDialogActions-root').count(),0);
 const addressPaper=dialog.locator('.MuiDialog-paper');if(page.viewportSize().width>=1000)assert.ok((await addressPaper.boundingBox()).width>=800);
 await dialog.getByRole('textbox',{name:t.savedAddress,exact:true}).fill(address);await dialog.getByRole('button',{name:t.applyLocation,exact:true}).click();
 await dialog.waitFor({state:'hidden'});assert.equal(await card.getAttribute('data-complete'),'true');
}
export async function enterRoutePort(page,node,code,lang,t,{retry=false}={}){
 const card=page.locator(`button[data-route-node="${node}"]`);await card.click();const dialog=page.locator('[data-lookup-dialog="true"]');
 if(page.viewportSize().width>=1000)assert.ok((await dialog.locator('.MuiDialog-paper').boundingBox()).width>=800);
 if(retry){await dialog.getByRole('textbox').fill('Ha');await dialog.getByText(t.failed,{exact:true}).waitFor();await dialog.getByRole('button',{name:t.retry,exact:true}).click();}
 await dialog.getByRole('textbox').fill(code);const row=dialog.getByRole('row').filter({hasText:code});await row.waitFor();
 const header=dialog.getByRole('columnheader',{name:t.portCode,exact:true});assert.equal(await header.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length;}),1,'UN/LOCODE must remain on one line');
 assert.equal(await dialog.locator('.MuiDialog-paper').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'only the table may scroll horizontally');
 await row.getByRole('button',{name:lang==='ko'?'선택':lang==='en'?'Select':'Chọn',exact:true}).click();
 await dialog.waitFor({state:'hidden'});assert.equal(await card.getAttribute('data-complete'),'true');
}
