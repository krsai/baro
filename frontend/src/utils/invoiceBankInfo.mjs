export function invoiceBankInfo(accounts=[]) {
 return accounts.filter(a=>a.isDefault===true&&a.isActive!==false&&(!a.accountKind||a.accountKind==='BANK')&&a.accountNumber).map(a=>[a.bankName,a.accountNumber,a.accountHolder,a.currency?.code||a.currencyCode].filter(Boolean).join(' / ')).join('\n');
}
export function invoiceBankChoices(accounts=[],currencyCode){
 return accounts.filter(account=>account.isActive!==false&&(account.currency?.code||account.currencyCode)===currencyCode&&account.accountNumber&&(!account.accountKind||account.accountKind==='BANK'));
}
export function invoiceAccountText(account,currencyCode){
 return [account.bankName,account.accountNumber,account.accountHolder,currencyCode].filter(Boolean).join(' / ');
}
