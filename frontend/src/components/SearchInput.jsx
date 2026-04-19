import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
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
      }}
      sx={{
        width: { xs: '100%', sm: 360, md: 420 },
        maxWidth: '100%',
        '& .MuiOutlinedInput-root': {
          borderRadius: 2,
          backgroundColor: 'background.paper',
        },
        ...sx,
      }}
      {...props}
    />
  );
};

export default SearchInput;
