export function invoiceBankInfo(accounts=[],currencyCode) {
  return accounts.filter(account=>account.currency?.code===currencyCode&&account.accountNumber)
    .map(account=>[account.bankName,account.accountNumber,account.accountHolder,currencyCode].filter(Boolean).join(' / ')).join('\n');
}
export function invoiceBankChoices(accounts=[],currencyCode){
 return accounts.filter(account=>account.isActive!==false&&(account.currency?.code||account.currencyCode)===currencyCode&&account.accountNumber&&(!account.accountKind||account.accountKind==='BANK'));
}
export function invoiceAccountText(account,currencyCode){
 return [account.bankName,account.accountNumber,account.accountHolder,currencyCode].filter(Boolean).join(' / ');
}
