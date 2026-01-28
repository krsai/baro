import React, { useState } from 'react';
import { Box, TextField, Typography, Card, CardMedia, Button, CardContent, Stack, Divider, Grid } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ImageIcon from '@mui/icons-material/Image';


const StyleBasicInfo = ({ formData = {}, handleInputChange, processes = [] }) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    } else {
      setSelectedImage(null);
      setImagePreviewUrl(null);
    }
  };

  const formatTime = (value, unit = '초', notSetDisplay = '-') => {
    if (value === null || typeof value === 'undefined' || value === '') {
      return notSetDisplay;
    }
    return `${value}${unit}`;
  };

  const totals = (processes || []).reduce(
    (acc, process) => {
      if (typeof process.pt === 'number') acc.pt += process.pt;
      if (typeof process.at === 'number') acc.at += process.at;
      const stValue = process.st || process.smv;
      if (typeof stValue === 'number') acc.st += stValue;
      return acc;
    },
    { pt: 0, at: 0, st: 0 }
  );

  const formFields = [
    { name: 'name', label: '스타일명' },
    { name: 'customer', label: '고객사' },
    { name: 'designer', label: '디자이너' },
    { name: 'collection', label: '컬렉션' },
    { name: 'season', label: '시즌' },
    { name: 'registrationDate', label: '등록일자', readOnly: true },
  ];

  return (
    <Box sx={{ mt: 1, display: 'flex', gap: 3 }}>
      {/* Main Column (Left) */}
      <Box sx={{ flex: 2 }}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              스타일 정보
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={3}>
              {/* Image Uploader */}
              <Grid item xs={12} md={4}>
                <Stack spacing={2} alignItems="center">
                  <Card 
                    variant="outlined" 
                    sx={{ 
                      width: '100%', 
                      aspectRatio: '1 / 1', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      backgroundColor: 'grey.50'
                    }}
                  >
                    {imagePreviewUrl ? (
                      <CardMedia
                        component="img"
                        image={imagePreviewUrl}
                        alt="Style Preview"
                        sx={{ objectFit: 'contain', maxHeight: '100%', maxWidth: '100%' }}
                      />
                    ) : (
                      <ImageIcon sx={{ fontSize: 80, color: 'grey.300' }} />
                    )}
                  </Card>
                  <input
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="raised-button-file"
                    type="file"
                    onChange={handleImageChange}
                  />
                  <label htmlFor="raised-button-file">
                    <Button variant="contained" component="span" startIcon={<PhotoCamera />}>
                      사진 올리기
                    </Button>
                  </label>
                </Stack>
              </Grid>
              {/* Form Fields */}
              <Grid item xs={12} md={8}>
                <Grid container spacing={2}>
                  {formFields.map((field) => (
                    <Grid item xs={12} sm={6} key={field.name}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary' }}>
                          {field.label}
                        </Typography>
                        <TextField
                          name={field.name}
                          value={formData[field.name] || ''}
                          onChange={handleInputChange}
                          fullWidth
                          variant="outlined"
                          size="small"
                          InputProps={{ readOnly: field.readOnly }}
                        />
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>

      {/* Side Column (Right) */}
      <Box sx={{ flex: 1 }}>
        <Card variant="outlined" sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              공정 시간 합계
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={3} sx={{ mt: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography variant="body1" color="text.secondary">PT (임시)</Typography>
                <Typography variant="h5" sx={{ fontWeight: 500 }}>{formatTime(totals.pt)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography variant="body1" color="text.secondary">AT (실측)</Typography>
                <Typography variant="h5" sx={{ fontWeight: 500 }}>{formatTime(totals.at, '초', '데이터 부족')}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Typography variant="body1" color="text.secondary">ST (표준)</Typography>
                <Typography variant="h5" sx={{ fontWeight: 500 }}>{formatTime(totals.st)}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default StyleBasicInfo;