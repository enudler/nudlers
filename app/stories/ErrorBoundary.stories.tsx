import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Box, Typography } from '@mui/material';
import ErrorBoundary from '../components/ErrorBoundary';

const ThrowingComponent = () => {
    throw new Error('Test error for Storybook');
};

const meta: Meta<typeof ErrorBoundary> = {
    title: 'Components/ErrorBoundary',
    component: ErrorBoundary,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <Box sx={{ width: '600px', minHeight: '300px' }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

export const ErrorState: Story = {
    render: () => (
        <ErrorBoundary>
            <ThrowingComponent />
        </ErrorBoundary>
    ),
};

export const NormalState: Story = {
    render: () => (
        <ErrorBoundary>
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="h6">Content renders normally</Typography>
                <Typography color="text.secondary">
                    The ErrorBoundary passes children through when there is no error.
                </Typography>
            </Box>
        </ErrorBoundary>
    ),
};
