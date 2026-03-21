import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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

const PROCESS_NAMING_RULE_LINES = [
  '권장 형식: 주대상 - 세부위치/부속 - 작업 - 방식/규격',
  '항상 주대상부터 쓰고, 작업은 뒤로 보냅니다.',
  '여러 작업은 + 로만 연결합니다.',
  '규격은 맨 끝 괄호로 통일합니다. 예: (1줄), (3실), (5mm)',
];

const PROCESS_NAMING_PLACEHOLDER_LINES = [
  '주대상이 없으면 ((주대상 누락))',
  '작업이 없으면 ((작업 누락))',
  '애매한 항목도 비워두지 말고 placeholder를 남깁니다.',
];

const PROCESS_NAMING_EXAMPLES = [
  '허리밴드 - 상침 (완성)',
  '앞판 포켓 - 부착',
  '웰트 - 오버록 (3실)',
  '지퍼 가드 - 뒤집어 박기',
];

const PROCESS_NAMING_XN_LINES = [
  '같은 공정을 두 번 이상 반복하는 스타일은 마스터 공정명에 x2, x3를 넣지 않습니다.',
  'xN 표시는 스타일/배정/생산계획 화면에서 수량 기준으로만 붙입니다.',
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
  onOpenGuide,
}) {
  const sortedRows = useMemo(() => [...rows].sort(sortRowsByCode), [rows]);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
              {config.title}
            </Typography>
            {config.key === 'processes' && onOpenGuide ? (
              <Tooltip title="공정 명명 규칙 보기">
                <IconButton
                  size="small"
                  onClick={onOpenGuide}
                  sx={{ color: 'text.secondary', p: 0.25 }}
                >
                  <InfoOutlinedIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Box>
          <Typography variant="caption" color="text.secondary">
            영어명을 기본값으로 사용하고, 한국어명/베트남어명은 다국어 표시용입니다.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => onAddRow(config.key)}
          >
            추가
          </Button>
        </Stack>
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

const ProcessNamingGuideDialog = memo(function ProcessNamingGuideDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>공정 명칭 가이드</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            공정 코드는 유지하고, 텍스트는 같은 순서로 적어 중복을 줄입니다.
          </Alert>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              기본 틀
            </Typography>
            {PROCESS_NAMING_RULE_LINES.map((line) => (
              <Typography key={line} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {line}
              </Typography>
            ))}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              누락 표기
            </Typography>
            {PROCESS_NAMING_PLACEHOLDER_LINES.map((line) => (
              <Typography key={line} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {line}
              </Typography>
            ))}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              예시
            </Typography>
            {PROCESS_NAMING_EXAMPLES.map((line) => (
              <Typography
                key={line}
                variant="body2"
                sx={{ mb: 0.5, fontFamily: '"Roboto Mono", monospace' }}
              >
                {line}
              </Typography>
            ))}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
              반복 수량 xN
            </Typography>
            {PROCESS_NAMING_XN_LINES.map((line) => (
              <Typography key={line} variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                {line}
              </Typography>
            ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
});

const AttrBoard = () => {
  const { showNotification } = useApp();
  const [canManageProcesses, setCanManageProcesses] = useState(true);
  const [isProcessGuideOpen, setIsProcessGuideOpen] = useState(false);
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
        const data = await fetchAttributes({
          includeColors: true,
          includeCategories: true,
          includeRoles: false,
          includeProcesses: true,
        });
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

  const handleSave = async () => {
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
        showNotification('변경사항이 없습니다.', 'info');
        return;
      }

      const response = await updateAttributes(changedPayload);
      const merged = normalizeData({ ...formData, ...response });
      setFormData(merged);
      setOriginalData(cloneDeep(merged));
      showNotification('속성 정보가 저장되었습니다.', 'success');
    } catch (_error) {
      showNotification('속성 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <AppPageContainer
      title="속성 관리"
      titleActions={(
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      )}
    >
      <Grid container spacing={3}>
        {visibleSectionConfigs.map((config) => (
          <Grid item xs={12} key={config.key}>
            <AttributeSection
              config={config}
              rows={formData[config.key] || []}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              onRowChange={handleRowChange}
              onOpenGuide={
                config.key === 'processes' ? () => setIsProcessGuideOpen(true) : undefined
              }
            />
          </Grid>
        ))}
      </Grid>
      <ProcessNamingGuideDialog
        open={isProcessGuideOpen}
        onClose={() => setIsProcessGuideOpen(false)}
      />
    </AppPageContainer>
  );
};

export default AttrBoard;
