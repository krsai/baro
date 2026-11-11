import React, { useEffect, useRef, useState } from 'react';
import { Button, Alert } from '@mui/material';
import LookupSearchDialog from '../../../components/LookupSearchDialog';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { useAppActions } from '../../../context/AppContext';
import { emitWorkspaceDataChanged, WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

const text = {
  ko: { title: '거래처 스타일 가져오기', owner: '제품 정보 소유', code: '스타일 코드', name: '스타일명', done: '생산용 스타일을 연결했습니다.', loading: '스타일을 조회하고 있습니다.', failed: '스타일을 가져오지 못했습니다. 다시 조회해 주세요.' },
  en: { title: 'Import partner style', owner: 'Product owner', code: 'Style code', name: 'Style name', done: 'Production style linked.', loading: 'Loading styles.', failed: 'Could not import the style. Reload and try again.' },
  vi: { title: 'Lấy mẫu từ đối tác', owner: 'Chủ sở hữu sản phẩm', code: 'Mã mẫu', name: 'Tên mẫu', done: 'Đã liên kết mẫu sản xuất.', loading: 'Đang tải mẫu.', failed: 'Không thể lấy mẫu. Vui lòng tải lại và thử lại.' },
};

export default function StyleProductPicker({ orgId, languageCode, onTaken, refreshKey, isActive = true }) {
  const t = text[languageCode] || text.en;
  const { showNotification } = useAppActions();
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState(false), [checked, setChecked] = useState(false);
  const busy = useRef(false), scope = useRef(orgId);
  scope.current = orgId;
  useEffect(() => { setOpen(false); setRows([]); setQuery(''); setChecked(false); }, [orgId]);
  useEffect(() => {
    if (!isActive || !orgId) return undefined;
    const controller = new AbortController();
    setLoading(true); setError(false);
    requestJSON(`/style-products${buildQueryString({ orgId, availableOnly: '1' })}`, { signal: controller.signal, skipCache: true })
      .then(data => { if (!controller.signal.aborted) { setRows(Array.isArray(data) ? data : []); setChecked(true); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reloadKey, orgId, refreshKey, isActive]);
  const take = async row => {
    if (busy.current || scope.current !== orgId) return;
    busy.current = true; setError(false);
    try {
      const saved = await requestJSON(`/style-products/${row.id}/production-style${buildQueryString({ orgId })}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerOrgId: row.customerOrgId, revision: row.revision }),
      });
      if (scope.current !== orgId) return;
      emitWorkspaceDataChanged({ orgId, topics: [WORKSPACE_DATA_TOPICS.STYLES], styleIds: [saved.id] });
      setRows(current => current.filter(product => product.id !== row.id));
      setOpen(false); showNotification(t.done, 'success'); await onTaken?.();
    } catch { if (scope.current === orgId) setError(true); }
    finally { busy.current = false; }
  };
  return <>
    {(!checked || error || rows.length > 0) && <Button variant="outlined" disabled={loading} onClick={() => { setQuery(''); setOpen(true); setReloadKey(current => current + 1); }}>{t.title}</Button>}
    <LookupSearchDialog open={open} onClose={() => { if (!busy.current) setOpen(false); }} title={t.title}
      languageCode={languageCode} query={query} onQueryChange={setQuery} options={rows}
      getOptionKey={row => `${row.id}:${row.customerOrgId}`} onSelect={take}
      columns={[{ key: 'owner', label: t.owner, value: row => row.ownerOrgName }, { key: 'code', label: t.code, value: row => row.fields.code }, { key: 'name', label: t.name, value: row => row.fields.name }]}
      details={error ? <Alert severity="error">{t.failed}</Alert> : loading ? <Alert severity="info">{t.loading}</Alert> : null} />
  </>;
}
