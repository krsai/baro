import React, { useEffect, useRef } from 'react';
import { Box, IconButton, Stack, TextField } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchableSelect from '../../../components/SearchableSelect';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const isAgreedAssignmentPlan = (plan) =>
  String(plan?.ctStatus || '').trim().toUpperCase() === 'AGREED';

const formatCardOptionLabel = (option) => {
  const customer = String(option?.customer || '').trim() || '고객사 미지정';
  const orderNo = String(option?.orderNo || '-').trim() || '-';
  const styleLabel = String(option?.label || '').trim() || '스타일 미지정';
  const colorName = String(option?.colorName || '').trim() || '색상 미지정';
  return `${customer} · [${orderNo}] · ${styleLabel} · ${colorName}`;
};

const formatProcessOptionLabel = (option) => {
  if (!option) return '';
  const code = String(option?.code || '').trim();
  const name = String(option?.name || '').trim();
  if (code && name) return `[${code}] ${name}`;
  return code || name || '공정';
};

const resolveRowCtSeconds = (process) => {
  const candidates = [
    process?.ctSeconds,
    process?.contractedSeconds,
    process?.ct,
    process?.at,
    process?.pt,
  ];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }
  return 0;
};

const WorkItemRow = ({
  entry,
  availableEmployees = [],
  assignmentPlans = [],
  processOptions = [],
  duplicateProcessKeys = new Set(),
  focusRequest,
  onWorkerChange,
  onCardChange,
  onProcessChange,
  onQuantityChange,
  onAddRow,
  onRemoveRow,
  canRemove = true,
  embedded = false,
  showWorkerField = false,
}) => {
  const workerInputRef = useRef(null);
  const cardInputRef = useRef(null);
  const processInputRef = useRef(null);
  const quantityInputRef = useRef(null);

  useEffect(() => {
    if (!focusRequest?.token || focusRequest.entryId !== entry?.id) return;

    const focusMap = {
      worker: showWorkerField ? workerInputRef.current : null,
      card: cardInputRef.current,
      process: processInputRef.current,
      quantity: quantityInputRef.current,
    };

    requestAnimationFrame(() => {
      const target =
        focusMap[focusRequest.field] ||
        (showWorkerField ? workerInputRef.current : cardInputRef.current);
      target?.focus();
    });
  }, [entry?.id, focusRequest?.entryId, focusRequest?.field, focusRequest?.token, showWorkerField]);

  const currentWorker = entry?.worker || null;
  const cardDisabled = !currentWorker || assignmentPlans.length === 0;
  const processDisabled = !entry?.card || processOptions.length === 0;
  const quantityDisabled = !entry?.process;
  const ctSeconds = resolveRowCtSeconds(entry?.process);

  return (
    <Box
      sx={{
        p: embedded ? 0 : 1.5,
        border: embedded ? 'none' : '1px solid',
        borderColor: embedded ? 'transparent' : 'divider',
        borderRadius: embedded ? 0 : 2,
        backgroundColor: embedded ? 'transparent' : '#fff',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: {
            xs: '1fr',
            xl: 'minmax(180px, 1fr) minmax(360px, 2.3fr) minmax(220px, 1.35fr) 120px 120px auto',
          },
          alignItems: 'start',
        }}
      >
        {showWorkerField ? (
          <SearchableSelect
            label="작업자"
            options={availableEmployees}
            value={currentWorker}
            onChange={(_event, value) => onWorkerChange?.(entry?.id, value)}
            autoHighlight
            getOptionLabel={(option) => option?.name || ''}
            isOptionEqualToValue={(option, value) => option?.id === value?.id}
            textFieldProps={{
              size: 'small',
              placeholder: '작업자를 선택하세요.',
              inputRef: workerInputRef,
            }}
          />
        ) : (
          <Box
            aria-hidden="true"
            sx={{
              display: { xs: 'none', xl: 'block' },
            }}
          />
        )}

        <SearchableSelect
          label="배정카드"
          options={assignmentPlans}
          value={entry?.card || null}
          onChange={(_event, value) => onCardChange?.(entry?.id, value)}
          disabled={cardDisabled}
          autoHighlight
          getOptionLabel={formatCardOptionLabel}
          isOptionEqualToValue={(option, value) => option?.dbId === value?.dbId}
          getOptionDisabled={(option) => !isAgreedAssignmentPlan(option)}
          textFieldProps={{
            size: 'small',
            placeholder:
              assignmentPlans.length === 0
                ? '선택 가능한 배정카드가 없습니다.'
                : '배정카드를 선택하세요.',
            inputRef: cardInputRef,
          }}
        />

        <SearchableSelect
          label="공정"
          options={processOptions}
          value={entry?.process || null}
          onChange={(_event, value) => onProcessChange?.(entry?.id, value)}
          disabled={processDisabled}
          autoHighlight
          getOptionLabel={formatProcessOptionLabel}
          isOptionEqualToValue={(option, value) => option?.id === value?.id}
          getOptionDisabled={(option) =>
            duplicateProcessKeys.has(option?.processKey || option?.id) &&
            (entry?.process?.processKey || entry?.process?.id) !==
              (option?.processKey || option?.id)
          }
          textFieldProps={{
            size: 'small',
            placeholder: !entry?.card
              ? '배정카드를 먼저 선택하세요.'
              : processOptions.length === 0
                ? '선택 가능한 공정이 없습니다.'
                : '공정을 선택하세요.',
            inputRef: processInputRef,
          }}
        />

        <TextField
          label="생산량"
          type="number"
          size="small"
          value={entry?.quantity ?? ''}
          onChange={(event) => {
            const raw = event.target.value;
            if (raw === '') {
              onQuantityChange?.(entry?.id, '');
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              onQuantityChange?.(entry?.id, parsed);
            }
          }}
          onKeyDown={(event) => {
            if (['-', '+', 'e', 'E', '.'].includes(event.key)) {
              event.preventDefault();
              return;
            }
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onAddRow?.(entry);
            }
          }}
          disabled={quantityDisabled}
          inputRef={quantityInputRef}
          inputProps={{ min: 1 }}
          fullWidth
        />

        <TextField
          label="CT"
          size="small"
          value={
            entry?.process
              ? `${formatNumberWithCommas(ctSeconds, {
                  fallback: '0',
                  maximumFractionDigits: 0,
                })}초`
              : '-'
          }
          InputProps={{ readOnly: true }}
          inputProps={{ tabIndex: -1 }}
          sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
          fullWidth
        />

        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <IconButton
            color="primary"
            onClick={() => onAddRow?.(entry)}
            aria-label="행 추가"
            size="small"
          >
            <AddCircleOutlineIcon />
          </IconButton>
          <IconButton
            color="error"
            onClick={() => onRemoveRow?.(entry?.id)}
            aria-label="행 삭제"
            size="small"
            disabled={!canRemove}
          >
            <DeleteOutlineIcon />
          </IconButton>
        </Stack>
      </Box>
    </Box>
  );
};

export default WorkItemRow;
