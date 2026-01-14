
import { createTheme, ThemeOptions } from '@mui/material/styles';

// Common settings
const baseTheme: ThemeOptions = {
    typography: {
        fontFamily: "'Assistant', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
        h1: { fontWeight: 700 },
        h2: { fontWeight: 700 },
        h3: { fontWeight: 600 },
        h4: { fontWeight: 600 },
        h5: { fontWeight: 600 },
        h6: { fontWeight: 600 },
        button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: {
        borderRadius: 12,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    boxShadow: 'none',
                    '&:hover': {
                        boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                    },
                },
                containedPrimary: {
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                },
                head: {
                    fontWeight: 600,
                },
            },
        },
    },
};

export const lightTheme = createTheme({
    ...baseTheme,
    palette: {
        mode: 'light',
        primary: {
            main: '#3b82f6', // blue-500
            light: '#60a5fa',
            dark: '#2563eb',
        },
        secondary: {
            main: '#64748b', // slate-500
            light: '#94a3b8',
            dark: '#475569',
        },
        background: {
            default: '#f8fafc', // slate-50
            paper: '#ffffff',
        },
        text: {
            primary: '#0f172a', // slate-900
            secondary: '#475569', // slate-600
        },
        divider: '#e2e8f0', // slate-200
    },
});

export const darkTheme = createTheme({
    ...baseTheme,
    palette: {
        mode: 'dark',
        primary: {
            main: '#3b82f6', // blue-500
            light: '#60a5fa',
            dark: '#2563eb',
        },
        secondary: {
            main: '#94a3b8', // slate-400
            light: '#cbd5e1',
            dark: '#64748b',
        },
        background: {
            default: '#0f172a', // slate-900
            paper: '#1e293b', // slate-800
        },
        text: {
            primary: '#f1f5f9', // slate-100
            secondary: '#94a3b8', // slate-400
        },
        divider: '#334155', // slate-700
    },
});
