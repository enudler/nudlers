
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { lightTheme, darkTheme } from '../styles/theme';

type ColorMode = 'light' | 'dark';

interface ColorModeContextType {
    mode: ColorMode;
    toggleColorMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextType>({
    mode: 'dark', // Default to dark because it looks cooler
    toggleColorMode: () => { },
});

export const useColorMode = () => useContext(ColorModeContext);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setMode] = useState<ColorMode>('dark');

    useEffect(() => {
        // Load preference from local storage
        const savedMode = localStorage.getItem('themeMode') as ColorMode;
        if (savedMode) {
            setMode(savedMode);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            // Check system preference if no local storage
            setMode('light');
        }
    }, []);

    const colorMode = useMemo(
        () => ({
            mode,
            toggleColorMode: () => {
                setMode((prevMode) => {
                    const newMode = prevMode === 'light' ? 'dark' : 'light';
                    localStorage.setItem('themeMode', newMode);
                    return newMode;
                });
            },
        }),
        [mode],
    );

    const theme = useMemo(() => (mode === 'light' ? lightTheme : darkTheme), [mode]);

    // Sync with Global CSS Variables
    useEffect(() => {
        const root = document.documentElement;
        if (mode === 'dark') {
            root.style.setProperty('--bg-default', '#0f172a');
            root.style.setProperty('--bg-paper', '#1e293b');
            root.style.setProperty('--text-primary', '#f1f5f9');
            root.style.setProperty('--text-secondary', '#94a3b8');
            root.style.setProperty('--border-color', '#334155');
            root.style.setProperty('--hover-bg', 'rgba(255, 255, 255, 0.05)');
            root.setAttribute('data-theme', 'dark');
        } else {
            root.style.setProperty('--bg-default', '#f8fafc');
            root.style.setProperty('--bg-paper', '#ffffff');
            root.style.setProperty('--text-primary', '#0f172a');
            root.style.setProperty('--text-secondary', '#475569');
            root.style.setProperty('--border-color', '#e2e8f0');
            root.style.setProperty('--hover-bg', 'rgba(0, 0, 0, 0.04)');
            root.setAttribute('data-theme', 'light');
        }
    }, [mode]);

    return (
        <ColorModeContext.Provider value={colorMode}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </ThemeProvider>
        </ColorModeContext.Provider>
    );
};
