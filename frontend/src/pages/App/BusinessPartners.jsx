import {partnerIndustryLabel} from '../../utils/partnerIndustry.mjs';
import DeleteActionButton from '../../components/DeleteActionButton';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { emitWorkspaceDataChanged, subscribeWorkspaceDataChanged } from '../../utils/workspaceDataEvents';
import PartnerDirectory from '../../components/PartnerDirectory';
import {resolveCustomerDisplayName} from '../../utils/appLanguage';
import BusinessPartnerDialog, { getBusinessPartnerTypeLabel } from '../../components/BusinessPartnerDialog';
import { TRANSACTION_TEXT } from '../../components/OutsourcingServiceDialog';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { formatNumberWithCommas } from '../../utils/numberFormat';

const TEXT = {
  ko: { title: '거래처', add: '거래처 등록', edit: '수정', search: '업체명, 담당자, 연락처 검색', name: '업체명', type: '타입', contact: '담당자', phone: '연락처', status: '상태', active: '사용 중', inactive: '사용 중지', empty: '등록된 거래처가 없습니다.', history: '거래 내역', workHistory: '외주 작업 내역', noHistory: '연결된 거래 내역이 없습니다.', date: '작업일', style: '스타일', process: '공정', unitPrice: '개당 단가', quantity: '수량', amount: '금액', loadError: '거래처 목록을 불러오지 못했습니다.', historyError: '거래 내역을 불러오지 못했습니다.' },
  en: { title: 'Partners', add: 'Add Partner', edit: 'Edit', search: 'Search company, contact, or phone', name: 'Company', type: 'Type', contact: 'Contact person', phone: 'Phone', status: 'Status', active: 'Active', inactive: 'Inactive', empty: 'No partners registered.', history: 'Transaction History', workHistory: 'Outsourced Work History', noHistory: 'No linked transactions.', date: 'Work date', style: 'Style', process: 'Process', unitPrice: 'Unit price', quantity: 'Quantity', amount: 'Amount', loadError: 'Failed to load partners.', historyError: 'Failed to load transaction history.' },
  vi: { title: 'Đối tác', add: 'Thêm đối tác', edit: 'Sửa', search: 'Tìm công ty, người liên hệ hoặc số điện thoại', name: 'Công ty', type: 'Loại', contact: 'Người liên hệ', phone: 'Số điện thoại', status: 'Trạng thái', active: 'Đang sử dụng', inactive: 'Ngừng sử dụng', empty: 'Chưa có đối tác.', history: 'Lịch sử giao dịch', workHistory: 'Lịch sử gia công', noHistory: 'Chưa có giao dịch liên kết.', date: 'Ngày làm việc', style: 'Mẫu', process: 'Công đoạn', unitPrice: 'Đơn giá', quantity: 'Số lượng', amount: 'Thành tiền', loadError: 'Không thể tải danh sách đối tác.', historyError: 'Không thể tải lịch sử giao dịch.' },
};

// The shared partner panel is selected by role in TradePartners.
const TITLE_BY_TYPE = {
  LOGISTICS_PROVIDER: {ko:'물류 업체',en:'Logistics provider',vi:'Đơn vị logistics'},
  PROCESS_OUTSOURCING: { ko: '외주 업체', en: 'Outsourcing Partner', vi: 'Đối tác gia công' },
  MATERIAL_SUPPLIER: { ko: '공급 업체', en: 'Material Supplier', vi: 'Nhà cung cấp vật tư' },
};

const LIST_TEXT = {
  ko: { viewHistory: '내역보기', costHistory: '비용 신청 내역' },
  en: { viewHistory: 'View history', costHistory: 'Payment request history' },
  vi: { viewHistory: 'Xem lịch sử', costHistory: 'Lịch sử đề nghị thanh toán' },
};

const DELETE_TEXT = {
  ko: { remove: '삭제', blocked: '사용 이력이 있는 거래처는 삭제할 수 없습니다. 수정하거나 사용 중지할 수 있습니다.', confirm: '이 거래처를 삭제하시겠습니까?', cancel: '취소', error: '거래처를 삭제하지 못했습니다.', help: '수정한 업체명·담당자·연락처는 연결된 내역 조회에 반영됩니다. 저장 당시 감사 정보와 발행 문서는 보존됩니다.' },
  en: { remove: 'Delete', blocked: 'Partners with usage history cannot be deleted. You can edit or deactivate them.', confirm: 'Delete this partner?', cancel: 'Cancel', error: 'Could not delete the partner.', help: 'Updated partner details appear in linked records. Original audit information and issued documents are preserved.' },
  vi: { remove: 'Xóa', blocked: 'Không thể xóa đối tác đã được sử dụng. Có thể chỉnh sửa hoặc ngừng sử dụng.', confirm: 'Xóa đối tác này?', cancel: 'Hủy', error: 'Không thể xóa đối tác.', help: 'Thông tin đối tác cập nhật được hiển thị trong hồ sơ liên kết. Thông tin kiểm toán ban đầu và chứng từ đã phát hành được giữ nguyên.' },
};

