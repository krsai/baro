import React from 'react';
import { TableCell, TableRow } from '@mui/material';

const TableStatusRow = ({ colSpan, message, sx = {} }) => {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        sx={{ textAlign: 'center', color: 'text.secondary', py: 4, ...sx }}
      >
        {message}
      </TableCell>
    </TableRow>
  );
};

export default TableStatusRow;
