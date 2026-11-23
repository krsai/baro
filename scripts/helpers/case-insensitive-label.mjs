// Match the same full accessible label across sentence case and title case.
export const exactLabel=value=>new RegExp('^'+String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
