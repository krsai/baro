import React from 'react';
import { Box, Typography, IconButton, Button, Divider } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchableSelect from '../../../components/SearchableSelect';
import WorkItemRow from './WorkItemRow'; // Assuming we create this for clarity

const WorkerLog = ({
  log,
  onWorkerChange,
  onRemoveWorker,
  onAddItem,
  onRemoveItem,
  onItemChange,
  availableEmployees,
  customers,
  styles,
  processes,
  factory,
}) => {
  const unselectedEmployees = availableEmployees.filter(
    // Logic to prevent selecting the same worker twice can be added here
    (emp) => emp.id !== log.worker?.id
  );

  return (
    <Box sx={{ p: 2, mb: 2, border: '1px solid #ddd', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <SearchableSelect
            label="작업자"
            options={availableEmployees}
            value={log.worker}
            onChange={(e, val) => onWorkerChange(log.id, val)}
            sx={{ width: '50%' }}
          />
        </Box>
        <IconButton onClick={() => onRemoveWorker(log.id)} color="error" sx={{ ml: 1 }}>
          <DeleteIcon />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ pt: 2 }}>
        {log.items.map((item) => (
          <WorkItemRow
            key={item.id}
            item={item}
            onItemChange={(field, value) => onItemChange(log.id, item.id, field, value)}
            onRemoveItem={() => onRemoveItem(log.id, item.id)}
            onEnter={() => onAddItem(log.id)}
            customers={customers}
            styles={styles}
            processes={processes}
            factory={factory}
          />
        ))}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Button
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => onAddItem(log.id)}
            disabled={!log.worker}
          >
            작업 항목 추가
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default WorkerLog;
