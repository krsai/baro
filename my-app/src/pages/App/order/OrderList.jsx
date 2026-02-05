import React from 'react';
import { Typography, Paper } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';

const OrderList = () => {
  return (
    <AppPageContainer>
      <Typography variant="h5" gutterBottom>
        주문 관리
      </Typography>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography>주문 목록이 여기에 표시됩니다.</Typography>
      </Paper>
    </AppPageContainer>
  );
};

export default OrderList;