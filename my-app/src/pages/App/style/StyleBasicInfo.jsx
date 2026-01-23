import React, { useState } from 'react';
import { Box, TextField, Grid, Typography, Card, CardMedia, Button, CardContent } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';

// Helper component for form field rows
const FormFieldRow = ({ children }) => (
  <Box sx={{ mb: 2 }}> {/* Margin bottom for spacing between fields */}
    {children}
  </Box>
);

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

  return (
    <Box sx={{ mt: 1 }}>

      <Grid container spacing={4}>


        {/* Left Column: Image Preview and Upload (approx 33%) */}
        <Grid item xs={12} md={3}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Typography variant="subtitle1">미리보기</Typography>
            <Card sx={{ width: '100%', maxWidth: 350, aspectRatio: '1/1', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '1px dashed grey' }}>
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
        </Grid>


        {/* Right Column: Data Information Area (approx 66%) */}
        <Grid item xs={12} md={9}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Basic Information Card/Section */}
            <Card variant="outlined" sx={{ p: 2 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>기본 정보</Typography>
                <FormFieldRow>
                  <TextField
                    name="clientCompany"
                    label="고객사"
                    value={formData.clientCompany || ''}
                    onChange={handleInputChange}
                    fullWidth
                    InputProps={{
                      readOnly: true,
                    }}
                    variant="outlined"
                  />
                </FormFieldRow>
                <FormFieldRow>
                  <TextField
                    name="styleName"
                    label="스타일명"
                    value={formData.styleName || ''}
                    onChange={handleInputChange}
                    fullWidth
                    InputProps={{
                      readOnly: true,
                    }}
                    variant="outlined"
                  />
                </FormFieldRow>
                <FormFieldRow>
                  <TextField
                    name="registrationDate"
                    label="등록일자"
                    value={formData.registrationDate || ''}
                    onChange={handleInputChange}
                    fullWidth
                    InputProps={{
                      readOnly: true,
                    }}
                    variant="outlined"
                  />
                </FormFieldRow>
                <FormFieldRow>
                  <TextField
                    name="updateDate"
                    label="업데이트 날짜"
                    value={formData.updateDate || ''}
                    onChange={handleInputChange}
                    fullWidth
                    InputProps={{
                      readOnly: true,
                    }}
                    variant="outlined"
                  />
                </FormFieldRow>
              </CardContent>
            </Card>


          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default StyleBasicInfo;