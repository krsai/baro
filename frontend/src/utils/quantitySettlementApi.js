import { buildQueryString, requestJSON } from './apiClient';

export const fetchQuantitySettlement = async ({ orgId = null, month = '' } = {}) => {
  const query = buildQueryString({ orgId, month });
  return requestJSON('/quantity-settlement' + query);
};

export const saveQuantitySettlement = async (
  { month = '', rows = [], savedBy = '' } = {},
  { orgId = null } = {}
) => {
  const query = buildQueryString({ orgId });
  return requestJSON('/quantity-settlement' + query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      month,
      rows,
      savedBy,
    }),
  });
};
