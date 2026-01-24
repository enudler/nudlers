import React from 'react';
import type { Preview } from '@storybook/nextjs-vite';
import { AppThemeProvider } from '../context/ThemeContext';
import '../styles/globals.css';
import '../styles/design-tokens.css';
import '../styles/design-system.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    (Story) => (
      <AppThemeProvider>
        <Story />
      </AppThemeProvider>
    ),
  ],
};

export default preview;