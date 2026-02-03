import React, { useState } from 'react';
import { Box, TextField, Typography, Card, CardMedia, Button, CardContent, Stack, Divider, Grid, Paper, FormControl, InputLabel, Select, MenuItem, IconButton } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ImageIcon from '@mui/icons-material/Image';
import { Close as CloseIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

// Mock Data for Customers (Simulating API response from Customer Management)
const mockCustomers = [
  { id: 'C-001', name: 'A고객사' },
  { id: 'C-002', name: 'B고객사' },
  { id: 'C-003', name: 'C고객사' },
];

const StyleInfo = ({ formData = {}, handleInputChange, isNew }) => {
  const { imageUrls = [], processes = [] } = formData; // Use image URLs and processes from props
  const [mainImageIndex, setMainImageIndex] = useState(0);

  // TODO: Implement adding new images, which involves creating blob URLs,
  // uploading them, and then updating the parent state.
  const handleImageChange = (event) => {
    console.log("Image selection not implemented yet.");
    // const files = Array.from(event.target.files);
    // if (files.length > 0) {
    //   const newImageFiles = [...(formData.newImageFiles || []), ...files];
    //   const newImageUrls = newImageFiles.map(file => URL.createObjectURL(file));
      
    //   handleInputChange({ target: { name: 'newImageFiles', value: newImageFiles } });
    //   // Visually, you might want to combine existing and new blob URLs for preview
    // }
  };

  const handleThumbnailClick = (index) => {
    setMainImageIndex(index);
  };

  const handleImageDelete = (indexToDelete) => {
    if (window.confirm('이 이미지를 삭제하시겠습니까?')) {
      const newImageUrls = imageUrls.filter((_, index) => index !== indexToDelete);
      
      // Notify parent component of the change
      handleInputChange({
        target: {
          name: 'imageUrls',
          value: newImageUrls,
        },
      });

      // Adjust mainImageIndex after deletion
      if (newImageUrls.length === 0) {
        setMainImageIndex(0);
      } else if (mainImageIndex >= indexToDelete && mainImageIndex > 0) {
        setMainImageIndex(mainImageIndex - 1);
      }
    }
  };

  const [styleDetailsData, setStyleDetailsData] = useState(
    {
      Category: '',
      Fabric: '',
      'Size Spec': '',
      Colorway: '',
    }
  );

  const handleDetailsChange = (event) => {
    const { name, value } = event.target;
    setStyleDetailsData(prev => ({ ...prev, [name]: value }));
  };
  
  const costData = [];

  const subtotal = costData.reduce((acc, item) => acc + parseFloat(item.cost.substring(1)), 0);
  const overhead = subtotal * 0.1;
  const totalCost = subtotal + overhead;
  // --- End of Dummy Data ---

  return (
    <Box>
      <Stack direction="row" spacing={3}>
        {/* Section 1: Image Uploader */}
        <Paper sx={{ p: 2, width: '33.33%' }}>
          <Typography variant="h6" gutterBottom>스타일 사진</Typography>
          <Stack spacing={2} alignItems="center" sx={{ mt: 2.5 }}>
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
              {imageUrls.length > 0 ? (
                <CardMedia
                  component="img"
                  image={imageUrls[mainImageIndex]}
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
            
            {imageUrls.length > 0 && (
              <Stack direction="row" spacing={1.5} sx={{ width: '100%', overflowX: 'auto', p: 1 }}>
                {imageUrls.map((url, index) => (
                  <Box
                    key={index}
                    sx={{
                      position: 'relative',
                      width: 60,
                      height: 60,
                      minWidth: 60,
                      '&:hover .delete-button': {
                        opacity: 1,
                      },
                    }}
                  >
                    <Box
                      onClick={() => handleThumbnailClick(index)}
                      sx={{
                        width: '100%',
                        height: '100%',
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
                    <IconButton
                      aria-label="delete image"
                      className="delete-button"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImageDelete(index);
                      }}
                      sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        padding: '2px',
                        color: 'text.primary',
                        backgroundColor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        opacity: 0,
                        transition: 'opacity 0.2s ease-in-out',
                        '&:hover': {
                          backgroundColor: 'grey.100',
                        },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: '0.875rem' }} />
                    </IconButton>
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

        {/* Section 2: Style Info & Details */}
        <Paper sx={{ p: 2, width: '33.33%' }}>
          <Typography variant="h6" gutterBottom>스타일 정보</Typography>
          <Stack spacing={2} mt={2.5}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">고객사</Typography>
              <Select
                name="customer"
                value={formData.customer || ''}
                onChange={handleInputChange}
                variant="standard"
                className="custom-form-input"
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled><Typography variant="body2" color="text.secondary">선택</Typography></MenuItem>
                {mockCustomers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.name}>{customer.name}</MenuItem>
                ))}
              </Select>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">카테고리</Typography>
              <Select
                name="Category"
                value={styleDetailsData['Category']}
                onChange={handleDetailsChange}
                variant="standard"
                className="custom-form-input"
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled><Typography variant="body2" color="text.secondary">선택</Typography></MenuItem>
                <MenuItem value="Outer">Outer</MenuItem>
                <MenuItem value="Top">Top</MenuItem>
                <MenuItem value="Bottom">Bottom</MenuItem>
                <MenuItem value="Dress">Dress</MenuItem>
              </Select>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">스타일명</Typography>
              <TextField
                name="name"
                value={formData.name || ''}
                onChange={handleInputChange}
                variant="standard"
                className="custom-form-input"
                sx={{ width: '70%' }}
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">스타일 코드</Typography>
              <TextField
                name="styleCode"
                value={formData.styleCode || ''}
                onChange={handleInputChange}
                variant="standard"
                className="custom-form-input"
                sx={{ width: '70%' }}
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">등록일자</Typography>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  value={formData.registrationDate ? dayjs(formData.registrationDate) : dayjs()}
                  onChange={(newValue) => {
                    handleInputChange({
                      target: {
                        name: 'registrationDate',
                        value: newValue ? newValue.format('YYYY-MM-DD') : '',
                      },
                    });
                  }}
                  slotProps={{
                    textField: { variant: 'standard', className: 'custom-form-input', sx: { width: '70%' } },
                  }}
                  format="YYYY-MM-DD"
                />
              </LocalizationProvider>
            </Box>
          </Stack>

          <Divider sx={{ my: 4 }} />
          
          <Typography variant="h6" gutterBottom>세부 정보</Typography>
          <Stack spacing={2} mt={2.5}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Fabric</Typography>
              <Select
                name="Fabric"
                value={styleDetailsData['Fabric']}
                onChange={handleDetailsChange}
                variant="standard"
                className="custom-form-input"
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled><Typography variant="body2" color="text.secondary">선택</Typography></MenuItem>
                <MenuItem value="Cotton">Cotton</MenuItem>
                <MenuItem value="Polyester">Polyester</MenuItem>
                <MenuItem value="Linen">Linen</MenuItem>
                <MenuItem value="Denim">Denim</MenuItem>
              </Select>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Size Spec</Typography>
              <Select
                name="Size Spec"
                value={styleDetailsData['Size Spec']}
                onChange={handleDetailsChange}
                variant="standard"
                className="custom-form-input"
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled><Typography variant="body2" color="text.secondary">선택</Typography></MenuItem>
                <MenuItem value="S-XL">S-XL</MenuItem>
                <MenuItem value="XS-XXL">XS-XXL</MenuItem>
                <MenuItem value="Free">Free</MenuItem>
              </Select>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Colorway</Typography>
              <Select
                name="Colorway"
                value={styleDetailsData['Colorway']}
                onChange={handleDetailsChange}
                variant="standard"
                className="custom-form-input"
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled><Typography variant="body2" color="text.secondary">선택</Typography></MenuItem>
                <MenuItem value="Basic">Basic</MenuItem>
                <MenuItem value="Pastel">Pastel</MenuItem>
                <MenuItem value="Vivid">Vivid</MenuItem>
                <MenuItem value="Dark">Dark</MenuItem>
              </Select>
            </Box>
          </Stack>
        </Paper>

        {/* Section 3: Process Summary & Cost */}
        <Paper sx={{ p: 2, width: '33.33%' }}>
          <Typography variant="h6" gutterBottom>공정 정보 요약</Typography>
          <Stack spacing={2} sx={{ mt: 2.5, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">총 공정 수</Typography>
                  <Typography variant="body2" sx={{fontWeight: '500'}}>{processes.length} 개</Typography>
              </Box>
          </Stack>

          <Divider sx={{ my: 4 }} />
          
          <Typography variant="h6" gutterBottom>예상 원가</Typography>
          <Paper elevation={2} sx={{ p: 2, mt: 2.5, bgcolor: 'grey.50' }}>
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

export default StyleInfo;