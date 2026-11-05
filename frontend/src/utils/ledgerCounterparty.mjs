export const sameLedgerParty=(a,b)=>Boolean(a&&b&&a.kind===b.kind&&String(a.id)===String(b.id));
export const ledgerDocumentPartyMismatch=row=>Boolean(row.entryKind==='BANK'&&row.document?.counterparty&&row.counterparty&&!sameLedgerParty(row.document.counterparty,row.counterparty));
