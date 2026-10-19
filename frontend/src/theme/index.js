import { ui } from './ui';
import { getLabelPalette, LABEL_PALETTE } from './labelPalette';
import { createTheme } from '@mui/material/styles';
import { createAutocompleteFilterOptions } from '../utils/autocompleteSearch';

const baseTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0066cc',
    },
    secondary: {
      main: '#555',
    },
    background: {
      default: '#F5F6F8',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#212121', // Darker for better contrast
      secondary: '#616161', // Softer grey
    },
    divider: '#E0E0E0',
  },
  shape: {
    borderRadius: 6, // Rounded corners for a modern look
  },
  typography: {
    fontFamily: '"Noto Sans KR", "Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14, // Slightly larger base font size for readability
    h1: { fontSize: '2.5rem', fontWeight: 700 },
    h2: { fontSize: '2rem', fontWeight: 600 },
    h3: { fontSize: '1.75rem', fontWeight: 600 },
    h4: { fontSize: '1.5rem', fontWeight: 600 },
    h5: { fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.4 },
    h6: { fontSize: '1.1rem', fontWeight: 600 },
    body1: { fontSize: '1rem' },
    body2: { fontSize: '0.875rem' },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  spacing: 8, // Standard spacing unit
  transitions: {
    // Re-enable transitions for a smoother feel
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    duration: {
      enteringScreen: 225,
      leavingScreen: 195,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          elevation: 0,
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          elevation: 0,
          borderBottom: '1px solid #E0E0E0',
          backgroundColor: '#FFFFFF',
        },
      },
      defaultProps: {
        elevation: 0,
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid #E0E0E0',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          padding: '6px 16px', // More generous padding
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '12px 16px', // Better padding
          borderBottom: '1px solid #E0E0E0',
        },
        head: {
          fontWeight: 600,
          backgroundColor: '#F5F6F8',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          padding: '8px',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 6, // Use global radius
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
           // borderRadius will be inherited from shape
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
        },
      },
    },
    MuiPickersInputBase: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          lineHeight: 1.4375,
          fontFamily: 'inherit',
          fontWeight: 400,
        },
        input: {
          fontSize: '0.8125rem',
          lineHeight: 1.4375,
          fontFamily: 'inherit',
          fontWeight: 400,
        },
        sectionContent: {
          fontSize: '0.8125rem',
          lineHeight: 1.4375,
          fontFamily: 'inherit',
          fontWeight: 400,
        },
      },
    },
    MuiPickersSectionList: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          lineHeight: 1.4375,
          fontFamily: 'inherit',
          fontWeight: 400,
        },
        sectionContent: {
          fontSize: '0.8125rem',
          lineHeight: 1.4375,
          fontFamily: 'inherit',
          fontWeight: 400,
        },
      },
    },
    MuiAutocomplete: {
      defaultProps: {
        filterOptions: createAutocompleteFilterOptions(),
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiFormControl: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiSelect: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiDateField: {
      defaultProps: {
        format: 'YYYY-MM-DD',
      },
    },
    MuiPickersTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiPickersOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#F5F6F8',
          '& .MuiPickersOutlinedInput-notchedOutline': {
            border: 'none',
          },
          '&:hover': {
            backgroundColor: '#EBEDF0',
          },
          '&.Mui-focused': {
            backgroundColor: '#E0E2E5',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#F5F6F8',
          '& .MuiOutlinedInput-notchedOutline': {
            border: 'none',
          },
          '&:hover': {
            backgroundColor: '#EBEDF0',
          },
          '&.Mui-focused': {
            backgroundColor: '#E0E2E5',
          },
        },
      },
    },
    MuiInput: {
      styleOverrides: {
        root: {
          '&:before': {
            borderBottom: '1px solid rgba(0, 0, 0, 0.42)',
          },
          '&:hover:not(.Mui-disabled):before': {
            borderBottom: '1px solid rgba(0, 0, 0, 0.87)',
          },
          '&.Mui-focused:after': {
            borderBottom: `2px solid #0066cc`,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 'unset',
          paddingLeft: '4px', // Add 4px left padding to the entire tab container
          paddingTop: '4px', // Add 4px top padding to the entire tab container
        },
        indicator: {
          display: 'none',
        },
        flexContainer: {
          // Gap will be managed by Tab's marginRight
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          minWidth: 'unset',
          minHeight: 38,
          padding: '4px 12px 6px 12px',
          marginRight: '4px',
          borderRadius: '8px 8px 0 0',
          color: 'rgba(0, 0, 0, 0.85)',
          backgroundColor: '#f0f0f0',
          border: '1px solid #e8e8e8',
          borderBottom: 'none',
          '&:hover': {
            backgroundColor: '#e6e6e6',
          },
          '&.Mui-selected': {
            color: '#0066cc', // Use primary color for selected tab
            backgroundColor: '#fff',
            border: '1px solid #e8e8e8',
            borderBottomColor: '#fff',
          },
          transition: 'all 0.2s ease-in-out',
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: {
          backgroundColor: '#f4f4f5',
          padding: '4px',
          borderRadius: '8px',
        },
        grouped: {
          border: 0,
          '&.Mui-disabled': {
            border: 0,
          },
          '&:not(:first-of-type)': {
            borderRadius: '6px',
            borderLeft: 'none',
            marginLeft: '4px',
          },
          '&:first-of-type': {
            borderRadius: '6px',
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none',
          color: theme.palette.text.secondary,
          fontWeight: 600,
          padding: '6px 24px',
          minWidth: 100,
          border: 'none',
          borderRadius: '6px',
          '&.Mui-selected': {
            backgroundColor: '#FFFFFF',
            color: theme.palette.primary.main,
            boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.12)',
            '&:hover': {
              backgroundColor: '#FFFFFF',
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
        }),
      },
    },
  },
});

