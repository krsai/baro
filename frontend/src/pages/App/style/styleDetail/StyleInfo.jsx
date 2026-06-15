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
  IconButton,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  InputAdornment,
} from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import ImageIcon from '@mui/icons-material/Image';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import CloseIcon from '@mui/icons-material/Close';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { GENDER_CODES, SIZE_CODES, getGenderLabel } from '../../../../constants/productAttributes';
import SearchableSelect from '../../../../components/SearchableSelect';
import { useLanguage } from '../../../../context/LanguageContext';
import { getUiMessage } from '../../../../constants/uiMessages';
import { fetchAttributes } from '../../../../utils/attributeApi';
import { requestJSON } from '../../../../utils/apiClient';
import StyleAnalysis from './StyleAnalysis';

const CUSTOMERS_CACHE_TTL_MS = 30 * 1000;
const IMAGE_URL_PROTOCOLS = new Set(['http:', 'https:']);
const FABRIC_OPTIONS = ['Cotton', 'Polyester', 'Linen', 'Denim'];
const COLORWAY_OPTIONS = ['Basic', 'Pastel', 'Vivid', 'Dark'];

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

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Invalid image data.'));
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read image file.'));
    };
    reader.readAsDataURL(file);
  });

const normalizeImageLink = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!IMAGE_URL_PROTOCOLS.has(parsed.protocol)) return '';
    return parsed.toString();
  } catch (_error) {
    return '';
  }
};
const isExternalImageLink = (value) => /^https?:\/\//i.test(String(value || '').trim());

