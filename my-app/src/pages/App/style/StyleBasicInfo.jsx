import React, { useState } from 'react';
import { Box, TextField, Typography, Card, CardMedia, Button, CardContent, Stack } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';

const StyleBasicInfo = ({ formData = {}, handleInputChange }) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      setImagePreviewUrl(URL.createObjectURL(file));
      // Optionally, you might want to call a parent handler to save the file or its info
      // For now, it just handles local state.
    } else {
      setSelectedImage(null);
      setImagePreviewUrl(null);
    }
  };

  const formFields = [
    { name: 'name', label: '스타일명' },
    { name: 'customer', label: '고객사' },
    { name: 'designer', label: '디자이너' },
    { name: 'collection', label: '컬렉션' },
    { name: 'season', label: '시즌' },
    { name: 'registrationDate', label: '등록일자', readOnly: true },
  ];

  return (
    <Box sx={{ mt: 1, display: 'flex', gap: 4 }}>

      {/* Left Column: Image Preview and Upload */}
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Typography variant="subtitle1">미리보기</Typography>
          <Card sx={{ width: '100%', aspectRatio: '1/1', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px dashed grey' }}>
            {imagePreviewUrl ? (
              <CardMedia
                component="img"
                image={imagePreviewUrl}
                alt="Style Preview"
                sx={{ objectFit: 'contain', maxHeight: '100%', maxWidth: '100%' }}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                이미지 없음
              </Typography>
            )}
          </Card>
          <input
            accept="image/*"
            style={{ display: 'none' }}
            id="raised-button-file"
            multiple
            type="file"
            onChange={handleImageChange}
          />
          <label htmlFor="raised-button-file">
            <Button variant="contained" component="span" startIcon={<PhotoCamera />}>
              사진 파일 올리기
            </Button>
          </label>
        </Box>
      </Box>

      {/* Right Column: Data Information Area */}
      <Box sx={{ flex: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Basic Information Card/Section */}
          <Card variant="outlined" sx={{ p: 2 }}>
            <CardContent>
              <Stack spacing={2}>
                {formFields.map((field) => (
                  <Box key={field.name} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography align="center" sx={{ width: 100, flexShrink: 0 }}>
                      {field.label}
                    </Typography>
                    <TextField
                      name={field.name}
                      value={formData[field.name] || ''}
                      onChange={handleInputChange}
                      fullWidth
                      variant="outlined"
                      InputProps={{
                        readOnly: field.readOnly,
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
};

export default StyleBasicInfo;