export const LABEL_PALETTE = {
  blue: { background: '#EAF2FF', text: '#2563EB', border: '#C9DCFF' },
  green: { background: '#E8F7EF', text: '#087A4B', border: '#BFE8D2' },
  yellow: { background: '#FFF6DB', text: '#946200', border: '#F2DFA2' },
  orange: { background: '#FFF1E6', text: '#9A531B', border: '#F2C9A5' },
  purple: { background: '#F3ECFA', text: '#6E438E', border: '#D8C2E8' },
  red: { background: '#FDECEC', text: '#C43232', border: '#F6CACA' },
  gray: { background: '#F0F3F7', text: '#475569', border: '#DCE3EC' },
};

// MUI semantic colors and named tones share one palette, including outlined chips.
export const LABEL_COLOR_TONES = {
  default: 'gray', primary: 'blue', info: 'blue', secondary: 'purple',
  success: 'green', warning: 'yellow', error: 'red',
};

export const getLabelPalette = (color = 'default') =>
  LABEL_PALETTE[LABEL_COLOR_TONES[color] || color] || LABEL_PALETTE.gray;

export const labelChipSx = (color, active = true) => {
  if (!active) {
    return {
      bgcolor: LABEL_PALETTE.gray.background,
      color: 'text.disabled',
      borderColor: 'divider',
      opacity: 1,
    };
  }
  const palette = getLabelPalette(color);
  return {
    bgcolor: palette.background,
    color: palette.text,
    borderColor: palette.border,
    fontWeight: 600,
    '&:hover': { bgcolor: palette.background },
  };
};
