const STYLE_GROUP_PASTEL_STYLES = [
  { background: '#eaf4ff', border: '#cfe2ff', accent: '#7ab6ff' },
  { background: '#ffeef3', border: '#ffd6e0', accent: '#ff9eb9' },
  { background: '#edf9f0', border: '#d4eedb', accent: '#8fcea0' },
  { background: '#fff7e6', border: '#f1dfb8', accent: '#dba84a' },
  { background: '#f3efff', border: '#ded5ff', accent: '#a58bf0' },
  { background: '#eefafa', border: '#cfeaea', accent: '#69bebe' },
];
const STYLE_GROUP_PASTEL_FALLBACK = {
  background: '#f7f7f7',
  border: '#ececec',
  accent: '#c6c6c6',
};
export const getStyleGroupPastelStyle = (index) => {
  if (!STYLE_GROUP_PASTEL_STYLES.length) return STYLE_GROUP_PASTEL_FALLBACK;
  const safeIndex = Number.isFinite(index) ? Math.abs(index) : 0;
  return STYLE_GROUP_PASTEL_STYLES[safeIndex % STYLE_GROUP_PASTEL_STYLES.length];
};
