import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Paper, IconButton } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ModalHeader from '../components/ModalHeader';

const meta: Meta<typeof ModalHeader> = {
    title: 'Components/ModalHeader',
    component: ModalHeader,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <Paper sx={{ width: '500px', overflow: 'hidden', borderRadius: '16px' }}>
                <Story />
            </Paper>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ModalHeader>;

export const Default: Story = {
    args: {
        title: 'Edit Transaction',
        onClose: () => {},
    },
};

export const WithActions: Story = {
    args: {
        title: 'Transaction Details',
        onClose: () => {},
        actions: (
            <IconButton size="small" sx={{ color: 'text.secondary' }}>
                <SettingsIcon fontSize="small" />
            </IconButton>
        ),
    },
};

export const WithStartAction: Story = {
    args: {
        title: 'Category Rules',
        onClose: () => {},
        startAction: (
            <IconButton size="small" sx={{ color: 'text.secondary' }}>
                <ArrowBackIcon fontSize="small" />
            </IconButton>
        ),
    },
};

export const LongTitle: Story = {
    args: {
        title: 'Monthly Transaction Summary for January 2026 - All Categories',
        onClose: () => {},
    },
};
