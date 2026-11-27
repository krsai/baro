import {buildQueryString, createHttpError, requestJSON} from './apiClient';
import {emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS} from './workspaceDataEvents';

const toStyle = (product, orgId, customer = '') => ({
  ...product.fields, id: product.id, revision: product.revision,
  styleCode: product.fields.code, ownerOrgId: orgId, customerOrgId: orgId,
  customer, imageUrls: product.fields.imageUrls || [], processes: [],
});

export async function fetchBrandStyle(id, orgId, customer) {
  const rows = await requestJSON('/brand-sewing/styles' + buildQueryString({orgId}), {skipCache: true});
  const product = rows.find(row => String(row.id) === String(id));
  if (!product) throw createHttpError('STYLE_PRODUCT_NOT_FOUND', 404);
  return toStyle(product, orgId, customer);
}

export async function saveBrandStyle(style, orgId, id) {
  const fields = Object.fromEntries(['name', 'registrationDate', 'designer', 'season', 'imageUrls'].map(key => [key, style[key] ?? null]));
  fields.code = style.styleCode;
  const product = await requestJSON('/brand-sewing/styles' + (id ? '/' + encodeURIComponent(id) : '') + buildQueryString({orgId}), {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify({fields, ...(id ? {revision: style.revision} : {})}),
  });
  emitWorkspaceDataChanged({orgId, topics: [WORKSPACE_DATA_TOPICS.STYLES]});
  return toStyle(product, orgId, style.customer);
}
