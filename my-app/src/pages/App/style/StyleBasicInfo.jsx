import React, { useState } from 'react';
import { Box, TextField, Typography, Card, CardMedia, Button, CardContent, Stack, Divider, Grid } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ImageIcon from '@mui/icons-material/Image';

const StyleBasicInfo = ({ formData = {}, handleInputChange }) => {
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

  // --- Dummy Data & Logic for 3rd Column ---
  const styleDetails = {
    'Category': 'Outer',
    'Fabric': 'Cotton 100%',
    'Size Spec': 'S, M, L',
    'Colorway': 'Black, Ivory',
    'Factory': '제일 공장',
  };
  
  const costData = [
      { item: '원단 (Fabric)', cost: '$15.00' },
      { item: '부자재 (Trims)', cost: '$3.50' },
      { item: '공임 (CMT)', cost: '$8.00' },
      { item: '기타 (Misc.)', cost: '$1.20' },
  ];

  const subtotal = costData.reduce((acc, item) => acc + parseFloat(item.cost.substring(1)), 0);
  const overhead = subtotal * 0.1;
  const totalCost = subtotal + overhead;
  // --- End of Dummy Data ---

  const formFields = [
    { name: 'name', label: '스타일명' },
    { name: 'customer', label: '고객사' },
    { name: 'designer', label: '디자이너' },
    { name: 'collection', label: '컬렉션' },
    { name: 'season', label: '시즌' },
    { name: 'registrationDate', label: '등록일자', readOnly: true },
  ];

  return (
    <Grid container spacing={3} sx={{ mt: 0 }}>
      {/* 1st Column: Image Uploader */}
      <Grid item xs={12} md={4}>
        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>스타일 사진</Typography>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2} alignItems="center" sx={{ mt: 2 }}>
              <Box 
                sx={{ 
                  width: '100%', 
                  aspectRatio: '1 / 1', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  backgroundColor: 'grey.50',
                  border: '1px dashed',
                  borderColor: 'grey.300',
                  borderRadius: 1,
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
              </Box>
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
          </CardContent>
        </Card>
      </Grid>
      
      <Grid item xs={12} md={4}>
        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>스타일 정보</Typography>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2.5} mt={2.5}>
              {formFields.map((field) => (
                <Box key={field.name} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">{field.label}</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{formData[field.name] || '-'}</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      {/* 3rd Column: Details & Cost */}
      <Grid item xs={12} md={4}>
        <Card sx={{ height: '100%' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>세부 정보 및 비용</Typography>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2} mt={2}>
              {Object.entries(styleDetails).map(([key, value]) => (
                <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">{key}</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{value || '-'}</Typography>
                </Box>
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>예상 원가</Typography>
            <Stack spacing={1.5} mt={2}>
              {costData.map((row) => (
                  <Box key={row.item} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">{row.item}</Typography>
                      <Typography variant="body2">{row.cost}</Typography>
                  </Box>
              ))}
              <Divider sx={{ pt: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body1" sx={{ fontWeight: 'medium' }}>Subtotal</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'medium' }}>${subtotal.toFixed(2)}</Typography>
              </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Overhead (10%)</Typography>
                  <Typography variant="body2" color="text.secondary">${overhead.toFixed(2)}</Typography>
              </Box>
              <Divider sx={{ pt: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Total Cost</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>${totalCost.toFixed(2)}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default StyleBasicInfo;