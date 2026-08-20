import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Drawer, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import AppPageContainer from '../../components/AppPageContainer';
import BusinessPartnerDialog, { getBusinessPartnerTypeLabel } from '../../components/BusinessPartnerDialog';
import SearchInput from '../../components/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { formatNumberWithCommas } from '../../utils/numberFormat';

const TEXT = {
  ko: { title: '거래처', add: '거래처 등록', edit: '수정', search: '업체명, 담당자, 연락처 검색', name: '업체명', type: '타입', contact: '담당자', phone: '연락처', status: '상태', active: '사용 중', inactive: '사용 중지', empty: '등록된 거래처가 없습니다.', history: '거래 내역', workHistory: '외주 작업 내역', noHistory: '연결된 거래 내역이 없습니다.', date: '작업일', style: '스타일', process: '공정', unitPrice: '개당 단가', quantity: '수량', amount: '금액', loadError: '거래처 목록을 불러오지 못했습니다.', historyError: '거래 내역을 불러오지 못했습니다.' },
  en: { title: 'Partners', add: 'Add Partner', edit: 'Edit', search: 'Search company, contact, or phone', name: 'Company', type: 'Type', contact: 'Contact person', phone: 'Phone', status: 'Status', active: 'Active', inactive: 'Inactive', empty: 'No partners registered.', history: 'Transaction History', workHistory: 'Outsourced Work History', noHistory: 'No linked transactions.', date: 'Work date', style: 'Style', process: 'Process', unitPrice: 'Unit price', quantity: 'Quantity', amount: 'Amount', loadError: 'Failed to load partners.', historyError: 'Failed to load transaction history.' },
  vi: { title: 'Đối tác', add: 'Thêm đối tác', edit: 'Sửa', search: 'Tìm công ty, người liên hệ hoặc số điện thoại', name: 'Công ty', type: 'Loại', contact: 'Người liên hệ', phone: 'Số điện thoại', status: 'Trạng thái', active: 'Đang sử dụng', inactive: 'Ngừng sử dụng', empty: 'Chưa có đối tác.', history: 'Lịch sử giao dịch', workHistory: 'Lịch sử gia công', noHistory: 'Chưa có giao dịch liên kết.', date: 'Ngày làm việc', style: 'Mẫu', process: 'Công đoạn', unitPrice: 'Đơn giá', quantity: 'Số lượng', amount: 'Thành tiền', loadError: 'Không thể tải danh sách đối tác.', historyError: 'Không thể tải lịch sử giao dịch.' },
};

// Page title/add-button text when this screen is locked to a single vendor
// type via the `type` prop (menu split into 외주 업체/공급 업체, both routes
// reuse this component - see router.jsx and AGENTS.md 2026-08-20).
const TITLE_BY_TYPE = {
  PROCESS_OUTSOURCING: { ko: '외주 업체', en: 'Outsourcing Partner', vi: 'Đối tác gia công' },
  MATERIAL_SUPPLIER: { ko: '공급 업체', en: 'Material Supplier', vi: 'Nhà cung cấp vật tư' },
};

