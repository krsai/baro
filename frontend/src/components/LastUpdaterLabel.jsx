import React, { useMemo } from 'react';
import { Typography } from '@mui/material';
import useLastUpdaterName from '../hooks/useLastUpdaterName';
import { useLanguage } from '../context/LanguageContext';

const LABEL_BY_LANGUAGE = {
  ko: '최근 업데이트',
  en: 'Last Updated By',
  vi: 'Nguoi cap nhat gan nhat',
};

const LastUpdaterLabel = ({ path = '', sx = {} }) => {
  const { languageCode } = useLanguage();
  const updaterName = useLastUpdaterName(path);
  const label = useMemo(
    () => LABEL_BY_LANGUAGE[languageCode] || LABEL_BY_LANGUAGE.ko,
    [languageCode]
  );

  if (!updaterName) return null;

  return (
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...sx,
      }}
    >
      {`${label}: ${updaterName}`}
    </Typography>
  );
};

export default LastUpdaterLabel;
