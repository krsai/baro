import assert from 'node:assert/strict';
export async function enterRouteAddress(page,node,address,t){
 const card=page.locator(`button[data-route-node="${node}"]`);await card.click();const dialog=page.getByTestId('route-address-dialog');
 assert.equal(await dialog.getByRole('textbox',{name:t.savedAddress,exact:true}).getAttribute('placeholder'),t.addressPlaceholder);
 assert.equal(await dialog.locator('.MuiDialogActions-root').count(),1);
 await dialog.locator('.MuiDialogActions-root').getByRole('button',{name:t.applyLocation,exact:true}).waitFor();
 const addressPaper=dialog.locator('.MuiDialog-paper');if(page.viewportSize().width>=1000)assert.ok((await addressPaper.boundingBox()).width>=800);
 await dialog.getByRole('textbox',{name:t.savedAddress,exact:true}).fill(address);await dialog.getByRole('button',{name:t.applyLocation,exact:true}).click();
 await dialog.waitFor({state:'hidden'});assert.equal(await card.getAttribute('data-complete'),'true');
}
export async function enterRoutePort(page,node,code,lang,t,{retry=false,terminal=''}={}){
 const card=page.locator(`button[data-route-node="${node}"]`);await card.click();const dialog=page.locator('[data-lookup-dialog="true"]');
 if(page.viewportSize().width>=1000)assert.ok((await dialog.locator('.MuiDialog-paper').boundingBox()).width>=800);
 if(retry){await dialog.getByRole('textbox',{name:t.locationSearch,exact:true}).fill('Ha');await dialog.locator('[data-table-status=error]').waitFor();await dialog.locator('[data-table-status=error]').getByRole('button').click();}
 if(terminal)await dialog.getByRole('textbox',{name:t.terminalName,exact:true}).fill(terminal);
 await dialog.getByRole('textbox',{name:t.locationSearch,exact:true}).fill(code);const row=dialog.getByRole('row').filter({hasText:code});await row.waitFor();
 const header=dialog.getByRole('columnheader',{name:t.portCode,exact:true});assert.equal(await header.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length;}),1,'UN/LOCODE must remain on one line');
 assert.equal(await dialog.locator('.MuiDialog-paper').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'only the table may scroll horizontally');
 await row.getByRole('button',{name:code,exact:true}).click();await dialog.getByRole('button',{name:t.applyLocation,exact:true}).click();
 await dialog.waitFor({state:'hidden'});assert.equal(await card.getAttribute('data-complete'),'true');
}

export async function selectContainer(page,row,t,size,type){await row.getByRole('combobox',{name:t.containerSize,exact:true}).click();await page.getByRole('option',{name:size+"'",exact:true}).click();await row.getByRole('combobox',{name:t.containerType,exact:true}).click();await page.getByRole('option',{name:type,exact:true}).click();}
