// Shared by the editable document, stored document view and PDF renderer.
export const invoiceDocumentCss = `
.invoice-sheet{box-sizing:border-box;background:#fff;color:#20252b;font:13px Arial,sans-serif}
.invoice-sheet *{box-sizing:border-box}
.invoice-sheet .invoice-heading{text-align:center;font-size:28px;font-weight:700;letter-spacing:8px;margin:0;padding:8px 0 24px;border:0;line-height:1.4}
.invoice-sheet .invoice-parties{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;border:1px solid #777}
.invoice-sheet .invoice-party{min-width:0}
.invoice-sheet .invoice-party+.invoice-party{border-left:1px solid #777}
.invoice-sheet .invoice-party-title{margin:0;padding:7px 12px;font-size:12px;letter-spacing:1px;background:#e9ecef;border-bottom:1px solid #777;font-weight:700}
.invoice-sheet .invoice-cell{display:grid;grid-template-columns:96px minmax(0,1fr);min-height:34px;border-bottom:1px solid #b0b4b8;min-width:0}
.invoice-sheet .invoice-cell:last-child{border-bottom:0}
.invoice-sheet .invoice-cell-label{display:flex;align-items:center;background:#f3f4f5;border-right:1px solid #b0b4b8;padding:6px 9px;font-size:12px;line-height:1.4;font-weight:500;overflow-wrap:anywhere}
.invoice-sheet .invoice-cell-value{display:block;padding:5px 10px;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}
.invoice-sheet .invoice-cell-value .MuiInputBase-root{padding:0;font:inherit;width:100%}
.invoice-sheet .invoice-cell-value input,.invoice-sheet .invoice-cell-value textarea{padding:0!important;font:inherit}
.invoice-sheet .invoice-metadata{display:grid;grid-template-columns:1fr 1fr;border:1px solid #777;border-top:0;gap:0}
.invoice-sheet .invoice-metadata .invoice-cell{border-bottom:1px solid #b0b4b8}
.invoice-sheet .invoice-metadata .invoice-cell:nth-child(even){border-left:1px solid #777}
.invoice-sheet .invoice-metadata .invoice-cell:nth-last-child(-n+2){border-bottom:0}
.invoice-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;font:inherit}
.invoice-sheet th,.invoice-sheet td{border:1px solid #92979b;padding:7px 9px;vertical-align:middle;overflow-wrap:anywhere}
.invoice-sheet th{background:#e9ecef;font-weight:700;font-size:12px;text-align:left}
.invoice-sheet th.MuiTableCell-alignRight{ text-align:right }
.invoice-sheet .num{text-align:right;font-variant-numeric:tabular-nums}
.invoice-sheet .invoice-lines tbody tr{min-height:35px}
.invoice-sheet .invoice-lines .MuiOutlinedInput-notchedOutline{border:0}
.invoice-sheet .invoice-lines .MuiTextField-root{max-width:100%;width:100%}
.invoice-sheet .invoice-lines .MuiOutlinedInput-root{border-radius:0;background:transparent}
.invoice-sheet .invoice-lines .MuiOutlinedInput-root:hover{background:#f4f7fb}
.invoice-sheet .invoice-lines .Mui-focused{background:#edf4ff;box-shadow:inset 0 0 0 1px #4285e6}
.invoice-sheet input:focus,.invoice-sheet textarea:focus{outline:none}
.invoice-sheet .invoice-cell:focus-within{box-shadow:inset 0 0 0 1px #4285e6;background:#f5f9ff}
.invoice-sheet .invoice-section-title{font-size:12px;font-weight:700;margin:0;padding:8px 0;color:#57616c}
.invoice-sheet .invoice-total{display:flex;justify-content:space-between;align-items:center;border:1px solid #777;background:#edf0f2;padding:12px 16px;font-weight:700;font-size:19px;font-variant-numeric:tabular-nums}
.invoice-sheet .invoice-footer{border:1px solid #777}
.invoice-sheet p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.invoice-sheet .invoice-signature{text-align:center;padding:26px 0 12px;font-size:12px}
.invoice-sheet .invoice-status{text-align:right;font-weight:700;color:#a33939;padding-bottom:12px}
@media(max-width:600px){.invoice-sheet .invoice-heading{font-size:24px;padding-bottom:18px}.invoice-sheet .invoice-parties,.invoice-sheet .invoice-metadata{grid-template-columns:1fr}.invoice-sheet .invoice-party+.invoice-party{border-left:0;border-top:1px solid #777}.invoice-sheet .invoice-metadata .invoice-cell:nth-child(even){border-left:0}.invoice-sheet .invoice-metadata .invoice-cell:nth-last-child(2){border-bottom:1px solid #b0b4b8}.invoice-sheet .invoice-cell{grid-template-columns:86px minmax(0,1fr)}.invoice-sheet .invoice-total{font-size:16px}.invoice-sheet th,.invoice-sheet td{padding:6px 5px}}
`;
