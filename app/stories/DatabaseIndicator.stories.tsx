import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Box } from '@mui/material';
import DatabaseIndicator from '../components/DatabaseIndicator';
import { StatusContext } from '../context/StatusContext';

const mockStatusValue = (overrides: Partial<{ isDbConnected: boolean }>) => ({
    isDbConnected: true,
    dbError: false,
    syncStatus: null,
    refreshStatus: async () => {},
    checkDb: async () => {},
    setFullPolling: () => {},
    ...overrides,
});

const meta: Meta<typeof DatabaseIndicator> = {
    title: 'Indicators/DatabaseIndicator',
    component: DatabaseIndicator,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <Box sx={{ p: 4 }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof DatabaseIndicator>;

export const Connected: Story = {
    decorators: [
        (Story) => (
            <StatusContext.Provider value={mockStatusValue({ isDbConnected: true })}>
                <Story />
            </StatusContext.Provider>
        ),
    ],
};

export const Disconnected: Story = {
    decorators: [
        (Story) => (
            <StatusContext.Provider value={mockStatusValue({ isDbConnected: false })}>
                <Story />
            </StatusContext.Provider>
        ),
    ],
};
