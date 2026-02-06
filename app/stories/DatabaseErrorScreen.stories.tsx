import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import DatabaseErrorScreen from '../components/DatabaseErrorScreen';

const meta: Meta<typeof DatabaseErrorScreen> = {
    title: 'Indicators/DatabaseErrorScreen',
    component: DatabaseErrorScreen,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof DatabaseErrorScreen>;

export const Default: Story = {
    args: {
        onRetry: () => {},
        isRetrying: false,
    },
};

export const Retrying: Story = {
    args: {
        onRetry: () => {},
        isRetrying: true,
    },
};
