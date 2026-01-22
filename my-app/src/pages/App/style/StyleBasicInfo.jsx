import React from 'react';
import { Box, TextField, Grid, Typography } from '@mui/material';

const StyleBasicInfo = ({ formData = {}, handleInputChange }) => {
  return (
    <Box sx={{ mt: 1 }}>
      <Typography variant="h6" gutterBottom>
        스타일 기본 정보
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField name="styleCode" label="스타일 코드" value={formData.styleCode || ''} onChange={handleInputChange} fullWidth />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField name="styleName" label="스타일 명" value={formData.styleName || ''} onChange={handleInputChange} fullWidth />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField name="designer" label="디자이너" value={formData.designer || ''} onChange={handleInputChange} fullWidth />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField name="collection" label="컬렉션" value={formData.collection || ''} onChange={handleInputChange} fullWidth />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField name="season" label="시즌" value={formData.season || ''} onChange={handleInputChange} fullWidth />
        </Grid>
      </Grid>
    </Box>
  );
};

export default StyleBasicInfo;