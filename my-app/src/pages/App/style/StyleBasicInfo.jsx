import React, { useState } from 'react';
import { Box, TextField, Typography, Card, CardMedia, Button, CardContent, Stack, Divider, Grid, Paper } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ImageIcon from '@mui/icons-material/Image';

const StyleBasicInfo = ({ formData = {}, handleInputChange }) => {
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState([
    'https://placehold.co/600x600/EEE/31343C',
    'https://placehold.co/600x600/CCC/31343C',
  ]);
  const [mainImageIndex, setMainImageIndex] = useState(0);

  const handleImageChange = (event) => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
      const newImages = [...selectedImages, ...files];
      const newImageUrls = newImages.map(file => URL.createObjectURL(file));
      
      setSelectedImages(newImages);
      setImagePreviewUrls(newImageUrls);
      // Reset main image to the first one if the list was empty before
      if (selectedImages.length === 0) {
        setMainImageIndex(0);
      }
    }
  };

  const handleThumbnailClick = (index) => {
    setMainImageIndex(index);
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
    <Box>
      <Stack direction="row" spacing={3}>
        {/* Section 1: Image Uploader */}
        <Paper sx={{ p: 2, width: '33.33%' }}>
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
                backgroundColor: 'grey.100',
                border: '2px dashed',
                borderColor: 'grey.300',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              {imagePreviewUrls.length > 0 ? (
                <CardMedia
                  component="img"
                  image={imagePreviewUrls[mainImageIndex]}
                  alt={`Style Preview ${mainImageIndex + 1}`}
                  sx={{ objectFit: 'contain', maxHeight: '100%', maxWidth: '100%' }}
                />
              ) : (
                <Stack alignItems="center" spacing={1} color="grey.500">
                  <ImageIcon sx={{ fontSize: 60 }} />
                  <Typography variant="body2">사진을 업로드하세요</Typography>
                </Stack>
              )}
            </Box>
            
            {imagePreviewUrls.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ width: '100%', overflowX: 'auto', p: 1 }}>
                {imagePreviewUrls.map((url, index) => (
                  <Box
                    key={index}
                    onClick={() => handleThumbnailClick(index)}
                    sx={{
                      width: 60,
                      height: 60,
                      minWidth: 60,
                      cursor: 'pointer',
                      border: mainImageIndex === index ? '3px solid' : '1px solid',
                      borderColor: mainImageIndex === index ? 'primary.main' : 'grey.300',
                      borderRadius: 1,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <CardMedia
                      component="img"
                      image={url}
                      alt={`Thumbnail ${index + 1}`}
                      sx={{ objectFit: 'cover', width: '100%', height: '100%' }}
                    />
                  </Box>
                ))}
              </Stack>
            )}

            <input
              accept="image/*"
              style={{ display: 'none' }}
              id="raised-button-file"
              type="file"
              multiple
              onChange={handleImageChange}
            />
            <label htmlFor="raised-button-file">
              <Button variant="contained" component="span" startIcon={<PhotoCamera />}>
                사진 올리기
              </Button>
            </label>
          </Stack>
        </Paper>

        {/* Section 2: Style Info */}
        <Paper sx={{ p: 2, width: '33.33%' }}>
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
        </Paper>

        {/* Section 3: Details & Cost */}
        <Paper sx={{ p: 2, width: '33.33%' }}>
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
          <Paper elevation={2} sx={{ p: 2, mt: 2, bgcolor: 'grey.50' }}>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'text.secondary' }}>
                <Typography variant="body2">항목</Typography>
                <Typography variant="body2">금액</Typography>
              </Box>
              <Divider />
              {costData.map((row) => (
                <Box key={row.item} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">{row.item}</Typography>
                  <Typography variant="body2">{row.cost}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1 }} />
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body1">Subtotal</Typography>
                  <Typography variant="body1">${subtotal.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Overhead (10%)</Typography>
                  <Typography variant="body2" color="text.secondary">${overhead.toFixed(2)}</Typography>
                </Box>
              </Stack>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Total Cost</Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>${totalCost.toFixed(2)}</Typography>
              </Box>
            </Stack>
          </Paper>
        </Paper>
      </Stack>
    </Box>
  );
};

export default StyleBasicInfo;