import React from 'react';
import { Box, Typography, TextField } from '@mui/material';

const StyleBom = ({ formData = {}, handleInputChange }) => {
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="h6" gutterBottom>
        스타일 BOM
      </Typography>
      <TextField
        name="bomNotes"
        label="BOM 특이사항"
        value={formData.bomNotes || ''}
        onChange={handleInputChange}
        fullWidth
        multiline
        rows={4}
        margin="normal"
      />
    </Box>
  );
};

export default StyleBom;