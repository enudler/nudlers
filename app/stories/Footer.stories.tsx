import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Box } from '@mui/material';
import Footer from '../components/Footer';

const meta: Meta<typeof Footer> = {
    title: 'Components/Footer',
    component: Footer,
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story) => (
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '200px', justifyContent: 'flex-end' }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Footer>;

export const Default: Story = {};
