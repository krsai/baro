import {ui} from './ui';
import {getLabelPalette} from './labelPalette';

// Lists fit their viewport before scrolling. Dense matrices and printed
// documents opt out explicitly; editable grids retain their field widths.
const readable='&:not([data-table-layout="wide"]):not([data-table-layout="document"]):not(:has(input:not([type="checkbox"]):not([type="radio"]),textarea,[role="combobox"],[contenteditable="true"]))';
const actionContent=':is([data-table-actions],:has([data-table-action]),:has(> button),:has(> .MuiStack-root > button))';
const actions=`:last-child${actionContent}`;
// :has() cannot be nested, including through :is(). Keep this table-level
// condition flat so browsers apply the action header's sticky/layer rules.
const hasActions='&:has(> tbody > tr:not([data-table-status]) > td:last-child[data-table-actions], > tbody > tr:not([data-table-status]) > td:last-child [data-table-action], > tbody > tr:not([data-table-status]) > td:last-child > button, > tbody > tr:not([data-table-status]) > td:last-child > .MuiStack-root > button)';
export const responsiveTableStyles={
 [readable]:{
  width:'100%',
  '&:not([data-table-layout="fixed"])':{minWidth:'var(--table-readable-min-width, 0px) !important',tableLayout:'auto !important'},
  '&:not([data-table-layout="fixed"]):not([data-table-layout="columns"]) > colgroup > col':{width:'auto !important'},
  '&:not([data-table-layout="fixed"]):not([data-table-layout="columns"]) > :is(thead,tbody) > tr > :is(th,td)':{width:'auto !important',minWidth:0},
  '& > thead > tr > th':{whiteSpace:'normal',overflowWrap:'anywhere'},
  '& > tbody > tr:not([data-table-status]) > td':{overflowWrap:'anywhere'},
  '& > tbody > tr:not([data-table-status]) > td[align="right"]':{whiteSpace:'nowrap'},
  '& > thead > tr > th,& > tbody > tr:not([data-table-status]) > td':{paddingInline:ui.table.fitHorizontalPadding},
 },
 [`& > tbody > tr:not([data-table-status]) > td${actions}`]:{position:'sticky',right:0,zIndex:2,backgroundColor:`var(--table-row-background, ${ui.color.surface})`,whiteSpace:'nowrap'},
 [`& > tbody > tr:not([data-table-status]).MuiTableRow-hover:hover > td${actions}`]:{backgroundColor:ui.color.hover},
 [`& > tbody > tr:not([data-table-status]).Mui-selected > td${actions}, & > tbody > tr:not([data-table-status]).Mui-selected.MuiTableRow-hover:hover > td${actions}`]:{backgroundColor:getLabelPalette('blue').background},
 [`${hasActions} > thead > tr:first-of-type > th:last-child`]:{position:'sticky',right:0,zIndex:3,backgroundColor:ui.color.header},
 '&.MuiTable-stickyHeader > thead > tr > th':{zIndex:3},
 [`${hasActions}.MuiTable-stickyHeader > thead > tr:first-of-type > th:last-child`]:{zIndex:4},
};
