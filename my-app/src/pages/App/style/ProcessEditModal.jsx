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
  const [pt, setPt] = useState('');
  const [at, setAt] = useState('');
  const [st, setSt] = useState('');

  useEffect(() => {
    if (process) {
      setName(process.name || '');
      setPt(process.pt || '');
      setAt(process.at || '');
      setSt(process.st || process.smv || ''); // Prioritize 'st', fallback to 'smv'
    }
  }, [process]);

  const handleSave = () => {
    const { smv, ...rest } = process; // a trick to remove smv if it exists
    onSave({ 
      ...rest, 
      name, 
      pt: Number(pt),
      at: Number(at), 
      st: Number(st) 
    });
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
          fullWidth
          id="pt"
          label="PT(임시)"
          name="pt"
          type="number"
          value={pt}
          onChange={(e) => setPt(e.target.value)}
          helperText="관리자가 설정하는 임시 기준 시간입니다."
        />
        <TextField
          margin="normal"
          fullWidth
          id="at"
          label="AT(실측)"
          name="at"
          type="number"
          value={at}
          disabled
          helperText="실제 작업 기록을 바탕으로 시스템이 자동 계산하는 평균 시간입니다."
        />
        <TextField
          margin="normal"
          required
          fullWidth
          id="st"
          label="ST(표준)"
          name="st"
          type="number"
          value={st}
          onChange={(e) => setSt(e.target.value)}
          helperText="데이터가 충분히 축적된 후, 확정하는 표준 시간입니다."
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
