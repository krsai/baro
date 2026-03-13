import React from 'react';
import { Box, Button } from '@mui/material';

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: 'Korean' },
  { code: 'vi', label: 'Vietnamese' },
];

const FLAG_ICON_SX = {
  display: 'block',
  width: 28,
  height: 19,
  borderRadius: 0.5,
};

export const LanguageFlagIcon = ({ code }) => {
  if (code === 'ko') {
    const cx = 14;
    const cy = 9.5;
    const outerRadius = 4.5;
    const innerRadius = 2.25;

    return (
      <Box component="svg" viewBox="0 0 28 19" sx={FLAG_ICON_SX}>
        <rect width="28" height="19" rx="2" fill="#FFFFFF" />
        <g transform={`rotate(-45, ${cx}, ${cy})`}>
          <circle cx={cx} cy={cy} r={outerRadius} fill="#CD2E3A" />
          <path
            d={`M${cx},${cy - outerRadius} A${outerRadius},${outerRadius} 0 0,0 ${cx},${cy + outerRadius} A${innerRadius},${innerRadius} 0 0,0 ${cx},${cy} A${innerRadius},${innerRadius} 0 0,1 ${cx},${cy - outerRadius}Z`}
            fill="#0047A0"
          />
        </g>
        <g transform="translate(5.5,4) rotate(-45,0,0)">
          <rect x="-3" y="-1.4" width="6" height="0.9" fill="#000000" />
          <rect x="-3" y="-0.15" width="6" height="0.9" fill="#000000" />
          <rect x="-3" y="1.1" width="6" height="0.9" fill="#000000" />
        </g>
        <g transform="translate(22.5,15) rotate(-45,0,0)">
          <rect x="-3" y="-1.4" width="2.5" height="0.9" fill="#000000" />
          <rect x="0.5" y="-1.4" width="2.5" height="0.9" fill="#000000" />
          <rect x="-3" y="-0.15" width="2.5" height="0.9" fill="#000000" />
          <rect x="0.5" y="-0.15" width="2.5" height="0.9" fill="#000000" />
          <rect x="-3" y="1.1" width="2.5" height="0.9" fill="#000000" />
          <rect x="0.5" y="1.1" width="2.5" height="0.9" fill="#000000" />
        </g>
        <g transform="translate(22.5,4) rotate(45,0,0)">
          <rect x="-3" y="-1.4" width="2.5" height="0.9" fill="#000000" />
          <rect x="0.5" y="-1.4" width="2.5" height="0.9" fill="#000000" />
          <rect x="-3" y="-0.15" width="6" height="0.9" fill="#000000" />
          <rect x="-3" y="1.1" width="2.5" height="0.9" fill="#000000" />
          <rect x="0.5" y="1.1" width="2.5" height="0.9" fill="#000000" />
        </g>
        <g transform="translate(5.5,15) rotate(45,0,0)">
          <rect x="-3" y="-1.4" width="6" height="0.9" fill="#000000" />
          <rect x="-3" y="-0.15" width="2.5" height="0.9" fill="#000000" />
          <rect x="0.5" y="-0.15" width="2.5" height="0.9" fill="#000000" />
          <rect x="-3" y="1.1" width="6" height="0.9" fill="#000000" />
        </g>
        <rect width="28" height="19" rx="2" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="0.5" />
      </Box>
    );
  }

  if (code === 'en') {
    return (
      <Box component="svg" viewBox="0 0 24 16" sx={FLAG_ICON_SX}>
        <rect width="24" height="16" rx="2" fill="#0A3A8A" />
        <path d="M0 1.5 0 0h2.2L24 13.8V16h-2.2zM24 1.5V0h-2.2L0 13.8V16h2.2z" fill="#FFFFFF" />
        <path d="M0 2.5V0h1.2L24 13.5V16h-1.2zM24 2.5V0h-1.2L0 13.5V16h1.2z" fill="#D81E34" />
        <path d="M10 0h4v16h-4zM0 6h24v4H0z" fill="#FFFFFF" />
        <path d="M10.8 0h2.4v16h-2.4zM0 6.8h24v2.4H0z" fill="#D81E34" />
      </Box>
    );
  }

  return (
    <Box component="svg" viewBox="0 0 24 16" sx={FLAG_ICON_SX}>
      <rect width="24" height="16" rx="2" fill="#DA251D" />
      <path
        d="m12 3.2 1.25 3.55h3.75l-3.05 2.18 1.15 3.65L12 10.4 8.9 12.6l1.15-3.65L7 6.75h3.75L12 3.2z"
        fill="#FFDE00"
      />
    </Box>
  );
};

const defaultSx = {
  minWidth: 'auto',
  p: 0.15,
  minHeight: 'auto',
  borderRadius: 0.75,
  lineHeight: 1,
  textTransform: 'none',
};

export const LanguageSwitcher = ({
  languageCode,
  onChange,
  color = 'inherit',
  sx,
}) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ...sx }}>
    {LANGUAGE_OPTIONS.map((language) => (
      <Button
        key={language.code}
        type="button"
        variant="text"
        color={color}
        aria-label={`${language.label} language`}
        onClick={() => onChange(language.code)}
        sx={{
          ...defaultSx,
          opacity: languageCode === language.code ? 1 : 0.55,
          '&:hover': {
            backgroundColor: 'rgba(25, 118, 210, 0.08)',
            opacity: 1,
          },
        }}
      >
        <LanguageFlagIcon code={language.code} />
      </Button>
    ))}
  </Box>
);

export default LanguageSwitcher;
