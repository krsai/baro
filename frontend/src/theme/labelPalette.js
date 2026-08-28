export const LABEL_PALETTE = {
  blue: { background: '#E8F2FF', text: '#245B8A', border: '#B8D5F2' },
  green: { background: '#EAF6EC', text: '#2F6B3C', border: '#B9DDBF' },
  orange: { background: '#FFF1E6', text: '#9A531B', border: '#F2C9A5' },
  purple: { background: '#F3ECFA', text: '#6E438E', border: '#D8C2E8' },
  red: { background: '#FCEBEC', text: '#91434A', border: '#E8BEC2' },
};

export const labelChipSx = (color, active = true) => {
  if (!active) {
    return {
      bgcolor: '#F5F6F8',
      color: 'text.disabled',
      borderColor: 'divider',
      opacity: 1,
    };
  }
  const palette = LABEL_PALETTE[color] || LABEL_PALETTE.blue;
  return {
    bgcolor: palette.background,
    color: palette.text,
    borderColor: palette.border,
    fontWeight: 700,
    '&:hover': { bgcolor: palette.background },
  };
};
