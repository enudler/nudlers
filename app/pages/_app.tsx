import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { AppThemeProvider } from '../context/ThemeContext';
import { SyncStatusProvider } from '../context/SyncStatusContext';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AppThemeProvider>
      <SyncStatusProvider>
        <Component {...pageProps} />
      </SyncStatusProvider>
    </AppThemeProvider>
  );
}

export default MyApp;
