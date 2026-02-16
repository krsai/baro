import React, { useEffect, useRef } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchableSelect from '../../../components/SearchableSelect';
import WorkItemRow from './WorkItemRow';

const WorkerLog = ({
  rowIndex,
  log,
  onWorkerChange,
  onRemoveWorker,
  onAddItem,
  onRemoveItem,
  onItemChange,
  availableEmployees,
  customers,
  styles,
  factory,
  takenWorkerIds,
  focusRequest,
  focusWorkerRequest,
  onRequestFocusCancel,
}) => {
  const options = availableEmployees.filter(
    (employee) => !takenWorkerIds?.has(employee.id) || employee.id === log.worker?.id
  );
  const hasWorker = Boolean(log.worker?.id);
  const workerInputRef = useRef(null);
  const addItemButtonRef = useRef(null);

  useEffect(() => {
    if (!focusWorkerRequest?.token) return;
    requestAnimationFrame(() => {
      workerInputRef.current?.focus();
    });
  }, [focusWorkerRequest?.token]);

  const focusAddItemButton = () => {
    requestAnimationFrame(() => {
      addItemButtonRef.current?.focus();
    });
  };

  return (
    <Box
      sx={{
        p: 1.5,
        mb: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        backgroundColor: '#fff',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
        <Chip size="small" label={`작업자 ${rowIndex}`} />
        <Chip size="small" variant="outlined" label={`항목 ${log.items.length}건`} />
      </Stack>

      <Box sx={{ mt: 1.25 }}>
        <SearchableSelect
          label="작업자"
          options={options}
          value={log.worker}
          onChange={(_event, value) => onWorkerChange(log.id, value)}
          sx={{ maxWidth: { xs: '100%', md: 360 } }}
          textFieldProps={{
            size: 'small',
            placeholder: '작업자를 선택하세요',
            inputRef: workerInputRef,
          }}
        />
        {!hasWorker ? (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
            작업자를 먼저 선택하면 항목 입력이 활성화됩니다.
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
            키보드 입력: 수량 칸에서 Tab을 누르면 항목 추가 버튼으로 이동합니다.
          </Typography>
        )}
      </Box>

      <Box sx={{ pt: 1.25 }}>
        {log.items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            아직 항목이 없습니다. 항목 추가를 눌러 입력을 시작하세요.
          </Typography>
        ) : (
          log.items.map((item, itemIndex) => (
            <WorkItemRow
              key={item.id}
              item={item}
              itemIndex={itemIndex + 1}
              disabled={!hasWorker}
              focusRequest={focusRequest}
              onItemChange={(field, value) => onItemChange(log.id, item.id, field, value)}
              onRemoveItem={() => onRemoveItem(log.id, item.id)}
              onRequestAddItem={() => onAddItem(log.id, { focusField: 'customer' })}
              onRequestActionFocus={focusAddItemButton}
              customers={customers}
              styles={styles}
              factory={factory}
            />
          ))
        )}
      </Box>

      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
        <Button
          size="small"
          startIcon={<AddCircleOutlineIcon />}
          onClick={() => onAddItem(log.id, { focusField: 'customer' })}
          disabled={!hasWorker}
          ref={addItemButtonRef}
        >
          항목 추가
        </Button>
        <Button
          size="small"
          color="error"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => onRemoveWorker(log.id)}
          onKeyDown={(event) => {
            if (
              event.key === 'Tab' &&
              !event.shiftKey &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.metaKey
            ) {
              event.preventDefault();
              onRequestFocusCancel?.();
            }
          }}
        >
          작업자 제거
        </Button>
      </Stack>
    </Box>
  );
};

export default WorkerLog;
