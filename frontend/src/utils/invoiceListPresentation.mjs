export const invoiceListPresentationText={
 ko:{billTo:'청구처',more:count=>`외 ${count}개`,garments:quantity=>`${quantity}장`,quantity:'수량'},
 en:{billTo:'Bill To',more:count=>`+ ${count} More`,garments:quantity=>`${quantity} Pcs`,quantity:'Quantity'},
 vi:{billTo:'Bên Nhận Hóa Đơn',more:count=>`Và ${count} Mục Khác`,garments:quantity=>`${quantity} Chiếc`,quantity:'Số Lượng'},
};
export function compactInvoiceList(values,languageCode){
 const rows=[...new Set((values||[]).filter(Boolean))],t=invoiceListPresentationText[languageCode]||invoiceListPresentationText.en;
 return rows.length?rows[0]+(rows.length>1?' '+t.more(rows.length-1):''):'—';
}
export function invoiceListDescription(row,languageCode){
 const t=invoiceListPresentationText[languageCode]||invoiceListPresentationText.en,summary=row.itemSummary;
 const orders=compactInvoiceList((row.orders||[]).map(order=>order.sourceOrderNumber),languageCode);
 const description=summary?.firstDescription?summary.firstDescription+(summary.additionalCount?' '+t.more(summary.additionalCount):''):compactInvoiceList(row.descriptions,languageCode);
 const quantities=(summary?.quantities||[]).map(item=>{
  const [whole,fraction='']=String(item.quantity).split('.'),decimal=fraction.replace(/0+$/,'');
  const quantity=whole.replace(/\B(?=(\d{3})+(?!\d))/g,languageCode==='vi'?'.':',')+(decimal?(languageCode==='vi'?',':'.')+decimal:'');
  return item.unit==='GARMENT'?t.garments(quantity):item.unit?`${quantity} ${item.unit}`:`${t.quantity} ${quantity}`;
 });
 return [[orders==='—'?'':orders,description==='—'?'':description].filter(Boolean).join(' / '),quantities.join(' / ')].filter(Boolean).join(', ')||'—';
}
