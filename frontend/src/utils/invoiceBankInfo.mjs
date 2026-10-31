export function invoiceBankInfo(accounts=[],currencyCode) {
  return accounts.filter(account=>account.currency?.code===currencyCode&&account.accountNumber)
    .map(account=>[account.bankName,account.accountNumber,account.accountHolder,currencyCode].filter(Boolean).join(' / ')).join('\n');
}
