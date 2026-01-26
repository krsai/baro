import React, { useState, useEffect } from 'react';
import {
  Modal,
  Box,
  Typography,
  TextField,
  Button,
} from '@mui/material';

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

const ProcessEditModal = ({ open, onClose, process, onSave }) => {
  const [name, setName] = useState('');
  const [smv, setSmv] = useState('');

  useEffect(() => {
    if (process) {
      setName(process.name);
      setSmv(process.smv);
    }
  }, [process]);

  const handleSave = () => {
    onSave({ ...process, name, smv: Number(smv) });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="edit-process-modal-title"
      aria-describedby="edit-process-modal-description"
    >
      <Box sx={style}>
        <Typography id="edit-process-modal-title" variant="h6" component="h2">
          공정 정보 수정
        </Typography>
        <TextField
          margin="normal"
          required
          fullWidth
          id="name"
          label="공정 이름"
          name="name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          margin="normal"
          required
          fullWidth
          id="smv"
          label="표준 공정 시간 (SMV)"
          name="smv"
          type="number"
          value={smv}
          onChange={(e) => setSmv(e.target.value)}
        />
        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={onClose} sx={{ mr: 1 }}>
            취소
          </Button>
          <Button onClick={handleSave} variant="contained">
            저장
          </Button>
        </Box>
      </Box>
    </Modal>
  );
};

export default ProcessEditModal;