const StyleInfo = ({
  formData = {},
  processes = [],
  showStyleAnalysis = false,
  handleInputChange,
  isBrandOrg = false,
  defaultCustomerName = '',
}) => {
  const { languageCode } = useLanguage();
  const { imageUrls = [] } = formData;
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [imageInputMode, setImageInputMode] = useState('file');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageUrlError, setImageUrlError] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
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
        const data = await fetchAttributes({
          includeColors: false,
          includeCategories: true,
          includeRoles: false,
          includeProcesses: false,
        });
        if (!active) return;
        const normalizedCategories = Array.isArray(data?.categories) ? data.categories : [];
        const seen = new Set();
        const deduped = normalizedCategories.filter((category) => {
          const key = String(category?.displayName || category?.name || category?.code || '')
            .trim()
            .toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setCategories(deduped);
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
  }, [languageCode]);

  useEffect(() => {
    if (imageUrls.length === 0) {
      setMainImageIndex(0);
      return;
    }
    setMainImageIndex((prev) => Math.min(prev, imageUrls.length - 1));
  }, [imageUrls.length]);

  const updateImageUrls = (nextImageUrls) => {
    const normalized = Array.from(
      new Set(
        (Array.isArray(nextImageUrls) ? nextImageUrls : [])
          .map((url) => String(url || '').trim())
          .filter(Boolean)
      )
    );

    handleInputChange({
      target: {
        name: 'imageUrls',
        value: normalized,
      },
    });
  };

  const handleImageChange = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const imageFiles = files.filter((file) => String(file?.type || '').startsWith('image/'));
    if (imageFiles.length === 0) {
      setImageUrlError('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    setUploadingImages(true);
    setImageUrlError('');

    try {
      const encodedImages = (
        await Promise.all(
          imageFiles.map((file) =>
            readFileAsDataUrl(file).catch(() => '')
          )
        )
      ).filter(Boolean);

      if (encodedImages.length === 0) {
        setImageUrlError('이미지 파일을 읽지 못했습니다. 다시 시도해 주세요.');
        return;
      }

      updateImageUrls([...imageUrls, ...encodedImages]);
    } finally {
      setUploadingImages(false);
    }
  };

  const handleImageUrlAdd = () => {
    const normalizedLink = normalizeImageLink(imageUrlInput);
    if (!normalizedLink) {
      setImageUrlError('http:// 또는 https:// 형태의 이미지 링크를 입력해 주세요.');
      return;
    }
    if (imageUrls.includes(normalizedLink)) {
      setImageUrlError('이미 등록된 이미지 링크입니다.');
      return;
    }

    updateImageUrls([...imageUrls, normalizedLink]);
    setImageUrlInput('');
    setImageUrlError('');
  };

  const handleImageUrlKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleImageUrlAdd();
  };

  const handleImageUrlInputChange = (event) => {
    setImageUrlInput(event.target.value);
    if (imageUrlError) {
      setImageUrlError('');
    }
  };
  const handleImageInputModeChange = (_event, value) => {
    if (!value) return;
    setImageInputMode(value);
    if (imageUrlError) {
      setImageUrlError('');
    }
  };

  const handleThumbnailClick = (index) => {
    setMainImageIndex(index);
  };

  const handleImageDelete = (indexToDelete) => {
    if (window.confirm('이 이미지를 삭제하시겠습니까?')) {
      const newImageUrls = imageUrls.filter((_, index) => index !== indexToDelete);
      updateImageUrls(newImageUrls);

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
  const customerOptions = useMemo(() => {
    const baseOptions = isBrandOrg ? [] : customers;
    if (!resolvedCustomerValue) return baseOptions;

    const resolvedOrgId = formData.customerOrgId ? Number(formData.customerOrgId) : null;
    const hasResolvedCustomer = baseOptions.some((customer) => {
      if (String(customer?.name || '').trim() === resolvedCustomerValue) return true;
      if (resolvedOrgId) {
        const optId = Number(customer?.brandOrgId ?? customer?.id);
        return Number.isInteger(optId) && optId > 0 && optId === resolvedOrgId;
      }
      return false;
    });
    if (hasResolvedCustomer) return baseOptions;

    return [
      {
        id: formData.customerOrgId ?? `customer-${resolvedCustomerValue}`,
        name: resolvedCustomerValue,
        brandOrgId: formData.customerOrgId ?? null,
      },
      ...baseOptions,
    ];
  }, [customers, formData.customerOrgId, isBrandOrg, resolvedCustomerValue]);
  const categoryOptions = useMemo(() => {
    const collectionValue = String(formData.collection || '').trim();
    if (!collectionValue) return categories;

    const hasResolvedCategory = categories.some(
      (category) => String(category?.name || '').trim() === collectionValue
    );
    if (hasResolvedCategory) return categories;

    return [
      {
        id: `collection-${collectionValue}`,
        name: collectionValue,
        displayName: collectionValue,
      },
      ...categories,
    ];
  }, [categories, formData.collection]);
  const resolvedCustomerOrgId = formData.customerOrgId ? Number(formData.customerOrgId) : null;
  const selectedCustomer =
    customerOptions.find((customer) => String(customer?.name || '').trim() === resolvedCustomerValue) ||
    (resolvedCustomerOrgId
      ? customerOptions.find((customer) => {
          const optId = Number(customer?.brandOrgId ?? customer?.id);
          return Number.isInteger(optId) && optId > 0 && optId === resolvedCustomerOrgId;
        })
      : null) ||
    null;
  const selectedCategory =
    categoryOptions.find((category) => String(category?.name || '').trim() === String(formData.collection || '').trim()) ||
    null;
  const fieldControlSx = { width: '70%' };
  const selectTextFieldProps = { placeholder: '선택' };

  const emitInputChange = (name, value) => {
    handleInputChange({
      target: {
        name,
        value,
      },
    });
  };

  const handleDetailsChange = (name, value) => {
    setStyleDetailsData((prev) => ({ ...prev, [name]: value || '' }));
  };

  const handleCustomerChange = (_event, nextCustomer) => {
    const nextCustomerName = String(nextCustomer?.name || '').trim();
    if (isBrandOrg) {
      emitInputChange('customer', defaultCustomerName || nextCustomerName || '');
      return;
    }

    const parsedOrgId = Number(nextCustomer?.brandOrgId ?? nextCustomer?.id);
    emitInputChange('customer', nextCustomerName);
    emitInputChange('customerOrgId', Number.isInteger(parsedOrgId) && parsedOrgId > 0 ? parsedOrgId : null);
  };

  const handleCollectionChange = (_event, nextCategory) => {
    emitInputChange('collection', String(nextCategory?.name || '').trim());
  };

  const sectionWidth = { xs: '100%', lg: '50%' };

  return (
    <Box>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} alignItems="stretch">
        <Paper sx={{ p: 2, width: sectionWidth, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6">스타일 사진</Typography>
            <Chip
              size="small"
              label={`${imageUrls.length}장`}
              sx={{ fontWeight: 600 }}
            />
          </Stack>
          <Stack spacing={2} alignItems="center" sx={{ mt: 2.5, flex: 1 }}>
            <Box
              sx={{
                width: '100%',
                flex: 1,
                minHeight: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                  imageUrls.length > 0
                    ? 'linear-gradient(180deg, #fafafa 0%, #f4f6f8 100%)'
                    : 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                border: '2px dashed',
                borderColor: imageUrls.length > 0 ? 'grey.400' : 'grey.300',
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
                  <ImageIcon sx={{ fontSize: 56 }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    사진을 업로드해 주세요
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    파일 업로드 또는 이미지 링크 추가
                  </Typography>
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
                        border: mainImageIndex === index ? '2px solid' : '1px solid',
                        borderColor: mainImageIndex === index ? 'primary.main' : 'grey.300',
                        borderRadius: 1,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: mainImageIndex === index ? 2 : 0,
                        transition: 'all 0.2s',
                      }}
                    >
                      <CardMedia
                        component="img"
                        image={url}
                        alt={`Thumbnail ${index + 1}`}
                        sx={{ objectFit: 'cover', width: '100%', height: '100%' }}
                      />
                      {isExternalImageLink(url) ? (
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 4,
                            bottom: 4,
                            borderRadius: 1,
                            px: 0.5,
                            py: 0.125,
                            bgcolor: 'rgba(0, 0, 0, 0.55)',
                            color: '#fff',
                            lineHeight: 1,
                          }}
                        >
                          <LinkRoundedIcon sx={{ fontSize: 12 }} />
                        </Box>
                      ) : null}
                    </Box>
                    {mainImageIndex === index ? (
                      <Chip
                        size="small"
                        label="대표"
                        color="primary"
                        sx={{
                          position: 'absolute',
                          left: -4,
                          top: -8,
                          height: 18,
                          '& .MuiChip-label': { px: 0.75, fontSize: 10, fontWeight: 700 },
                        }}
                      />
                    ) : null}
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
                        backgroundColor: 'rgba(255, 255, 255, 0.96)',
                        border: '1px solid',
                        borderColor: 'divider',
                        opacity: mainImageIndex === index ? 1 : 0,
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
            <Paper
              variant="outlined"
              sx={{
                width: '100%',
                p: 1.5,
                borderRadius: 2,
                bgcolor: 'grey.50',
                borderColor: 'grey.300',
              }}
            >
              <Stack spacing={1.25}>
                <ToggleButtonGroup
                  color="primary"
                  size="small"
                  exclusive
                  value={imageInputMode}
                  onChange={handleImageInputModeChange}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  <ToggleButton value="file">
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <CloudUploadRoundedIcon sx={{ fontSize: 16 }} />
                      <span>파일 업로드</span>
                    </Stack>
                  </ToggleButton>
                  <ToggleButton value="url">
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <LinkRoundedIcon sx={{ fontSize: 16 }} />
                      <span>링크 추가</span>
                    </Stack>
                  </ToggleButton>
                </ToggleButtonGroup>
                {imageInputMode === 'file' ? (
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ width: '100%', alignItems: { xs: 'stretch', sm: 'center' } }}
                  >
                    <label htmlFor="raised-button-file">
                      <Button
                        variant="contained"
                        component="span"
                        startIcon={<PhotoCamera />}
                        disabled={uploadingImages}
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        사진 올리기
                      </Button>
                    </label>
                    <Typography variant="caption" color="text.secondary">
                      JPG/PNG/WebP 권장, 여러 장 선택 가능
                    </Typography>
                  </Stack>
                ) : (
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ width: '100%', alignItems: 'flex-start' }}
                  >
                    <TextField
                      fullWidth
                      size="small"
                      label="이미지 링크(URL)"
                      value={imageUrlInput}
                      onChange={handleImageUrlInputChange}
                      onKeyDown={handleImageUrlKeyDown}
                      placeholder="https://example.com/style-image.jpg"
                      error={Boolean(imageUrlError)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LinkRoundedIcon fontSize="small" />
                          </InputAdornment>
                        ),
                      }}
                    />
                    <Button
                      variant="outlined"
                      onClick={handleImageUrlAdd}
                      sx={{ whiteSpace: 'nowrap' }}
                      disabled={uploadingImages}
                    >
                      링크 추가
                    </Button>
                  </Stack>
                )}
                {imageUrlError ? (
                  <Typography variant="caption" color="error.main">
                    {imageUrlError}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {imageInputMode === 'file'
                      ? '업로드 후 썸네일에서 대표 이미지를 선택할 수 있습니다.'
                      : 'http:// 또는 https:// 링크만 추가됩니다.'}
                  </Typography>
                )}
              </Stack>
            </Paper>
            {uploadingImages ? (
              <Typography variant="caption" color="text.secondary">
                이미지 파일을 처리하는 중입니다...
              </Typography>
            ) : null}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, width: sectionWidth }}>
          <Typography variant="h6" gutterBottom>스타일 정보</Typography>
          <Stack spacing={2} mt={2.5}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">고객사</Typography>
              <SearchableSelect
                size="small"
                options={customerOptions}
                value={selectedCustomer}
                onChange={handleCustomerChange}
                disabled={isBrandOrg}
                loading={loadingCustomers}
                loadingText="불러오는 중..."
                noOptionsText="등록된 고객사가 없습니다"
                getOptionLabel={(option) => option?.name || ''}
                isOptionEqualToValue={(option, value) =>
                  String(option?.id || '') === String(value?.id || '') ||
                  String(option?.name || '').trim() === String(value?.name || '').trim()
                }
                sx={fieldControlSx}
                textFieldProps={selectTextFieldProps}
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">카테고리</Typography>
              <SearchableSelect
                size="small"
                options={categoryOptions}
                value={selectedCategory}
                onChange={handleCollectionChange}
                loading={loadingCategories}
                loadingText="불러오는 중..."
                noOptionsText="등록된 카테고리가 없습니다"
                getOptionLabel={(option) => option?.displayName || option?.name || ''}
                isOptionEqualToValue={(option, value) =>
                  String(option?.id || option?.code || option?.name || '').trim() ===
                  String(value?.id || value?.code || value?.name || '').trim()
                }
                sx={fieldControlSx}
                textFieldProps={selectTextFieldProps}
              />
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

          <Typography variant="h6" gutterBottom>{getUiMessage('styleInfo.detailsSection', '세부 정보', languageCode)}</Typography>
          <Stack spacing={2} mt={2.5}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">{getUiMessage('styleInfo.fabric', 'Fabric', languageCode)}</Typography>
              <SearchableSelect
                size="small"
                options={FABRIC_OPTIONS}
                value={styleDetailsData.Fabric || null}
                onChange={(_event, value) => handleDetailsChange('Fabric', value)}
                getOptionLabel={(option) => option || ''}
                sx={fieldControlSx}
                textFieldProps={selectTextFieldProps}
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">{getUiMessage('styleInfo.sizeSpec', 'Size Spec', languageCode)}</Typography>
              <SearchableSelect
                size="small"
                options={sizeSpecOptions}
                value={styleDetailsData['Size Spec'] || null}
                onChange={(_event, value) => handleDetailsChange('Size Spec', value)}
                getOptionLabel={(option) => option || ''}
                sx={fieldControlSx}
                textFieldProps={selectTextFieldProps}
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">{getUiMessage('styleInfo.gender', 'Gender', languageCode)}</Typography>
              <SearchableSelect
                size="small"
                options={GENDER_CODES}
                value={styleDetailsData.Gender || null}
                onChange={(_event, value) => handleDetailsChange('Gender', value)}
                getOptionLabel={(option) => getGenderLabel(option, option, languageCode)}
                sx={fieldControlSx}
                textFieldProps={selectTextFieldProps}
              />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">{getUiMessage('styleInfo.colorway', 'Colorway', languageCode)}</Typography>
              <SearchableSelect
                size="small"
                options={COLORWAY_OPTIONS}
                value={styleDetailsData.Colorway || null}
                onChange={(_event, value) => handleDetailsChange('Colorway', value)}
                getOptionLabel={(option) => option || ''}
                sx={fieldControlSx}
                textFieldProps={selectTextFieldProps}
              />
            </Box>
          </Stack>
          {showStyleAnalysis ? (
            <>
              <Divider sx={{ my: 4 }} />
              <StyleAnalysis processes={processes} />
            </>
          ) : null}
        </Paper>
      </Stack>
    </Box>
  );
};

export default StyleInfo;
