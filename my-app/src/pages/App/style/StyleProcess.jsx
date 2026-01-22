import React from 'react';
import { Box, Typography, TextField, Grid } from '@mui/material';

const StyleProcess = ({ formData, handleInputChange }) => {
  return (
    <Box sx={{ p: 3, border: '1px solid #e0e0e0', borderRadius: 1, mt: 2 }}>
      <Typography variant="h6" gutterBottom>공정 정보</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="공정명"
            name="processName"
            value={formData.processName || ''}
            onChange={handleInputChange}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="공정 설명"
            name="processDescription"
            value={formData.processDescription || ''}
            onChange={handleInputChange}
          />
        </Grid>
        {/* Add more fields relevant to process information */}
      </Grid>
    </Box>
  );
};

export default StyleProcess;