// Global component defaults: every business list inherits the same design.
const inputSurface = {
  backgroundColor: ui.color.surface,
  borderRadius: ui.radius.control,
  '&:hover': { backgroundColor: ui.color.surface },
  '&.Mui-focused': { backgroundColor: ui.color.surface },
};
// Tone only: retain the pickers' dimensions, circular days and navigation layout.
const calendarChoice = {
  color: ui.color.text,
  '&:hover': { backgroundColor: getLabelPalette('blue').background },
  '&.Mui-focusVisible': { backgroundColor: getLabelPalette('blue').background },
  '&.Mui-selected': {
    backgroundColor: getLabelPalette('blue').background,
    color: getLabelPalette('blue').text,
    '&:hover, &:focus': { backgroundColor: getLabelPalette('blue').border },
  },
  '&.Mui-disabled': { color: baseTheme.palette.text.disabled },
};
const theme = createTheme(baseTheme, {
  palette: {
    primary: { main: ui.color.primary },
    secondary: { main: '#475569' },
    background: { default: ui.color.canvas, paper: ui.color.surface },
    text: { primary: ui.color.text, secondary: ui.color.muted },
    divider: ui.color.border,
  },
  shape: { borderRadius: ui.radius.control },
  typography: {
    body1: { fontSize: ui.typography.bodyFontSize, lineHeight: 1.5 },
    body2: { fontSize: ui.typography.bodyFontSize, lineHeight: 1.5 },
    caption: { fontSize: ui.typography.captionFontSize },
    h5: { fontSize: ui.typography.titleFontSize, fontWeight: ui.typography.titleFontWeight, letterSpacing: ui.typography.titleLetterSpacing },
    h6: { fontSize: '1rem', fontWeight: 650, letterSpacing: '-0.02em' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: {
      ':root': {
        ...Object.fromEntries(Object.entries(LABEL_PALETTE).flatMap(([tone, colors]) =>
          Object.entries(colors).map(([role, value]) => [`--label-${tone}-${role}`, value]))),
        '--color-text-muted': ui.color.muted,
        '--color-surface': ui.color.surface,
        '--ui-panel-radius': `${ui.radius.panel}px`,
        '--ui-control-radius': `${ui.radius.control}px`,
        '--ui-control-height': `${ui.control.height}px`,
        '--ui-body-font-size': ui.typography.bodyFontSize,
        '--ui-caption-font-size': ui.typography.captionFontSize,
        '--ui-title-font-size': ui.typography.titleFontSize,
        '--ui-total-font-size': ui.typography.totalFontSize,
        '--ui-control-font-size': ui.control.fontSize,
        '--ui-control-line-height': ui.control.lineHeight,
        '--ui-table-font-size': ui.table.fontSize,
        '--ui-table-padding': ui.table.cellPadding,
        '--ui-table-compact-padding': ui.table.compactPadding,
        '--color-primary': ui.color.primary,
        '--color-text-dark': ui.color.text,
        '--color-background-light': ui.color.canvas,
        '--color-background-dark': ui.color.header,
        '--color-border': ui.color.border,
        '--color-table-hover': ui.color.hover,
      },
      body: { WebkitFontSmoothing: 'antialiased' },
      '*': { scrollbarWidth: 'thin', scrollbarColor: '#cdd5df transparent' },
      '*:focus-visible': { outline: '2px solid #2878f0', outlineOffset: 3 },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
      },
    } },
    MuiChip: { styleOverrides: {
      root: ({ ownerState, theme }) => {
        const palette = getLabelPalette(ownerState.color);
        return {
          backgroundColor: palette.background,
          color: palette.text,
          borderColor: palette.border,
          borderRadius: 999,
          fontWeight: 600,
          fontSize: '0.75rem',
          '&:hover': { backgroundColor: palette.background },
          '&.MuiChip-clickable:hover, &.Mui-focusVisible': {
            backgroundColor: palette.background,
            boxShadow: `inset 0 0 0 1px ${palette.border}`,
          },
          '& .MuiChip-icon': { color: 'inherit' },
          '& .MuiChip-deleteIcon': { color: palette.text, opacity: 0.65, '&:hover': { color: palette.text, opacity: 1 } },
          '&.Mui-disabled': { backgroundColor: getLabelPalette('default').background, color: theme.palette.text.disabled, opacity: 0.6 },
        };
      },
      sizeSmall: { height: 22 },
      labelSmall: { paddingLeft: 9, paddingRight: 9 },
    } },
    MuiPaper: { styleOverrides: { outlined: { borderColor: ui.color.border } } },
    MuiAppBar: { styleOverrides: { root: { boxShadow: 'none', borderColor: ui.color.border } } },
    MuiDrawer: { styleOverrides: { paper: { borderColor: ui.color.border } } },
    MuiCard: { styleOverrides: { root: { border: '1px solid ' + ui.color.border, borderRadius: ui.radius.panel, boxShadow: ui.shadow } } },
    MuiButton: { styleOverrides: {
      root: { borderRadius: ui.radius.control, height: ui.control.height, minHeight: ui.control.height, padding: '0 15px', fontSize: ui.control.fontSize, lineHeight: ui.control.lineHeight },
      outlined: { borderColor: '#dfe5ed' },
    } },
    MuiIconButton: { styleOverrides: {
      sizeSmall: { width: ui.control.iconSmallHeight, height: ui.control.iconSmallHeight, padding: 4 },
      sizeMedium: { width: ui.control.height, height: ui.control.height, padding: 6 },
      sizeLarge: { width: ui.control.iconLargeHeight, height: ui.control.iconLargeHeight, padding: 8 },
    } },
    MuiTableContainer: { styleOverrides: { root: { backgroundColor: ui.color.surface, borderRadius: ui.radius.control } } },
    MuiTableCell: { styleOverrides: {
      root: { padding: ui.table.cellPadding, borderBottom: '1px solid ' + ui.color.border, fontSize: ui.table.fontSize, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' },
      sizeSmall: { padding: ui.table.compactPadding },
      head: { backgroundColor: ui.color.header, color: ui.color.muted, fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' },
      stickyHeader: { backgroundColor: ui.color.header },
    } },
    MuiTableRow: { styleOverrides: { root: { '&.MuiTableRow-hover:hover': { backgroundColor: ui.color.hover } } } },
    MuiTablePagination: { styleOverrides: { root: { color: ui.color.muted }, toolbar: { minHeight: 52 } } },
    MuiOutlinedInput: { styleOverrides: { root: {
      ...inputSurface,
      minHeight: ui.control.height,
      '&:not(.MuiInputBase-multiline):not(.MuiAutocomplete-inputRoot)': { height: ui.control.height },
      '& .MuiOutlinedInput-notchedOutline': { border: '1px solid #dfe5ed' },
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '2px solid ' + ui.color.primary },
      '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: baseTheme.palette.error.main },
      '&.Mui-disabled': { backgroundColor: ui.color.header },
    }, input: { fontSize: ui.control.fontSize, lineHeight: ui.control.lineHeight, padding: ui.control.inputPadding, '&.MuiInputBase-inputMultiline': { padding: 0 } },
    } },
    MuiInputLabel: { styleOverrides: { root: { fontSize: ui.control.fontSize, lineHeight: ui.control.lineHeight } } },
    MuiInputBase: { styleOverrides: { root: { fontSize: ui.control.fontSize, lineHeight: ui.control.lineHeight } } },
    MuiMenu: { styleOverrides: { paper: { border: `1px solid ${ui.color.border}`, boxShadow: '0 8px 24px rgba(16, 24, 40, 0.08)' } } },
    MuiMenuItem: { styleOverrides: { root: {
      fontSize: ui.control.fontSize,
      '&.Mui-selected': { backgroundColor: getLabelPalette('blue').background, color: getLabelPalette('blue').text },
      '&.Mui-selected:hover': { backgroundColor: getLabelPalette('blue').border },
    } } },
    MuiAutocomplete: { styleOverrides: {
      inputRoot: {
        '&.MuiOutlinedInput-root': { height: 'auto', minHeight: ui.control.height, padding: '2px 8px' },
        '& .MuiAutocomplete-input': { padding: '6px 4px', lineHeight: ui.control.lineHeight },
      },
    } },
    MuiPickersOutlinedInput: { styleOverrides: { root: {
      ...inputSurface,
      height: ui.control.height,
      color: ui.color.text,
      '& .MuiIconButton-root': { color: ui.color.muted, '&:hover': { backgroundColor: getLabelPalette('blue').background } },
      '& .MuiPickersOutlinedInput-notchedOutline': { border: '1px solid #dfe5ed' },
      '&.Mui-focused .MuiPickersOutlinedInput-notchedOutline': { border: '2px solid ' + ui.color.primary },
      '&.Mui-error .MuiPickersOutlinedInput-notchedOutline': { borderColor: baseTheme.palette.error.main },
      '&.Mui-disabled': { backgroundColor: ui.color.header },
    } } },
    MuiPickersInputBase: { styleOverrides: { root: { fontSize: ui.control.fontSize, lineHeight: ui.control.lineHeight } } },
    MuiPickersSectionList: { styleOverrides: { root: { padding: '8px 0', fontSize: ui.control.fontSize, lineHeight: ui.control.lineHeight } } },
    MuiPickerPopper: { styleOverrides: { paper: {
      backgroundColor: ui.color.surface,
      backgroundImage: 'none',
      border: `1px solid ${ui.color.border}`,
      boxShadow: '0 8px 24px rgba(16, 24, 40, 0.08)',
    } } },
    MuiPickersLayout: { styleOverrides: { root: { backgroundColor: ui.color.surface, color: ui.color.text } } },
    MuiPickersCalendarHeader: { styleOverrides: {
      label: { color: ui.color.text },
      switchViewButton: { color: ui.color.muted },
    } },
    MuiPickersArrowSwitcher: { styleOverrides: { button: { color: ui.color.muted } } },
    MuiDayCalendar: { styleOverrides: { weekDayLabel: { color: ui.color.muted } } },
    MuiPickersDay: { styleOverrides: { root: {
      ...calendarChoice,
      '&.MuiPickersDay-today:not(.Mui-selected)': { borderColor: getLabelPalette('blue').border, color: getLabelPalette('blue').text },
    } } },
    MuiMonthCalendar: { styleOverrides: { button: calendarChoice } },
    MuiYearCalendar: { styleOverrides: { button: calendarChoice } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: ui.radius.panel, maxHeight: 'calc(100dvh - 48px)' } } },
    MuiDialogTitle: { styleOverrides: { root: { padding: ui.dialog.titlePadding, borderBottom: `1px solid ${ui.color.border}`, '& + .MuiDialogContent-dividers': { borderTop: 0 } } } },
    MuiDialogContent: { styleOverrides: { root: { padding: ui.dialog.contentPadding }, dividers: { borderColor: ui.color.border } } },
    MuiDialogActions: { styleOverrides: { root: { padding: ui.dialog.actionsPadding, gap: ui.dialog.actionsGap, '& > :not(style) ~ :not(style)': { marginLeft: 0 } } } },
    MuiTab: { styleOverrides: { root: { color: ui.color.muted, backgroundColor: ui.color.canvas, '&.Mui-selected': { color: ui.color.primary } } } },
  },
});

export default theme;
