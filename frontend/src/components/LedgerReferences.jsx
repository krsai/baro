import React from 'react';
import {Stack,Typography} from '@mui/material';
import {ledgerReferenceRows} from '../utils/ledgerReferences.mjs';
export default function LedgerReferences({row,languageCode='ko'}){
 return <Stack spacing={.25} data-ledger-references>{ledgerReferenceRows(row,languageCode).map(([label,value])=><Typography key={label} variant="caption" sx={{overflowWrap:'anywhere'}}><strong>{label}</strong>: {value}</Typography>)}</Stack>;
}
