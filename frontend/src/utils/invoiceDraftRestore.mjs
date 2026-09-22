export function restoreInvoiceDraftLines(content, source) {
  if (content?.version !== 1 || content.buyerOrgId !== source.buyerOrgId ||
    content.orders.length !== source.orders.length ||
    content.orders.some(row => !source.orders.some(current => current.orderId === row.orderId &&
      new Date(current.sourceUpdatedAt).getTime() === new Date(row.sourceUpdatedAt).getTime())) ||
    content.lines.length !== source.lines.length) throw new Error('INVOICE_SOURCE_CHANGED');
  const edits = new Map(content.lines.map(row => [row.key, row]));
  if (edits.size !== source.lines.length || source.lines.some(row => !edits.has(row.key))) throw new Error('INVOICE_SOURCE_CHANGED');
  return source.lines.map(row => {
    const edit = edits.get(row.key);
    // Identity, quantities ordered, production and price sources come from the server.
    return { ...row, quantity: edit.quantity, remark: edit.remark, adjustmentReason: edit.adjustmentReason,
      hsCode: edit.hsCode, origin: edit.origin };
  });
}
