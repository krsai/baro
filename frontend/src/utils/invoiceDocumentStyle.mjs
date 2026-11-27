// Shared compact app and PDF tone; print uses stored values only.
export const invoiceDocumentCss = `
.invoice-sheet{box-sizing:border-box;width:100%;max-width:100%;min-width:0;background:#fff;color:#182b3d;font:13px Arial,sans-serif}
.invoice-sheet *{box-sizing:border-box}
.invoice-sheet .invoice-heading{font-size:21px;font-weight:700;letter-spacing:1px;margin:0;padding:0 0 16px;line-height:1.4}
.invoice-sheet .invoice-metadata{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 20px}
.invoice-sheet .invoice-document-top{display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:2px solid #182b3d;padding-bottom:12px}
.invoice-sheet .invoice-document-top .invoice-heading{padding:0}
.invoice-sheet .invoice-document-identifiers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;width:60%;max-width:560px;min-width:0}
.invoice-sheet .invoice-party-identity{grid-column:1/-1;display:flex;gap:16px;align-items:end}
.invoice-sheet .invoice-party-identity .invoice-cell:first-child:not(:last-child){width:110px;flex-shrink:0}
.invoice-sheet .invoice-party-identity .invoice-cell:last-child{flex:1}
.invoice-sheet .invoice-parties{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;margin-top:12px}
.invoice-sheet .invoice-party{min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:6px 12px}
.invoice-sheet .invoice-party-row{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
.invoice-sheet .invoice-party-main{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
.invoice-sheet .invoice-party-contacts{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr)}
.invoice-sheet .invoice-party-title{grid-column:1/-1;margin:0;padding:4px 0;font-size:12px;color:#667085;font-weight:600}
.invoice-sheet .invoice-cell{display:flex;flex-direction:column;min-width:0;gap:2px}
.invoice-sheet .invoice-cell-label{font-size:11px;line-height:1.4;color:#667085;overflow-wrap:anywhere}
.invoice-sheet .invoice-cell-value{display:block;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;padding:3px 0;border-bottom:1px solid #e7ecf2;min-height:24px}
.invoice-sheet .invoice-cell-value .MuiInputBase-root{padding:0;font:inherit;width:100%}
.invoice-sheet .invoice-cell-value input,.invoice-sheet .invoice-cell-value textarea{padding:0!important;font:inherit}
.invoice-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;font:inherit}
.invoice-sheet th,.invoice-sheet td{border:0;border-bottom:1px solid #e7ecf2;padding:8px 12px;vertical-align:middle;overflow-wrap:anywhere}
.invoice-sheet th{background:#f7f9fc;color:#667085;font-weight:600;font-size:12px;text-align:left}
.invoice-sheet th.MuiTableCell-alignRight,.invoice-sheet .num{text-align:right;font-variant-numeric:tabular-nums}
.invoice-sheet .invoice-lines .MuiTextField-root{max-width:100%;width:100%}
.invoice-sheet .invoice-lines .MuiInputBase-root{font-size:13px}
.invoice-sheet [data-invoice-entry-grid] .MuiInputBase-root{min-height:32px;font:inherit}
.invoice-sheet [data-invoice-entry-grid] .MuiOutlinedInput-notchedOutline{border:0}
.invoice-sheet [data-invoice-entry-grid] .MuiInputBase-root:hover{background:#f7f9fc}
.invoice-sheet [data-invoice-entry-grid] .Mui-focused{background:#f7f9fc;box-shadow:inset 0 -1px #2878f0}
.invoice-sheet .invoice-lines input{padding:8px 10px}
.invoice-sheet .invoice-cell:focus-within .invoice-cell-value{border-color:#2878f0}
.invoice-sheet .invoice-section-title{font-size:12px;font-weight:600;margin:0;padding:10px 16px;color:#57616c;border-bottom:1px solid #e7ecf2}
.invoice-sheet .invoice-summary{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:24px;padding:20px;background:#f8fafc}
.invoice-sheet .invoice-summary>*,.invoice-sheet .invoice-total>*{min-width:0;max-width:100%}
.invoice-sheet .invoice-remark{align-self:start;min-height:92px}
.invoice-sheet .invoice-remark .MuiInputBase-root{align-items:flex-start}
.invoice-sheet .invoice-form-summary .invoice-remark{align-self:stretch;display:flex}
.invoice-sheet .invoice-form-summary .invoice-remark .MuiInputBase-root{flex:1}
.invoice-sheet .invoice-form-summary .invoice-remark textarea{height:100%!important;box-sizing:border-box;overflow:auto!important}
@media(max-width:600px){.invoice-sheet .invoice-form-summary .invoice-remark{min-height:160px}}
.invoice-sheet .invoice-bank-section{grid-column:1/-1;min-width:0}
.invoice-sheet .invoice-bank-grid{display:grid;grid-template-columns:repeat(var(--invoice-bank-count,3),minmax(0,1fr));gap:16px;align-items:stretch}
.invoice-sheet .invoice-bank-card{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 12px;align-content:start;min-width:0;margin:0;padding:12px;border:1px solid #e7ecf2;border-radius:6px}
.invoice-sheet .invoice-bank-card dt,.invoice-sheet .invoice-bank-card dd{margin:0;min-width:0;overflow-wrap:anywhere;line-height:1.6}
.invoice-sheet .invoice-bank-card dt{font-size:11px;color:#667085}
@media screen and (max-width:900px){.invoice-sheet .invoice-bank-grid{grid-template-columns:repeat(var(--invoice-bank-tablet-count,2),minmax(0,1fr))}}
@media screen and (max-width:600px){.invoice-sheet .invoice-bank-grid{grid-template-columns:minmax(0,1fr)}}
.invoice-sheet .invoice-bank-lines{min-width:0;overflow-x:auto}
.invoice-sheet .invoice-bank-line{white-space:pre;overflow-wrap:normal;line-height:1.7}
.invoice-sheet .invoice-amount-formula{font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.invoice-sheet .invoice-total{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #e7ecf2;padding:8px 0;font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
.invoice-sheet .invoice-total span:last-child{color:#2878f0;text-align:right}
.invoice-sheet p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.invoice-sheet .invoice-signature{display:flex;justify-content:flex-end;margin-top:20px}
.invoice-sheet .invoice-stamp{width:160px;min-height:78px;border:1px solid #cbd5e1;border-radius:6px;padding:10px;text-align:center;color:#667085;font-size:11px}
.invoice-sheet .invoice-status{text-align:right;font-weight:700;color:#a33939;padding-bottom:12px}
@media print{html,body{width:auto!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:0!important}.invoice-sheet{width:100%;max-width:100%;min-width:0}.invoice-sheet .invoice-bank-lines{overflow:visible}.invoice-sheet .invoice-bank-line{white-space:pre-wrap;overflow-wrap:anywhere}.invoice-sheet .invoice-total{flex-wrap:wrap}.invoice-sheet th,.invoice-sheet td{padding-left:6px;padding-right:6px}}
@media(max-width:600px){.invoice-sheet .invoice-document-top{display:block}.invoice-sheet .invoice-document-identifiers{width:100%;margin-top:12px;grid-template-columns:1fr}.invoice-sheet .invoice-metadata,.invoice-sheet .invoice-parties,.invoice-sheet .invoice-summary,.invoice-sheet .invoice-party-main,.invoice-sheet .invoice-party-contacts{grid-template-columns:1fr}.invoice-sheet .invoice-summary{padding:16px;gap:16px}.invoice-sheet th,.invoice-sheet td{padding:6px 8px}}
`;

