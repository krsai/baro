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
      primary: '#111',
      secondary: '#555',
    },
  },
  shape: {
    borderRadius: 0,
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 13, // Smaller base font size for data density
    h4: { fontSize: '1.5rem', fontWeight: 600 },
    h5: { fontSize: '1.25rem', fontWeight: 600 },
    h6: { fontSize: '1.1rem', fontWeight: 600 },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  spacing: 6, // Reduce spacing unit
  transitions: {
    // Disable all animations
    create: () => 'none',
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
          padding: '4px 12px',
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '6px 10px', // Compact cell padding
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
          borderRadius: 0,
          padding: '6px',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 0,
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          borderRadius: '0 !important',
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
          // height: 38, // Removed fixed height to allow padding to take effect
          minHeight: 38, // Use minHeight if a minimum size is desired
          padding: '4px 12px 6px 12px', // Top 4px, others as before
          marginRight: '4px', // Space between tabs
          borderRadius: '8px 8px 0 0',
          color: 'rgba(0, 0, 0, 0.85)',
          backgroundColor: '#f0f0f0',
          border: '1px solid #e8e8e8',
          borderBottom: 'none',
          '&:hover': {
            backgroundColor: '#e6e6e6',
          },
          '&.Mui-selected': {
            color: '#1890ff',
            backgroundColor: '#fff',
            border: '1px solid #e8e8e8',
            borderBottomColor: '#fff',
          },
          transition: 'all 0.2s ease-in-out', // Added for smoother transitions
        },
      },
    },
  },
});

export default theme;