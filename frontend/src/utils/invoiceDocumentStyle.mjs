// Shared compact app and PDF tone; print uses stored values only.
export const invoiceDocumentCss = `
.invoice-sheet{box-sizing:border-box;background:#fff;color:#182b3d;font:13px Arial,sans-serif}
.invoice-sheet *{box-sizing:border-box}
.invoice-sheet .invoice-heading{font-size:21px;font-weight:700;letter-spacing:1px;margin:0;padding:0 0 16px;line-height:1.4}
.invoice-sheet .invoice-metadata{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 20px}
.invoice-sheet .invoice-parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:12px}
.invoice-sheet .invoice-party{min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:6px 12px}
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
.invoice-sheet .invoice-lines input{padding:8px 10px}
.invoice-sheet .invoice-cell:focus-within .invoice-cell-value{border-color:#2878f0}
.invoice-sheet .invoice-section-title{font-size:12px;font-weight:600;margin:0;padding:10px 16px;color:#57616c;border-bottom:1px solid #e7ecf2}
.invoice-sheet .invoice-summary{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;padding:20px;background:#f8fafc}
.invoice-sheet .invoice-total{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #e7ecf2;padding:8px 0;font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
.invoice-sheet .invoice-total span:last-child{color:#2878f0;text-align:right}
.invoice-sheet p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.invoice-sheet .invoice-signature{display:flex;justify-content:flex-end;margin-top:20px}
.invoice-sheet .invoice-stamp{width:160px;min-height:78px;border:1px solid #cbd5e1;border-radius:6px;padding:10px;text-align:center;color:#667085;font-size:11px}
.invoice-sheet .invoice-status{text-align:right;font-weight:700;color:#a33939;padding-bottom:12px}
@media(max-width:600px){.invoice-sheet .invoice-metadata,.invoice-sheet .invoice-parties,.invoice-sheet .invoice-summary{grid-template-columns:1fr}.invoice-sheet .invoice-summary{padding:16px;gap:16px}.invoice-sheet th,.invoice-sheet td{padding:6px 8px}}
`;