export default function BusinessPartners({ type }) {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const labels = TEXT[languageCode] || TEXT.ko;
  const lockedTitle = type ? (TITLE_BY_TYPE[type]?.[languageCode] || TITLE_BY_TYPE[type]?.en) : null;
  const pageTitle = lockedTitle || labels.title;
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const loadPartners = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await requestJSON(`/business-partners${buildQueryString({ orgId: activeOrgId, type })}`, { skipGlobalLoading: true }); setPartners(Array.isArray(result) ? result : []); }
    catch (loadError) { setError(loadError?.message || labels.loadError); }
    finally { setLoading(false); }
  }, [activeOrgId, labels.loadError, type]);
  useEffect(() => { loadPartners(); }, [loadPartners]);
  const filteredPartners = useMemo(() => { const keyword = search.trim().toLocaleLowerCase(); return keyword ? partners.filter((partner) => [partner.name, partner.contactName, partner.contactPhone].some((value) => value?.toLocaleLowerCase().includes(keyword))) : partners; }, [partners, search]);
  const openHistory = async (partner) => {
    setSelected(partner); setHistory([]); setHistoryLoading(true);
    try { const result = await requestJSON(`/business-partners/${partner.id}/history${buildQueryString({ orgId: activeOrgId })}`, { skipGlobalLoading: true }); setHistory(Array.isArray(result?.records) ? result.records : []); }
    catch (historyError) { setError(historyError?.message || labels.historyError); }
    finally { setHistoryLoading(false); }
  };
  return (
    <AppPageContainer title={pageTitle} titleActions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>{labels.add}</Button>} toolbar={<SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder={labels.search} sx={{ width: 360 }} />}>
      <Stack spacing={2}>{error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}<Paper variant="outlined"><TableContainer><Table>
        <TableHead><TableRow><TableCell>{labels.name}</TableCell>{type ? null : <TableCell width={190}>{labels.type}</TableCell>}<TableCell width={160}>{labels.contact}</TableCell><TableCell width={180}>{labels.phone}</TableCell><TableCell width={120}>{labels.status}</TableCell><TableCell width={64} align="center">&nbsp;</TableCell></TableRow></TableHead>
        <TableBody>{loading ? <TableRow><TableCell colSpan={type ? 5 : 6} align="center"><CircularProgress size={24} /></TableCell></TableRow> : null}{!loading && filteredPartners.length === 0 ? <TableRow><TableCell colSpan={type ? 5 : 6} align="center">{labels.empty}</TableCell></TableRow> : null}{filteredPartners.map((partner) => <TableRow key={partner.id} hover onClick={() => openHistory(partner)} sx={{ cursor: 'pointer' }}><TableCell><Typography fontWeight={600}>{partner.name}</Typography></TableCell>{type ? null : <TableCell>{getBusinessPartnerTypeLabel(partner.type, languageCode)}</TableCell>}<TableCell>{partner.contactName || '-'}</TableCell><TableCell>{partner.contactPhone || '-'}</TableCell><TableCell><Chip size="small" color={partner.isActive ? 'success' : 'default'} label={partner.isActive ? labels.active : labels.inactive} variant="outlined" /></TableCell><TableCell align="center"><Tooltip title={labels.edit}><IconButton size="small" onClick={(event) => { event.stopPropagation(); setEditingPartner(partner); }}><EditIcon fontSize="small" /></IconButton></Tooltip></TableCell></TableRow>)}</TableBody>
      </Table></TableContainer></Paper></Stack>
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
      <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} PaperProps={{ sx: { width: { xs: '100%', md: 760 }, p: 2 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}><Box><Typography variant="h6">{labels.history}</Typography><Typography color="text.secondary">{selected?.name} · {selected ? getBusinessPartnerTypeLabel(selected.type, languageCode) : ''}</Typography></Box><IconButton onClick={() => setSelected(null)}><CloseIcon /></IconButton></Stack>
        <Typography variant="subtitle1" fontWeight={700} mb={1}>{labels.workHistory}</Typography><TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow><TableCell>{labels.date}</TableCell><TableCell>{labels.style}</TableCell><TableCell>{labels.process}</TableCell><TableCell align="right">{labels.unitPrice}</TableCell><TableCell align="right">{labels.quantity}</TableCell><TableCell align="right">{labels.amount}</TableCell></TableRow></TableHead><TableBody>{historyLoading ? <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow> : null}{!historyLoading && history.length === 0 ? <TableRow><TableCell colSpan={6} align="center">{labels.noHistory}</TableCell></TableRow> : null}{history.map((record) => <TableRow key={record.id}><TableCell>{record.workDate || '-'}</TableCell><TableCell>{record.styleCode || record.styleName || '-'}</TableCell><TableCell>{[record.processCode, record.processName].filter(Boolean).join(' · ') || '-'}</TableCell><TableCell align="right">{formatNumberWithCommas(record.unitPrice || 0)}</TableCell><TableCell align="right">{formatNumberWithCommas(record.quantity || 0)}</TableCell><TableCell align="right">{formatNumberWithCommas(record.amount || 0)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
      </Drawer>
    </AppPageContainer>
  );
}
