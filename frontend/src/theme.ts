import { autocompleteClasses } from '@mui/material/Autocomplete'
import { createTheme } from '@mui/material/styles'

// Design tokens: a neutral slate palette with one indigo accent. Values are
// the standard Tailwind slate/indigo scale, chosen for known AA contrast at
// these shades (e.g. indigo-600 on white body text, white on indigo-600 for
// filled buttons) rather than picked ad hoc.
const slate = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  600: '#475569',
  900: '#0f172a',
}
const indigo = {
  600: '#4f46e5',
  700: '#4338ca',
}

export const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: slate[100],
      paper: '#ffffff',
    },
    primary: {
      main: indigo[600],
      dark: indigo[700],
    },
    text: {
      primary: slate[900],
      secondary: slate[600],
    },
    divider: slate[200],
  },
  typography: {
    fontFamily: "'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif",
    h6: { fontWeight: 600 },
    body1: { fontSize: '0.9375rem' },
    body2: { fontSize: '0.875rem' },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: slate[100] },
        // Visible focus rings everywhere, not just MUI's default outline.
        ':focus-visible': {
          outline: `2px solid ${indigo[600]}`,
          outlineOffset: 2,
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*': {
            animationDuration: '0.001ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.001ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        // Soft shadow instead of MUI's default (darker, harder-edged) elevation.
        elevation1: {
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: slate[900],
          borderBottom: `1px solid ${slate[200]}`,
          boxShadow: 'none',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        // Default padding is 16px all round; horizontal space is tighter
        // on a wide, many-column table, so only the horizontal side is
        // reduced, to ~12px.
        root: { borderBottomColor: slate[200], padding: '16px 12px' },
      },
    },
    MuiTableSortLabel: {
      styleOverrides: {
        // Visible but subtle at rest, stronger on hover, full strength
        // once this column is the active sort.
        icon: { opacity: 0.5 },
        root: {
          '&:hover .MuiTableSortLabel-icon': { opacity: 0.8 },
          '&.Mui-active .MuiTableSortLabel-icon': { opacity: 1 },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        // MUI hides the clear (x) button until the field is hovered or
        // focused, which leaves an active filter with no visible way to
        // clear it on a touch device (no hover state at all). Show it
        // any time the field has a value, regardless of hover/focus.
        root: {
          [`&.${autocompleteClasses.hasClearIcon} .${autocompleteClasses.clearIndicator}`]: {
            visibility: 'visible',
          },
        },
      },
    },
  },
})
