import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

const SearchInput = ({ value, onChange, placeholder = "검색...", sx, ...props }) => {
  return (
    <TextField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      size="small"
      variant="outlined"
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon color="action" />
          </InputAdornment>
        ),
      }}
      sx={{ width: '400px', ...sx }}
      {...props}
    />
  );
};

export default SearchInput;