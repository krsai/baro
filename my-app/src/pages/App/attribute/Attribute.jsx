import React from 'react';
import AppPageContainer from '../../../components/AppPageContainer';
import { Typography } from '@mui/material';

const Attribute = () => {
  return (
    <AppPageContainer>
      <Typography variant="h4" gutterBottom>
        속성관리
      </Typography>
      <Typography>
        이곳에서 속성을 관리합니다.
      </Typography>
    </AppPageContainer>
  );
};

export default Attribute;
