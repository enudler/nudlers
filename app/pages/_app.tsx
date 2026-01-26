import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { AppThemeProvider } from '../context/ThemeContext';
import { StatusProvider } from '../context/StatusContext';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AppThemeProvider>
      <StatusProvider>
        <Component {...pageProps} />
      </StatusProvider>
    </AppThemeProvider>
  );
}

export default MyApp;