export default function BusinessPartners({ type, embedded=false }) {
  const { activeOrgId, activeOrgRole, accessProfile } = useAuth();
  const isSystemAdmin = accessProfile?.systemRole === 'SYSTEM_ADMIN';
  const canEdit = isSystemAdmin || ['ADMIN', 'OPERATOR', 'ACCOUNTANT'].includes(activeOrgRole);
  const { languageCode } = useLanguage();
  const labels = TEXT[languageCode] || TEXT.ko;
  const listLabels = LIST_TEXT[languageCode] || LIST_TEXT.ko;
  const deleteLabels = DELETE_TEXT[languageCode] || DELETE_TEXT.ko;
  const [deletingPartner, setDeletingPartner] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const lockedTitle = type ? (TITLE_BY_TYPE[type]?.[languageCode] || TITLE_BY_TYPE[type]?.en) : null;
  const pageTitle = lockedTitle || labels.title;
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [error, setError] = useState('');
  const [queryFailed,setQueryFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [costs, setCosts] = useState([]);
  const costLabels = TRANSACTION_TEXT[languageCode] || TRANSACTION_TEXT.ko;
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadPartners = useCallback(async () => {
    setLoading(true); setError('');setQueryFailed(false);
    try { const result = await requestJSON(`/business-partners${buildQueryString({ orgId: activeOrgId, type })}`, { skipGlobalLoading: true, skipCache: true }); setPartners(Array.isArray(result) ? result : []); }
    catch (loadError) { setQueryFailed(true);setError(loadError?.message || labels.loadError); }
    finally { setLoading(false); }
  }, [activeOrgId, labels.loadError, type]);
  useEffect(() => { loadPartners(); }, [loadPartners]);
  useEffect(() => subscribeWorkspaceDataChanged(detail => {
    if (Number(detail?.orgId) === Number(activeOrgId) && ['business-partner', 'transaction-request'].includes(detail.source)) loadPartners();
  }), [activeOrgId, loadPartners]);
  const removePartner = async () => {
    setDeleting(true); setError('');
    try {
      await requestJSON(`/business-partners/${deletingPartner.id}${buildQueryString({ orgId: activeOrgId })}`, { method: 'DELETE' });
      if (selected?.id === deletingPartner.id) setSelected(null);
      setDeletingPartner(null);
      emitWorkspaceDataChanged({ topics: ['business-partners'], orgId: activeOrgId, source: 'business-partner' });
      await loadPartners();
    } catch (failure) {
      setDeletingPartner(null);
      await loadPartners();
      // loadPartners clears errors, so restore the deletion reason after reload.
      setError(failure?.status === 409 || failure?.message?.includes('PARTNER_HAS_TRANSACTION_HISTORY') ? deleteLabels.blocked : deleteLabels.error);
    } finally { setDeleting(false); }
  };
  const serviceName = useCallback(item=>partnerIndustryLabel(item,languageCode),[languageCode]);
  const directoryRows=useMemo(()=>partners.map(partner=>({id:partner.id,source:partner,code:partner.code,name:resolveCustomerDisplayName(partner,languageCode),country:partner.country,contactName:partner.contactName,phone:partner.contactPhone,email:partner.email,registeredAt:partner.createdAt,isActive:partner.isActive,subtitle:[getBusinessPartnerTypeLabel(partner.type,languageCode),...(partner.serviceTypes||[]).map(serviceName)].filter(Boolean).join(' \u00b7 '),searchText:[partner.name,partner.nameKo,partner.nameVi,partner.address].filter(Boolean).join(' ')})),[partners,languageCode,serviceName]);
  const openHistory = async (partner) => {
    setSelected(partner); setHistory([]); setCosts([]); setHistoryLoading(true);
    try { const result = await requestJSON(`/business-partners/${partner.id}/history${buildQueryString({ orgId: activeOrgId })}`, { skipGlobalLoading: true }); setHistory(Array.isArray(result?.records) ? result.records : []); setCosts(Array.isArray(result?.costs) ? result.costs : []); }
    catch (historyError) { setError(historyError?.message || labels.historyError); }
    finally { setHistoryLoading(false); }
  };
  return (
    <PartnerDirectory embedded={embedded} title={pageTitle} languageCode={languageCode} rows={directoryRows} loading={loading} error={queryFailed} onRetry={loadPartners} onAdd={()=>setCreateOpen(true)} canAdd={canEdit} onOpen={setEditingPartner} canOpen={canEdit}
      renderActions={partner=><><Button variant="contained" onClick={()=>openHistory(partner)}>{listLabels.viewHistory}</Button><Tooltip title={partner.hasUsageHistory!==false?deleteLabels.blocked:deleteLabels.remove}><span><DeleteActionButton aria-label={deleteLabels.remove} disabled={!canEdit||deleting||partner.hasUsageHistory!==false} onClick={()=>setDeletingPartner(partner)}/></span></Tooltip></>}
    >
      {error&&<Alert severity="error" onClose={()=>setError('')}>{error}</Alert>}
      <BusinessPartnerDialog
        open={createOpen || Boolean(editingPartner)}
        onClose={() => { setCreateOpen(false); setEditingPartner(null); }}
        onSaved={loadPartners}
        activeOrgId={activeOrgId}
        languageCode={languageCode}
        partner={editingPartner}
        initialType={type || 'PROCESS_OUTSOURCING'}
        lockType={Boolean(type)}
      />
      <Dialog open={Boolean(deletingPartner)} onClose={() => !deleting && setDeletingPartner(null)} fullWidth maxWidth="xs"><DialogTitle>{deleteLabels.confirm}</DialogTitle><DialogContent>{deletingPartner?.name}</DialogContent><DialogActions><Button disabled={deleting} onClick={() => setDeletingPartner(null)}>{deleteLabels.cancel}</Button><Button color="error" variant="contained" disabled={deleting} onClick={removePartner}>{deleteLabels.remove}</Button></DialogActions></Dialog>
      <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} PaperProps={{ sx: { width: { xs: '100%', md: 760 }, p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} sx={{ flexShrink: 0 }}><Box><Typography variant="h6">{labels.history}</Typography><Typography color="text.secondary">{selected?.name} · {selected ? getBusinessPartnerTypeLabel(selected.type, languageCode) : ''}</Typography></Box><IconButton onClick={() => setSelected(null)}><CloseIcon /></IconButton></Stack>
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateRows: costs.length > 0 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 3 }}>
        <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1} sx={{ flexShrink: 0 }}>{labels.workHistory}</Typography><TableContainer component={Paper} variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}><Table size="small"><TableHead><TableRow><TableCell>{labels.date}</TableCell><TableCell>{labels.style}</TableCell><TableCell>{labels.process}</TableCell><TableCell align="right">{labels.unitPrice}</TableCell><TableCell align="right">{labels.quantity}</TableCell><TableCell align="right">{labels.amount}</TableCell></TableRow></TableHead><TableBody>{historyLoading ? <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow> : null}{!historyLoading && history.length === 0 ? <TableRow><TableCell colSpan={6} align="center">{labels.noHistory}</TableCell></TableRow> : null}{history.map((record) => <TableRow key={record.id}><TableCell>{record.workDate || '-'}</TableCell><TableCell>{record.styleCode || record.styleName || '-'}</TableCell><TableCell>{[record.processCode, record.processName].filter(Boolean).join(' · ') || '-'}</TableCell><TableCell align="right">{formatNumberWithCommas(record.unitPrice || 0)}</TableCell><TableCell align="right">{formatNumberWithCommas(record.quantity || 0)}</TableCell><TableCell align="right">{formatNumberWithCommas(record.amount || 0)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
        </Box>
        {costs.length > 0 && <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}><Typography variant="subtitle1" fontWeight={700} mb={1} sx={{ flexShrink: 0 }}>{listLabels.costHistory}</Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}><Table size="small"><TableHead><TableRow><TableCell>{costLabels.date}</TableCell><TableCell>{costLabels.industry}</TableCell><TableCell>{costLabels.description}</TableCell><TableCell>{costLabels.amount}</TableCell></TableRow></TableHead><TableBody>{!historyLoading && !costs.length && <TableRow><TableCell colSpan={4}>{costLabels.empty}</TableCell></TableRow>}{costs.map(cost => <TableRow key={cost.id}><TableCell>{cost.transactionDate}</TableCell><TableCell>{serviceName(cost.serviceType)}</TableCell><TableCell>{cost.description}</TableCell><TableCell>{formatNumberWithCommas(cost.amount)} {cost.currency}</TableCell></TableRow>)}</TableBody></Table></TableContainer></Box>}
        </Box>
      </Drawer>
    </PartnerDirectory>
  );
}
