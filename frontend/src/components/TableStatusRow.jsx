import React from 'react';
import { Button, Stack, TableCell, TableRow } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { QUERY_TEXT } from './QueryFeedback';

const TableStatusRow = ({ colSpan, message, state, onRetry, sx = {} }) => {
  const { languageCode } = useLanguage();
  const text = QUERY_TEXT[languageCode] || QUERY_TEXT.en;
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        sx={{ textAlign: 'center', color: state === 'error' ? 'error.main' : 'text.secondary', py: 4, ...sx }}
      >
        <Stack role={state === 'error' ? 'alert' : 'status'} spacing={1} alignItems="center">
          <span>{state ? text[state] || message : message}</span>
          {state === 'error' && onRetry && <Button size="small" onClick={onRetry}>{text.retry}</Button>}
        </Stack>
      </TableCell>
    </TableRow>
  );
};

export default TableStatusRow;
