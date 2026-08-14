import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import AppPageContainer from '../../components/AppPageContainer';
import SearchInput from '../../components/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import { formatNumberWithCommas } from '../../utils/numberFormat';

const PARTNER_TYPE = 'PROCESS_OUTSOURCING';

export default function BusinessPartners() {
  const { activeOrgId } = useAuth();
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await requestJSON(
        `/business-partners${buildQueryString({ orgId: activeOrgId, type: PARTNER_TYPE })}`,
        { skipGlobalLoading: true }
      );
      setPartners(Array.isArray(result) ? result : []);
    } catch (loadError) {
      setError(loadError?.message || '거래처 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  const filteredPartners = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    if (!keyword) return partners;
    return partners.filter((partner) => partner.name?.toLocaleLowerCase().includes(keyword));
  }, [partners, search]);

  const handleCreate = async () => {
    const normalizedName = name.trim();
    if (!normalizedName) return;
    setSaving(true);
    setError('');
    try {
      await requestJSON(`/business-partners${buildQueryString({ orgId: activeOrgId })}`, {
        method: 'POST',
        body: JSON.stringify({ name: normalizedName, type: PARTNER_TYPE }),
      });
      setName('');
      setCreateOpen(false);
      await loadPartners();
    } catch (saveError) {
      setError(saveError?.message || '거래처를 등록하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (partner) => {
    setSelected(partner);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const result = await requestJSON(
        `/business-partners/${partner.id}/history${buildQueryString({ orgId: activeOrgId })}`,
        { skipGlobalLoading: true }
      );
      setHistory(Array.isArray(result?.records) ? result.records : []);
    } catch (historyError) {
      setError(historyError?.message || '거래 이력을 불러오지 못했습니다.');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <AppPageContainer
      title="거래처"
      titleActions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>거래처 등록</Button>}
      toolbar={<SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="업체명 검색" sx={{ width: 320 }} />}
    >
      <Stack spacing={2}>
        {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}
        <Paper variant="outlined">
          <TableContainer>
            <Table>
              <TableHead><TableRow><TableCell>업체명</TableCell><TableCell width={180}>타입</TableCell><TableCell width={120}>상태</TableCell></TableRow></TableHead>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={3} align="center"><CircularProgress size={24} /></TableCell></TableRow> : null}
                {!loading && filteredPartners.length === 0 ? <TableRow><TableCell colSpan={3} align="center">등록된 공정 외주 업체가 없습니다.</TableCell></TableRow> : null}
                {filteredPartners.map((partner) => (
                  <TableRow key={partner.id} hover onClick={() => openHistory(partner)} sx={{ cursor: 'pointer' }}>
                    <TableCell><Typography fontWeight={600}>{partner.name}</Typography></TableCell>
                    <TableCell>공정 외주</TableCell>
                    <TableCell><Chip size="small" color={partner.isActive ? 'success' : 'default'} label={partner.isActive ? '사용 중' : '사용 중지'} variant="outlined" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>

      <Dialog open={createOpen} onClose={() => !saving && setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>공정 외주 업체 등록</DialogTitle>
        <DialogContent><TextField autoFocus fullWidth margin="dense" label="업체명" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') handleCreate(); }} /></DialogContent>
        <DialogActions><Button onClick={() => setCreateOpen(false)} disabled={saving}>취소</Button><Button variant="contained" onClick={handleCreate} disabled={saving || !name.trim()}>등록</Button></DialogActions>
      </Dialog>

      <Drawer anchor="right" open={Boolean(selected)} onClose={() => setSelected(null)} PaperProps={{ sx: { width: { xs: '100%', md: 760 }, p: 2 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Box><Typography variant="h6">외주 작업 이력</Typography><Typography color="text.secondary">{selected?.name}</Typography></Box>
          <IconButton onClick={() => setSelected(null)}><CloseIcon /></IconButton>
        </Stack>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow><TableCell>작업일</TableCell><TableCell>스타일</TableCell><TableCell>공정</TableCell><TableCell align="right">단가</TableCell><TableCell align="right">수량</TableCell><TableCell align="right">금액</TableCell></TableRow></TableHead>
            <TableBody>
              {historyLoading ? <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow> : null}
              {!historyLoading && history.length === 0 ? <TableRow><TableCell colSpan={6} align="center">연결된 작업 기록이 없습니다.</TableCell></TableRow> : null}
              {history.map((record) => <TableRow key={record.id}><TableCell>{record.workDate || '-'}</TableCell><TableCell>{record.styleCode || record.styleName || '-'}</TableCell><TableCell>{[record.processCode, record.processName].filter(Boolean).join(' · ') || '-'}</TableCell><TableCell align="right">{formatNumberWithCommas(record.unitPrice || 0)}</TableCell><TableCell align="right">{formatNumberWithCommas(record.quantity || 0)}</TableCell><TableCell align="right">{formatNumberWithCommas(record.amount || 0)}</TableCell></TableRow>)}
            </TableBody>
          </Table>
        </TableContainer>
      </Drawer>
    </AppPageContainer>
  );
}
