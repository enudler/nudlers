import type { Meta, StoryObj } from '@storybook/react';
import { Card, Typography, Box, Stack, Button, Chip } from '@mui/material';
import React from 'react';

const meta: Meta = {
    title: 'Design System/Premium Card',
    parameters: {
        layout: 'centered',
    },
};

export default meta;

export const Showcase: StoryObj = {
    render: () => (
        <Box sx={{ p: 4, bgcolor: 'var(--n-bg-main)', minWidth: '400px' }}>
            <Card className="n-card n-card-hover" sx={{ p: 3 }}>
                <Stack spacing={2}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" className="gradient-text" sx={{ fontWeight: 800 }}>
                            Monthly Revenue
                        </Typography>
                        <Chip
                            label="+12.5%"
                            size="small"
                            sx={{
                                bgcolor: 'rgba(16, 185, 129, 0.1)',
                                color: '#10b981',
                                fontWeight: 700
                            }}
                        />
                    </Box>

                    <Box>
                        <Typography variant="h3" sx={{ fontWeight: 800 }}>
                            {"₪"}42,500
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            vs. last month {"₪"}37,800
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" size="small">Details</Button>
                        <Button variant="outlined" size="small">Export</Button>
                    </Stack>
                </Stack>
            </Card>
        </Box>
    ),
};

export const GlassEffect: StoryObj = {
    render: () => (
        <Box sx={{
            p: 8,
            className: 'n-gradient-bg',
            borderRadius: 'var(--n-radius-2xl)',
            display: 'flex',
            justifyContent: 'center'
        }}>
            <Box className="n-glass" sx={{ p: 4, borderRadius: 'var(--n-radius-xl)', maxWidth: '300px' }}>
                <Typography variant="h6" sx={{ color: 'var(--n-text-primary)', mb: 1 }}>
                    Glassmorphism
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--n-text-secondary)' }}>
                    Refined backdrop-blur and border-opacity for a sleek, modern feel.
                </Typography>
            </Box>
        </Box>
    ),
};

export const HeroSection: StoryObj = {
    render: () => (
        <Box sx={{ p: 4, bgcolor: 'var(--n-bg-main)' }}>
            <Box className="n-glass" sx={{
                borderRadius: '32px',
                p: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid var(--n-border)'
            }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ bgcolor: 'rgba(99, 102, 241, 0.1)', p: 1.5, borderRadius: '16px' }}>
                        <SavingsIcon sx={{ color: 'var(--n-primary)', fontSize: 32 }} />
                    </Box>
                    <Box>
                        <Typography variant="h4" className="gradient-text" sx={{ fontWeight: 800 }}>
                            Monthly Dashboard
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Analyze your financial health and spending patterns
                        </Typography>
                    </Box>
                </Stack>
                <Stack direction="row" spacing={1}>
                    <Button variant="contained" className="n-active-press">Sync Now</Button>
                    <Button variant="outlined" className="n-active-press">Settings</Button>
                </Stack>
            </Box>
        </Box>
    ),
};

import SavingsIcon from '@mui/icons-material/Savings';

export const BudgetTracker: StoryObj = {
    render: () => (
        <Box sx={{ p: 4, bgcolor: 'var(--n-bg-main)', maxWidth: '500px' }}>
            <Box className="n-card n-card-hover" sx={{ p: 3, position: 'relative', overflow: 'hidden' }}>
                <Box sx={{
                    position: 'absolute',
                    top: -20, right: -20,
                    width: 100, height: 100,
                    bgcolor: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '50%',
                    filter: 'blur(20px)'
                }} />
                <Stack spacing={2}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Food & Dining</Typography>
                        <Chip label="Over Budget" size="small" color="error" sx={{ fontWeight: 700, borderRadius: '6px' }} />
                    </Box>
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="h5" sx={{ fontWeight: 800 }}>₪3,240</Typography>
                            <Typography variant="body2" color="text.secondary">Limit: ₪3,000</Typography>
                        </Box>
                        <Box sx={{ width: '100%', height: 8, bgcolor: 'var(--n-bg-surface-alt)', borderRadius: 4, overflow: 'hidden' }}>
                            <Box sx={{ width: '100%', height: '100%', bgcolor: 'var(--n-error)' }} />
                        </Box>
                    </Box>
                </Stack>
            </Box>
        </Box>
    ),
};
