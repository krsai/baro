import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HolidayBoard from './holiday/HolidayBoard';

const Holiday = () => {
  return (
    <Routes>
      <Route path="/" element={<HolidayBoard />} />
    </Routes>
  );
};

export default Holiday;
