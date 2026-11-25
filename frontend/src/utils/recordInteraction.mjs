// Keep native text/link menus and embedded controls independent of record rows.
export const RECORD_ACTION_SELECTOR = 'button,a,input,textarea,select,[role="button"],[role="checkbox"],[role="combobox"],[role="menuitem"],[contenteditable="true"],[data-record-action]';
export function isRecordActionTarget(event) {
  // React portals bubble through their component ancestors even though the
  // dialog/menu lives outside the row's DOM. Those actions belong to the portal.
  if (!event.currentTarget.contains(event.target)) return true;
  const action = event.target?.closest?.(RECORD_ACTION_SELECTOR);
  return Boolean(action && action !== event.currentTarget);
}
