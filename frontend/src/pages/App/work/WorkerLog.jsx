import React from 'react';
import { Box, Stack } from '@mui/material';
import WorkItemRow from './WorkItemRow';

const WorkerLog = ({
  group,
  availableEmployees = [],
  assignmentPlans = [],
  processOptionsByLogId = new Map(),
  duplicateProcessKeysByLogId = new Map(),
  focusRequest,
  onWorkerChange,
  onCardChange,
  onProcessChange,
  onQuantityChange,
  onAddRow,
  onRemoveRow,
  canRemoveRow = true,
}) => {
  return (
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        backgroundColor: '#fff',
      }}
    >
      <Stack spacing={1.25}>
        {(group?.entries || []).map((entry, index) => (
          <Box
            key={entry.id}
            sx={{
              pt: index === 0 ? 0 : 1.25,
              mt: index === 0 ? 0 : 0.25,
              borderTop: index === 0 ? 'none' : '1px dashed',
              borderColor: 'divider',
            }}
          >
            <WorkItemRow
              embedded
              showWorkerField={index === 0}
              entry={entry}
              availableEmployees={availableEmployees}
              assignmentPlans={assignmentPlans}
              processOptions={processOptionsByLogId.get(entry.id) || []}
              duplicateProcessKeys={duplicateProcessKeysByLogId.get(entry.id) || new Set()}
              focusRequest={focusRequest}
              onWorkerChange={(entryId, value) =>
                onWorkerChange?.(
                  (group?.entries || []).map((groupEntry) => groupEntry.id),
                  value
                )
              }
              onCardChange={onCardChange}
              onProcessChange={onProcessChange}
              onQuantityChange={onQuantityChange}
              onAddRow={onAddRow}
              onRemoveRow={onRemoveRow}
              canRemove={canRemoveRow}
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

export default WorkerLog;
