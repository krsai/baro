import React from 'react';
import dayjs from 'dayjs';
import { useParams } from 'react-router-dom';
import AttendanceBoard from './AttendanceBoard';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeFactoryId = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return String(Math.trunc(parsed));
};

const normalizeWorkDate = (value) => {
  const text = String(value || '').trim();
  return DATE_KEY_PATTERN.test(text) ? text : '';
};

const AttendanceEntry = () => {
  const { factoryId, workDate } = useParams();

  const normalizedFactoryId = normalizeFactoryId(factoryId);
  const normalizedWorkDate = normalizeWorkDate(workDate);
  const effectiveWorkDate = normalizedWorkDate || dayjs().format('YYYY-MM-DD');

  return (
    <AttendanceBoard
      initialFactoryId={normalizedFactoryId}
      initialWorkDate={effectiveWorkDate}
    />
  );
};

export default AttendanceEntry;
