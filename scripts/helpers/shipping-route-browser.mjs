import assert from 'node:assert/strict';
export async function enterRouteAddress(page,node,address,t){
 const card=page.locator(`button[data-route-node="${node}"]`);await card.click();const dialog=page.getByTestId('route-address-dialog');
 await dialog.getByRole('textbox',{name:t.savedAddress,exact:true}).fill(address);await dialog.getByRole('button',{name:t.applyLocation,exact:true}).click();
 await dialog.waitFor({state:'hidden'});assert.equal(await card.getAttribute('data-complete'),'true');
}
export async function enterRoutePort(page,node,code,lang,t,{retry=false}={}){
 const card=page.locator(`button[data-route-node="${node}"]`);await card.click();const dialog=page.locator('[data-lookup-dialog="true"]');
 if(retry){await dialog.getByRole('textbox').fill('Ha');await dialog.getByText(t.failed,{exact:true}).waitFor();await dialog.getByRole('button',{name:t.retry,exact:true}).click();}
 await dialog.getByRole('textbox').fill(code);const row=dialog.getByRole('row').filter({hasText:code});await row.getByRole('button',{name:lang==='ko'?'선택':lang==='en'?'Select':'Chọn',exact:true}).click();
 await dialog.waitFor({state:'hidden'});assert.equal(await card.getAttribute('data-complete'),'true');
}
