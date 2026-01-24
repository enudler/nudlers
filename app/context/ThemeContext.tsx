
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
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
    const [mode, setMode] = useState<ColorMode>(() => {
        if (typeof window !== 'undefined') {
            const savedMode = localStorage.getItem('themeMode') as ColorMode;
            if (savedMode) {
                return savedMode;
            }
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                return 'light';
            }
        }
        return 'dark';
    });

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
        root.setAttribute('data-theme', mode);
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
