import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { AppThemeProvider } from '../context/ThemeContext';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AppThemeProvider>
      <Component {...pageProps} />
    </AppThemeProvider>
  );
}

export default MyApp;