// Document output has one fixed layout for both native print and canvas PDF.
export const invoicePrintCss = `
html,body{box-sizing:border-box;margin:0;padding:0;background:#fff}
.invoice-print{font-size:11px;line-height:1.5}
.invoice-print .invoice-document-top{gap:20px;padding-bottom:14px;margin-bottom:18px}
.invoice-print .invoice-heading{font-size:21px;letter-spacing:1px}
.invoice-print .invoice-document-identifiers{width:52%;gap:18px}
.invoice-print .invoice-parties{gap:24px;margin:0 0 20px}
.invoice-print .invoice-paired-parties{display:flex;flex-direction:column;gap:8px}
.invoice-print .invoice-party-pair-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:stretch}
.invoice-print .invoice-party-pair-row .invoice-party-row,.invoice-print .invoice-party-pair-row .invoice-party-title{grid-column:auto}
.invoice-print .invoice-party-pair-row .invoice-cell-value{flex:1}
.invoice-print .invoice-party-pair-row .invoice-party-title{padding:0 0 4px}
.invoice-print .invoice-cell-value{padding:2px 0;min-height:18px}
.invoice-print .invoice-party-title{font-size:11px}
.invoice-print .invoice-cell-label{font-size:9px}
.invoice-print .invoice-lines{margin:0 0 18px;width:100%;min-width:0;table-layout:fixed}
.invoice-print th,.invoice-print td{padding:8px 5px;font-size:10px;line-height:1.5}
.invoice-print th{font-size:9px;color:#475569;border-top:1px solid #cbd5e1}
.invoice-print .num{white-space:nowrap;overflow-wrap:normal}
.invoice-print .invoice-summary{grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:16px;padding:16px;background:#f8fafc;align-items:stretch}
.invoice-print .invoice-subtotals{text-align:right;padding:0 0 14px}
.invoice-print .invoice-remark{min-height:0;align-self:stretch}
.invoice-print .invoice-total{font-size:11px;padding:8px 0;margin:0;font-weight:700}
.invoice-print .invoice-total span:last-child{color:#2878f0}
.invoice-print .invoice-bank-section{border-top:1px solid #e7ecf2;padding-top:12px;margin-top:16px}
.invoice-print .invoice-bank-grid{grid-template-columns:minmax(0,1fr);gap:12px}
.invoice-print .invoice-bank-card{padding:10px;gap:4px 8px;border-radius:0}
.invoice-print .invoice-bank-card dt{font-size:9px}
.invoice-print .invoice-signature{margin-top:24px}
.invoice-print .invoice-stamp{border:0;border-top:1px solid #94a3b8;border-radius:0;width:200px;min-height:0;padding:8px 0;font-size:10px}
`;
