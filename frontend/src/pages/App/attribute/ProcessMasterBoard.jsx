import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  IconButton,
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
import DeleteIcon from '@mui/icons-material/Delete';
import AppPageContainer from '../../../components/AppPageContainer';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { useApp } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { resolveLocalizedAttributeName } from '../../../utils/appLanguage';
import {
  fetchProcessMasterOptions,
  updateProcessMasterOptions,
} from '../../../utils/attributeApi';

const MASTER_SECTIONS = [
  { key: 'parts', title: '부위' },
  { key: 'targets', title: '대상' },
  { key: 'specs', title: '규격' },
  { key: 'actions', title: '작업' },
];

const createEmptyMasterData = () => ({
  parts: [],
  targets: [],
  actions: [],
  specs: [],
});

const toTrimmedText = (value) => String(value ?? '').trim();
const LANGUAGE_SORT_LOCALE_BY_CODE = {
  ko: 'ko-KR',
  en: 'en-US',
  vi: 'vi-VN',
};

const compareMasterRowsByLanguage = (leftRow, rightRow, languageCode) => {
  const locale = LANGUAGE_SORT_LOCALE_BY_CODE[languageCode] || 'en-US';
  const leftLabel = toTrimmedText(resolveLocalizedAttributeName(leftRow, languageCode));
  const rightLabel = toTrimmedText(resolveLocalizedAttributeName(rightRow, languageCode));

  const labelCompare = leftLabel.localeCompare(rightLabel, locale, {
    sensitivity: 'base',
    numeric: true,
  });
  if (labelCompare !== 0) return labelCompare;

  const leftCode = toTrimmedText(leftRow?.code);
  const rightCode = toTrimmedText(rightRow?.code);
  const codeCompare = leftCode.localeCompare(rightCode, locale, {
    sensitivity: 'base',
    numeric: true,
  });
  if (codeCompare !== 0) return codeCompare;

  return Number(leftRow?.sortOrder || 0) - Number(rightRow?.sortOrder || 0);
};

const normalizeMasterRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((item, index) => ({
    id: item.id ?? `new-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    code: toTrimmedText(item.code),
    nameKo: toTrimmedText(item.nameKo ?? item.label),
    nameEn: toTrimmedText(item.nameEn),
    nameVi: toTrimmedText(item.nameVi),
    sortOrder: Number(item.sortOrder) || index + 1,
  }));

const normalizeMasterData = (data = {}) => ({
  parts: normalizeMasterRows(data?.parts),
  targets: normalizeMasterRows(data?.targets),
  actions: normalizeMasterRows(data?.actions),
  specs: normalizeMasterRows(data?.specs),
});

const areMasterRowsEqual = (leftRows = [], rightRows = []) => {
  if (leftRows.length !== rightRows.length) return false;
  for (let index = 0; index < leftRows.length; index += 1) {
    const left = leftRows[index] || {};
    const right = rightRows[index] || {};
    if (
      left.id !== right.id ||
      left.code !== right.code ||
      left.nameKo !== right.nameKo ||
      left.nameEn !== right.nameEn ||
      left.nameVi !== right.nameVi ||
      left.sortOrder !== right.sortOrder
    ) {
      return false;
    }
  }
  return true;
};

const ProcessMasterSection = ({
  title,
  rows,
  languageCode,
  sectionKey,
  onAddRow,
  onDeleteRow,
  onRowChange,
}) => {
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => compareMasterRowsByLanguage(left, right, languageCode)),
    [languageCode, rows]
  );

  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => onAddRow(sectionKey)}
        >
          추가
        </Button>
      </Box>

      <TableContainer sx={{ maxHeight: 360 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '18%', fontWeight: 700 }}>코드</TableCell>
              <TableCell sx={{ width: '24%', fontWeight: 700 }}>한국어</TableCell>
              <TableCell sx={{ width: '24%', fontWeight: 700 }}>영어</TableCell>
              <TableCell sx={{ width: '24%', fontWeight: 700 }}>베트남어</TableCell>
              <TableCell sx={{ width: '10%', textAlign: 'center', fontWeight: 700 }}>삭제</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={row.code || ''}
                    onChange={(event) => onRowChange(sectionKey, row.id, 'code', event.target.value)}
                    placeholder="CODE"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={row.nameKo || ''}
                    onChange={(event) => onRowChange(sectionKey, row.id, 'nameKo', event.target.value)}
                    placeholder="한국어"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={row.nameEn || ''}
                    onChange={(event) => onRowChange(sectionKey, row.id, 'nameEn', event.target.value)}
                    placeholder="English"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={row.nameVi || ''}
                    onChange={(event) => onRowChange(sectionKey, row.id, 'nameVi', event.target.value)}
                    placeholder="Tiếng Việt"
                  />
                </TableCell>
                <TableCell sx={{ textAlign: 'center' }}>
                  <IconButton size="small" onClick={() => onDeleteRow(sectionKey, row.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: 'center', color: 'text.secondary', py: 2 }}>
                  항목이 없습니다.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

const ProcessMasterBoard = () => {
  const { showNotification } = useApp();
  const { languageCode } = useLanguage();
  const [formData, setFormData] = useState(() => createEmptyMasterData());
  const [originalData, setOriginalData] = useState(() => createEmptyMasterData());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = useMemo(
    () =>
      MASTER_SECTIONS.some((section) =>
        !areMasterRowsEqual(formData[section.key], originalData[section.key])
      ),
    [formData, originalData]
  );

  useUnsavedChanges(isDirty);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchProcessMasterOptions()
      .then((data) => {
        if (cancelled) return;
        const normalized = normalizeMasterData(data);
        setFormData(normalized);
        setOriginalData(normalized);
      })
      .catch(() => {
        if (cancelled) return;
        const empty = createEmptyMasterData();
        setFormData(empty);
        setOriginalData(empty);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRowChange = useCallback((sectionKey, rowId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      ),
    }));
  }, []);

  const handleAddRow = useCallback((sectionKey) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: [
        ...(prev[sectionKey] || []),
        {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          code: '',
          nameKo: '',
          nameEn: '',
          nameVi: '',
          sortOrder: (prev[sectionKey] || []).length + 1,
        },
      ],
    }));
  }, []);

  const handleDeleteRow = useCallback((sectionKey, rowId) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter((row) => row.id !== rowId),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = MASTER_SECTIONS.reduce((acc, section) => {
        acc[section.key] = (formData[section.key] || []).map((row, index) => ({
          id: row.id,
          code: toTrimmedText(row.code),
          nameKo: toTrimmedText(row.nameKo),
          nameEn: toTrimmedText(row.nameEn),
          nameVi: toTrimmedText(row.nameVi),
          sortOrder: index + 1,
        }));
        return acc;
      }, {});
      const data = await updateProcessMasterOptions(payload);
      const normalized = normalizeMasterData(data);
      setFormData(normalized);
      setOriginalData(normalized);
      showNotification('공정 마스터가 저장되었습니다.', 'success');
    } catch (_error) {
      showNotification('공정 마스터 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [formData, isSaving, showNotification]);

  return (
    <AppPageContainer
      title="공정 마스터 관리"
      titleActions={(
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!isDirty || isSaving || isLoading}
          startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      )}
    >
      <Stack spacing={2}>
        <Alert severity="info">
          시스템 관리자가 공정 마스터(부위/대상/규격/작업)를 다국어로 관리합니다.
        </Alert>
        <Grid container spacing={2}>
          {MASTER_SECTIONS.map((section) => (
            <Grid item xs={12} md={6} key={section.key}>
              <ProcessMasterSection
                sectionKey={section.key}
                title={section.title}
                rows={formData[section.key] || []}
                languageCode={languageCode}
                onAddRow={handleAddRow}
                onDeleteRow={handleDeleteRow}
                onRowChange={handleRowChange}
              />
            </Grid>
          ))}
        </Grid>
      </Stack>
    </AppPageContainer>
  );
};

export default ProcessMasterBoard;

