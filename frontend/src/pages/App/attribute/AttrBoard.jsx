import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
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
import { fetchAttributes, updateAttributes } from '../../../utils/attributeApi';

const initialData = {
  colors: [],
  categories: [],
  processes: [],
};

const MULTILINGUAL_NAME_COLUMNS = [
  { field: 'nameEn', label: '영어명', width: '24%' },
  { field: 'nameKo', label: '한국어명', width: '24%' },
  { field: 'nameVi', label: '베트남어명', width: '24%' },
];

const sectionConfigs = [
  {
    key: 'colors',
    title: '색상 (Color)',
    columns: [{ field: 'code', label: '코드', width: '18%' }, ...MULTILINGUAL_NAME_COLUMNS],
  },
  {
    key: 'categories',
    title: '카테고리 (Category)',
    columns: [{ field: 'code', label: '코드', width: '18%' }, ...MULTILINGUAL_NAME_COLUMNS],
  },
  {
    key: 'processes',
    title: '공정 (Process)',
    columns: [{ field: 'code', label: '코드', width: '18%' }, ...MULTILINGUAL_NAME_COLUMNS],
  },
];

const cloneDeep = (value) => JSON.parse(JSON.stringify(value));

const toTrimmedText = (value) => String(value ?? '').trim();
const sortRowsByCode = (left, right) => left.code.localeCompare(right.code);

const resolveBaseAttributeName = (item = {}) => {
  const name = toTrimmedText(item?.name);
  const nameEn = toTrimmedText(item?.nameEn);
  const nameKo = toTrimmedText(item?.nameKo);
  const nameVi = toTrimmedText(item?.nameVi);
  return nameEn || name || nameKo || nameVi || '';
};

