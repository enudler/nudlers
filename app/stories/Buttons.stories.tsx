import type { Meta, StoryObj } from '@storybook/react';
import { Button, Stack, Typography, Box } from '@mui/material';
import React from 'react';

const meta: Meta<typeof Button> = {
    title: 'Design System/Buttons',
    component: Button,
    parameters: {
        layout: 'centered',
    },
};

export default meta;

export const AllVariants: StoryObj = {
    render: () => (
        <Box sx={{ p: 4, bgcolor: 'var(--n-bg-main)' }}>
            <Stack spacing={4}>
                <Box>
                    <Typography variant="subtitle2" gutterBottom color="text.secondary">Contained</Typography>
                    <Stack direction="row" spacing={2}>
                        <Button variant="contained" color="primary">Primary</Button>
                        <Button variant="contained" color="secondary">Secondary</Button>
                        <Button variant="contained" disabled>Disabled</Button>
                    </Stack>
                </Box>

                <Box>
                    <Typography variant="subtitle2" gutterBottom color="text.secondary">Outlined</Typography>
                    <Stack direction="row" spacing={2}>
                        <Button variant="outlined" color="primary">Primary</Button>
                        <Button variant="outlined" color="secondary">Secondary</Button>
                        <Button variant="outlined" disabled>Disabled</Button>
                    </Stack>
                </Box>

                <Box>
                    <Typography variant="subtitle2" gutterBottom color="text.secondary">Text</Typography>
                    <Stack direction="row" spacing={2}>
                        <Button variant="text" color="primary">Primary</Button>
                        <Button variant="text" color="secondary">Secondary</Button>
                        <Button variant="text" disabled>Disabled</Button>
                    </Stack>
                </Box>

                <Box>
                    <Typography variant="subtitle2" gutterBottom color="text.secondary">Sizes</Typography>
                    <Stack direction="row" spacing={2} alignItems="center">
                        <Button variant="contained" size="small">Small</Button>
                        <Button variant="contained" size="medium">Medium</Button>
                        <Button variant="contained" size="large">Large</Button>
                    </Stack>
                </Box>

                <Box>
                    <Typography variant="subtitle2" gutterBottom color="text.secondary">Vanilla Counterparts</Typography>
                    <Stack direction="row" spacing={2}>
                        <button className="n-btn n-btn-primary">Vanilla Primary</button>
                        <button className="n-btn n-btn-outline">Vanilla Outline</button>
                    </Stack>
                </Box>
            </Stack>
        </Box>
    ),
};
