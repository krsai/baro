import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  TextField,
  Typography,
  CardMedia,
  Button,
  Stack,
  Divider,
  Paper,
  Select,
  MenuItem,
  IconButton,
} from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ImageIcon from '@mui/icons-material/Image';
import { Close as CloseIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { GENDER_CODES, SIZE_CODES } from '../../../../constants/productAttributes';
import { fetchAttributes } from '../../../../utils/attributeApi';
import { requestJSON } from '../../../../utils/apiClient';

const CUSTOMERS_CACHE_TTL_MS = 30 * 1000;

let customersCache = null;
let customersCacheTimestamp = 0;
let customersInFlight = null;

const loadCustomersOnce = async () => {
  if (
    Array.isArray(customersCache) &&
    Date.now() - customersCacheTimestamp <= CUSTOMERS_CACHE_TTL_MS
  ) {
    return customersCache;
  }
  if (customersInFlight) {
    return customersInFlight;
  }

  customersInFlight = requestJSON('/customers')
    .then((data) => {
      const normalized = Array.isArray(data) ? data : [];
      customersCache = normalized;
      customersCacheTimestamp = Date.now();
      return normalized;
    })
    .finally(() => {
      customersInFlight = null;
    });

  return customersInFlight;
};

const StyleInfo = ({
  formData = {},
  handleInputChange,
  isBrandOrg = false,
  defaultCustomerName = '',
}) => {
  const { imageUrls = [] } = formData;
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const resolvedCustomerValue = isBrandOrg
    ? formData.customer || defaultCustomerName || ''
    : formData.customer || '';

  useEffect(() => {
    let active = true;

    const fetchCustomers = async () => {
      if (isBrandOrg) {
        if (!active) return;
        setCustomers([]);
        setLoadingCustomers(false);
        return;
      }
      setLoadingCustomers(true);
      try {
        const data = await loadCustomersOnce();
        if (!active) return;
        setCustomers(data);
      } catch (_error) {
        if (!active) return;
        setCustomers([]);
      } finally {
        if (!active) return;
        setLoadingCustomers(false);
      }
    };

    fetchCustomers();

    return () => {
      active = false;
    };
  }, [isBrandOrg]);

  useEffect(() => {
    let active = true;

    const loadCategories = async () => {
      setLoadingCategories(true);
      try {
        const data = await fetchAttributes();
        if (!active) return;
        setCategories(Array.isArray(data?.categories) ? data.categories : []);
      } catch (_error) {
        if (!active) return;
        setCategories([]);
      } finally {
        if (!active) return;
        setLoadingCategories(false);
      }
    };

    loadCategories();

    return () => {
      active = false;
    };
  }, []);

  const handleImageChange = () => {
    console.log('Image selection not implemented yet.');
  };

  const handleThumbnailClick = (index) => {
    setMainImageIndex(index);
  };

  const handleImageDelete = (indexToDelete) => {
    if (window.confirm('이 이미지를 삭제하시겠습니까?')) {
      const newImageUrls = imageUrls.filter((_, index) => index !== indexToDelete);

      handleInputChange({
        target: {
          name: 'imageUrls',
          value: newImageUrls,
        },
      });

      if (newImageUrls.length === 0) {
        setMainImageIndex(0);
      } else if (mainImageIndex >= indexToDelete && mainImageIndex > 0) {
        setMainImageIndex(mainImageIndex - 1);
      }
    }
  };

  const [styleDetailsData, setStyleDetailsData] = useState({
    Fabric: '',
    Gender: '',
    'Size Spec': '',
    Colorway: '',
  });
  const sizeSpecOptions = useMemo(
    () => [
      SIZE_CODES.slice(1, 5).join(', '),
      SIZE_CODES.slice(0, 6).join(', '),
      SIZE_CODES.join(', '),
      'FREE',
    ],
    []
  );

  const handleDetailsChange = (event) => {
    const { name, value } = event.target;
    setStyleDetailsData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomerChange = (event) => {
    const nextCustomerName = event.target.value;
    if (isBrandOrg) {
      handleInputChange({
        target: {
          name: 'customer',
          value: defaultCustomerName || nextCustomerName || '',
        },
      });
      return;
    }

    const selected = customers.find((customer) => customer.name === nextCustomerName) || null;
    const parsedOrgId = Number(selected?.brandOrgId ?? selected?.id);
    handleInputChange({
      target: {
        name: 'customer',
        value: nextCustomerName,
      },
    });
    handleInputChange({
      target: {
        name: 'customerOrgId',
        value: Number.isInteger(parsedOrgId) && parsedOrgId > 0 ? parsedOrgId : null,
      },
    });
  };

  const sectionWidth = '50%';

  return (
    <Box>
      <Stack direction="row" spacing={3}>
        <Paper sx={{ p: 2, width: sectionWidth }}>
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
                  <Typography variant="body2">사진을 업로드해 주세요</Typography>
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

        <Paper sx={{ p: 2, width: sectionWidth }}>
          <Typography variant="h6" gutterBottom>스타일 정보</Typography>
          <Stack spacing={2} mt={2.5}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">고객사</Typography>
              <Select
                name="customer"
                value={resolvedCustomerValue}
                onChange={handleCustomerChange}
                displayEmpty
                disabled={isBrandOrg}
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled>
                  <Typography variant="body2" color="text.secondary">선택</Typography>
                </MenuItem>
                {isBrandOrg && resolvedCustomerValue && (
                  <MenuItem value={resolvedCustomerValue}>{resolvedCustomerValue}</MenuItem>
                )}
                {!isBrandOrg && loadingCustomers && (
                  <MenuItem value="" disabled>
                    <Typography variant="body2" color="text.secondary">불러오는 중...</Typography>
                  </MenuItem>
                )}
                {!isBrandOrg && !loadingCustomers && customers.length === 0 && (
                  <MenuItem value="" disabled>
                    <Typography variant="body2" color="text.secondary">등록된 고객사가 없습니다</Typography>
                  </MenuItem>
                )}
                {!isBrandOrg && customers.map((customer) => (
                  <MenuItem key={customer.id || customer.name} value={customer.name}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">카테고리</Typography>
              <Select
                name="collection"
                value={formData.collection || ''}
                onChange={handleInputChange}
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled>
                  <Typography variant="body2" color="text.secondary">선택</Typography>
                </MenuItem>
                {loadingCategories && (
                  <MenuItem value="" disabled>
                    <Typography variant="body2" color="text.secondary">불러오는 중...</Typography>
                  </MenuItem>
                )}
                {!loadingCategories && categories.length === 0 && (
                  <MenuItem value="" disabled>
                    <Typography variant="body2" color="text.secondary">등록된 카테고리가 없습니다</Typography>
                  </MenuItem>
                )}
                {categories.map((category) => (
                  <MenuItem key={category.id || category.code || category.name} value={category.name}>
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">스타일명</Typography>
              <TextField
                name="name"
                value={formData.name || ''}
                onChange={handleInputChange}
                sx={{ width: '70%' }}
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">스타일 코드</Typography>
              <TextField
                name="styleCode"
                value={formData.styleCode || ''}
                onChange={handleInputChange}
                placeholder={formData.name || '스타일명과 동일'}
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
                    textField: { sx: { width: '70%' } },
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
                value={styleDetailsData.Fabric}
                onChange={handleDetailsChange}
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled>
                  <Typography variant="body2" color="text.secondary">선택</Typography>
                </MenuItem>
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
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled>
                  <Typography variant="body2" color="text.secondary">선택</Typography>
                </MenuItem>
                {sizeSpecOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Gender</Typography>
              <Select
                name="Gender"
                value={styleDetailsData.Gender}
                onChange={handleDetailsChange}
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled>
                  <Typography variant="body2" color="text.secondary">선택</Typography>
                </MenuItem>
                {GENDER_CODES.map((code) => (
                  <MenuItem key={code} value={code}>
                    {code}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">Colorway</Typography>
              <Select
                name="Colorway"
                value={styleDetailsData.Colorway}
                onChange={handleDetailsChange}
                displayEmpty
                sx={{ width: '70%' }}
              >
                <MenuItem value="" disabled>
                  <Typography variant="body2" color="text.secondary">선택</Typography>
                </MenuItem>
                <MenuItem value="Basic">Basic</MenuItem>
                <MenuItem value="Pastel">Pastel</MenuItem>
                <MenuItem value="Vivid">Vivid</MenuItem>
                <MenuItem value="Dark">Dark</MenuItem>
              </Select>
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
};

export default StyleInfo;
