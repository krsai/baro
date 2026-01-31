import { createTheme } from '@mui/material/styles';

const theme = createTheme({
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
    h5: { fontSize: '1.25rem', fontWeight: 600 },
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
    MuiTextField: {
      defaultProps: {
        variant: 'standard',
        size: 'small',
      },
    },
    MuiSelect: {
      defaultProps: {
        variant: 'standard',
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
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          width: 120,
          fontWeight: 'bold',
          '&.Mui-selected': {
            backgroundColor: theme.palette.primary.light,
            color: theme.palette.primary.contrastText,
            '&:hover': {
              backgroundColor: theme.palette.primary.main,
            },
          },
        }),
      },
    },
  },
});

export default theme;