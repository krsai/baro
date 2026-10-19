import { ui } from './ui';
import { getLabelPalette } from './labelPalette';
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
    h5: { fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.035em' },
    h6: { fontSize: '1rem', fontWeight: 650, letterSpacing: '-0.02em' },
  },
  components: {
    MuiCssBaseline: { styleOverrides: {
      ':root': {
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
      root: { borderRadius: ui.radius.control, padding: '7px 15px', fontSize: '0.8125rem' },
      outlined: { borderColor: '#dfe5ed' },
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
      '& .MuiOutlinedInput-notchedOutline': { border: '1px solid #dfe5ed' },
      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '2px solid ' + ui.color.primary },
      '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: baseTheme.palette.error.main },
      '&.Mui-disabled': { backgroundColor: ui.color.header },
    } } },
    MuiPickersOutlinedInput: { styleOverrides: { root: {
      ...inputSurface,
      '& .MuiPickersOutlinedInput-notchedOutline': { border: '1px solid #dfe5ed' },
      '&.Mui-focused .MuiPickersOutlinedInput-notchedOutline': { border: '2px solid ' + ui.color.primary },
      '&.Mui-error .MuiPickersOutlinedInput-notchedOutline': { borderColor: baseTheme.palette.error.main },
      '&.Mui-disabled': { backgroundColor: ui.color.header },
    } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: ui.radius.panel } } },
    MuiTab: { styleOverrides: { root: { color: ui.color.muted, backgroundColor: ui.color.canvas, '&.Mui-selected': { color: ui.color.primary } } } },
  },
});

export default theme;
