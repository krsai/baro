// Shared visual contract for lists, forms, navigation and dashboards.
// Keep page-specific business/status colors in labelPalette.js.
const BODY_FONT_SIZE = '0.8125rem';
export const ui = {
  color: { primary: '#2878f0', text: '#101828', heading: '#344054', muted: '#667085', border: '#e7ecf2', canvas: '#f7f9fc', surface: '#ffffff', header: '#f8fafc', hover: '#f3f7ff' },
  typography: { bodyFontSize: BODY_FONT_SIZE, captionFontSize: '0.75rem', titleFontSize: '1.25rem', titleFontWeight: 600, titleLetterSpacing: '-0.02em', totalFontSize: '1.25rem' },
  control: { height: 36, iconSmallHeight: 28, iconLargeHeight: 40, fontSize: BODY_FONT_SIZE, lineHeight: '20px', inputPadding: '8px 12px', shiftHeight: 17, shiftGap: 2, dateNavigationWidth: 20, dateNavigationIconSize: 16 },
  radius: { control: 8, panel: 12 },
  layout: { pagePadding: { xs: '16px', sm: '24px' }, pageGap: '20px', sectionGap: '20px', headerGap: '16px', actionGap: '8px', panelPadding: '16px' },
  table: { cellPadding: '11px 16px', compactPadding: '8px 12px', fontSize: BODY_FONT_SIZE },
  dialog: { titlePadding: '20px 24px 16px', contentPadding: '24px', actionsPadding: '16px 24px', actionsGap: 8 },
  shadow: '0 2px 6px rgba(16, 24, 40, 0.025)',
};
