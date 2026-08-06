import React from 'react';
import { TextField, InputAdornment, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { getUiMessage } from '../constants/uiMessages';

const SearchInput = ({ value, onChange, placeholder, sx, ...props }) => {
  const resolvedPlaceholder = placeholder ?? getUiMessage('common.search', 'Search...');

  return (
    <TextField
      value={value}
      onChange={onChange}
      placeholder={resolvedPlaceholder}
      size="small"
      variant="outlined"
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon color="action" />
          </InputAdornment>
        ),
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton
              size="small"
              aria-label="Clear search"
              onClick={() => onChange?.({ target: { value: '' } })}
              edge="end"
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
      sx={{
        width: { xs: '100%', sm: 300, md: 320 },
        '& .MuiOutlinedInput-root': {
          minHeight: 40,
          borderRadius: 1,
          backgroundColor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          '&:hover': { borderColor: 'text.disabled' },
          '&.Mui-focused': { borderColor: 'primary.main' },
          '& .MuiOutlinedInput-notchedOutline': { border: 0 },
        },
        ...sx,
        maxWidth: { xs: '100%', sm: 320 },
      }}
      {...props}
    />
  );
};

export default SearchInput;
