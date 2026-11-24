// Shared visual contract for lists, forms, navigation and dashboards.
// Keep page-specific business/status colors in labelPalette.js.
const BODY_FONT_SIZE = '0.8125rem';
export const standardUi = {
  color: { primary: '#2878f0', text: '#101828', heading: '#344054', muted: '#667085', border: '#e7ecf2', canvas: '#f7f9fc', surface: '#ffffff', header: '#f8fafc', hover: '#f3f7ff' },
  typography: { bodyFontSize: BODY_FONT_SIZE, captionFontSize: '0.75rem', titleFontSize: '1.25rem', titleFontWeight: 600, titleLetterSpacing: '-0.02em', totalFontSize: '1.25rem' },
  control: { height: 36, iconSmallHeight: 28, iconLargeHeight: 40, fontSize: BODY_FONT_SIZE, lineHeight: '20px', inputPadding: '8px 12px', shiftHeight: 17, shiftGap: 2, dateNavigationWidth: 20, dateNavigationIconSize: 16 },
  radius: { control: 8, panel: 12 },
  layout: { pageHeaderZIndex: 10, pagePadding: { xs: '16px', sm: '24px' }, pageGap: '20px', sectionGap: '20px', headerGap: '16px', actionGap: '8px', panelPadding: '16px' },
  search: { inputWidth: 400, filterWidth: 144, gap: '8px', padding: '16px', headerHeight: 44 },
  table: { cellPadding: '11px 16px', compactPadding: '8px 12px', fitHorizontalPadding: '8px', fontSize: BODY_FONT_SIZE, statusHeight:84 },
  dialog: { titlePadding: '20px 24px 12px', contentPadding: '16px 24px 24px', actionsPadding: '16px 24px 20px', actionsGap: 8, lookupWidth: 800, lookupDetailsWidth: 1120, lookupHeight: 640, paneMaxHeight:360 },
  shadow: '0 2px 6px rgba(16, 24, 40, 0.025)',
};

export const compactUi = {...standardUi,
 color:{...standardUi.color,primary:'#1769aa',text:'#243447',heading:'#243447',muted:'#526579',border:'#cbd5df',canvas:'#eaf0f5',header:'#e2eaf1',hover:'#edf4fb'},
 shadow:'none',
 typography:{...standardUi.typography,titleFontSize:'1.0625rem',titleLetterSpacing:'0'},
 radius:{control:2,panel:2},
 control:{...standardUi.control,height:32,iconSmallHeight:26,iconLargeHeight:36,inputPadding:'6px 10px'},
 layout:{...standardUi.layout,pagePadding:{xs:'12px',sm:'16px'},pageGap:'12px',sectionGap:'12px',headerGap:'12px',panelPadding:'12px'},
 table:{...standardUi.table,cellPadding:'7px 12px',compactPadding:'5px 10px'},
 search:{...standardUi.search,padding:'12px',headerHeight:36},
 dialog:{...standardUi.dialog,titlePadding:'14px 20px 10px',contentPadding:'12px 20px 20px',actionsPadding:'12px 20px 14px'},
};
// CSS variables let existing common layout components react without remounting.
export const ui={...standardUi,layout:{...standardUi.layout,
 pagePadding:{xs:'var(--ui-page-padding-xs, 16px)',sm:'var(--ui-page-padding-sm, 24px)'},
 pageGap:'var(--ui-page-gap, 20px)',sectionGap:'var(--ui-section-gap, 20px)',headerGap:'var(--ui-header-gap, 16px)',panelPadding:'var(--ui-panel-padding, 16px)'
},search:{...standardUi.search,padding:'var(--ui-search-padding, 16px)',headerHeight:'var(--ui-search-header-height, 44px)'}};