const normalizeRows = (rows) =>
  (Array.isArray(rows) ? rows : []).map((item = {}) => ({
    id: item.id ?? `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: toTrimmedText(item.code),
    name: resolveBaseAttributeName(item),
    nameEn: toTrimmedText(item.nameEn) || toTrimmedText(item.name),
    nameKo: toTrimmedText(item.nameKo),
    nameVi: toTrimmedText(item.nameVi),
  }));

const normalizeData = (data) => ({
  colors: normalizeRows(data?.colors),
  categories: normalizeRows(data?.categories),
  processes: normalizeRows(data?.processes),
});

const areRowsEqual = (leftRows = [], rightRows = []) => {
  if (leftRows.length !== rightRows.length) return false;

  for (let index = 0; index < leftRows.length; index += 1) {
    const left = leftRows[index] || {};
    const right = rightRows[index] || {};
    if (
      left.id !== right.id ||
      left.code !== right.code ||
      left.name !== right.name ||
      left.nameEn !== right.nameEn ||
      left.nameKo !== right.nameKo ||
      left.nameVi !== right.nameVi
    ) {
      return false;
    }
  }

  return true;
};

const AttributeRow = memo(function AttributeRow({
  row,
  columns,
  sectionKey,
  onRowChange,
  onDeleteRow,
}) {
  return (
    <TableRow hover>
      {columns.map((col) => (
        <TableCell key={col.field}>
          <TextField
            value={row[col.field] || ''}
            onChange={(event) => onRowChange(sectionKey, row.id, col.field, event.target.value)}
            fullWidth
            size="small"
            placeholder={col.label}
          />
        </TableCell>
      ))}
      <TableCell sx={{ textAlign: 'center' }}>
        <IconButton size="small" onClick={() => onDeleteRow(sectionKey, row.id)}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
});

const AttributeSection = memo(function AttributeSection({
  config,
  rows,
  onAddRow,
  onDeleteRow,
  onRowChange,
}) {
  const sortedRows = useMemo(() => [...rows].sort(sortRowsByCode), [rows]);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
            {config.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            영어명을 기본값으로 사용하고, 한국어명/베트남어명은 다국어 표시용입니다.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => onAddRow(config.key)}
        >
          추가
        </Button>
      </Box>

      <TableContainer sx={{ maxHeight: 420, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {config.columns.map((col) => (
                <TableCell key={col.field} sx={{ fontWeight: 'bold', width: col.width }}>
                  {col.label}
                </TableCell>
              ))}
              <TableCell sx={{ width: '10%', textAlign: 'center' }}>삭제</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows.map((row) => (
              <AttributeRow
                key={row.id}
                row={row}
                columns={config.columns}
                sectionKey={config.key}
                onRowChange={onRowChange}
                onDeleteRow={onDeleteRow}
              />
            ))}

            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={config.columns.length + 1}
                  sx={{ textAlign: 'center', py: 2, color: 'text.secondary' }}
                >
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
});

const AttrBoard = () => {
  const { showNotification } = useApp();
  const [canManageProcesses, setCanManageProcesses] = useState(true);
  const visibleSectionConfigs = useMemo(
    () =>
      canManageProcesses
        ? sectionConfigs
        : sectionConfigs.filter((section) => section.key !== 'processes'),
    [canManageProcesses]
  );

  const [formData, setFormData] = useState(() => cloneDeep(initialData));
  const [originalData, setOriginalData] = useState(() => cloneDeep(initialData));
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const isDirty = useMemo(
    () =>
      visibleSectionConfigs.some(
        (section) => !areRowsEqual(formData[section.key], originalData[section.key])
      ),
    [formData, originalData, visibleSectionConfigs]
  );

  useUnsavedChanges(isDirty);

  useEffect(() => {
    let cancelled = false;

    const loadAttributes = async () => {
      try {
        const data = await fetchAttributes();
        if (cancelled) return;

        setCanManageProcesses(data?.canManageProcesses !== false);
        const normalized = normalizeData(data);
        setFormData(normalized);
        setOriginalData(cloneDeep(normalized));
      } catch (_error) {
        if (cancelled) return;
        setCanManageProcesses(true);
        setFormData(cloneDeep(initialData));
        setOriginalData(cloneDeep(initialData));
      }
    };

    loadAttributes();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRowChange = useCallback((sectionKey, id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  }, []);

  const handleAddRow = useCallback((sectionKey) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: [
        ...prev[sectionKey],
        {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          code: '',
          name: '',
          nameEn: '',
          nameKo: '',
          nameVi: '',
        },
      ],
    }));
  }, []);

  const handleDeleteRow = useCallback((sectionKey, id) => {
    setFormData((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].filter((item) => item.id !== id),
    }));
  }, []);

  const handleSaveClick = () => {
    if (isSaving) return;
    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const changedPayload = {};

      visibleSectionConfigs.forEach((section) => {
        const sectionKey = section.key;
        const beforeRows = originalData[sectionKey] || [];
        const afterRows = formData[sectionKey] || [];
        if (!areRowsEqual(beforeRows, afterRows)) {
          changedPayload[sectionKey] = afterRows;
        }
      });

      if (Object.keys(changedPayload).length === 0) {
        setConfirmOpen(false);
        showNotification('변경사항이 없습니다.', 'info');
        return;
      }

      const response = await updateAttributes(changedPayload);
      const merged = normalizeData({ ...formData, ...response });
      setFormData(merged);
      setOriginalData(cloneDeep(merged));
      setConfirmOpen(false);
      showNotification('속성 정보가 저장되었습니다.', 'success');
    } catch (_error) {
      showNotification('속성 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppPageContainer>
      <Box>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
              속성 관리
            </Typography>
            <Typography variant="body2" color="text.secondary">
              사이즈와 성별은 공통 코드로 고정되어 있어 이 화면에서 관리하지 않습니다.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              onClick={handleSaveClick}
              disabled={!isDirty || isSaving}
              startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {isSaving ? '저장 중...' : '저장'}
            </Button>
          </Box>
        </Box>

        <Grid container spacing={3}>
          {visibleSectionConfigs.map((config) => (
            <Grid item xs={12} key={config.key}>
              <AttributeSection
                config={config}
                rows={formData[config.key] || []}
                onAddRow={handleAddRow}
                onDeleteRow={handleDeleteRow}
                onRowChange={handleRowChange}
              />
            </Grid>
          ))}
        </Grid>
      </Box>

      <Dialog open={isConfirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>변경사항 저장</DialogTitle>
        <DialogContent>
          <DialogContentText>변경사항을 저장하시겠습니까?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={isSaving}>
            취소
          </Button>
          <Button
            onClick={handleConfirmSave}
            variant="contained"
            autoFocus
            disabled={isSaving}
            startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {isSaving ? '저장 중...' : '확인'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default AttrBoard;
