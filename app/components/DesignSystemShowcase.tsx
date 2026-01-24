import React from 'react';
import { Box, Typography, Grid, Paper, Button, Chip, Stack } from '@mui/material';

const DesignSystemShowcase: React.FC = () => {
    return (
        <Box sx={{ p: 4 }}>
            <Typography variant="h2" gutterBottom className="gradient-text">
                Nudlers Design System
            </Typography>
            <Typography variant="body1" sx={{ mb: 6, color: 'text.secondary', maxWidth: '800px' }}>
                A premium, modern design system built with Zinc and Indigo tones,
                leveraging glassmorphism and subtle micro-interactions to create a
                world-class financial experience.
            </Typography>

            <Grid container spacing={4}>
                {/* Colors */}
                <Grid item xs={12}>
                    <Typography variant="h4" sx={{ mb: 3 }}>Palette</Typography>
                    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                        {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(level => (
                            <Box key={level} sx={{ textAlign: 'center' }}>
                                <Box sx={{
                                    width: 60, height: 60,
                                    bgcolor: `var(--n-zinc-${level})`,
                                    borderRadius: 'var(--n-radius-md)',
                                    border: '1px solid var(--n-border)'
                                }} />
                                <Typography variant="caption">{level}</Typography>
                            </Box>
                        ))}
                    </Stack>
                    <Stack direction="row" spacing={2}>
                        {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(level => (
                            <Box key={level} sx={{ textAlign: 'center' }}>
                                <Box sx={{
                                    width: 60, height: 60,
                                    bgcolor: `var(--n-primary-${level})`,
                                    borderRadius: 'var(--n-radius-md)',
                                    border: '1px solid var(--n-border)'
                                }} />
                                <Typography variant="caption">{level}</Typography>
                            </Box>
                        ))}
                    </Stack>
                </Grid>

                {/* Cards */}
                <Grid item xs={12} md={6}>
                    <Typography variant="h4" sx={{ mb: 3 }}>Cards & Surfaces</Typography>
                    <Stack spacing={3}>
                        <Paper className="n-card n-card-hover">
                            <Typography variant="h6">Standard Card</Typography>
                            <Typography variant="body2" color="text.secondary">
                                This card uses the design system's elevation and hover effects.
                            </Typography>
                        </Paper>
                        <Box className="n-glass" sx={{ p: 3, borderRadius: 'var(--n-radius-xl)' }}>
                            <Typography variant="h6">Glass Surface</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Perfect for headers, overlays, and sidebars.
                            </Typography>
                        </Box>
                    </Stack>
                </Grid>

                {/* Buttons */}
                <Grid item xs={12} md={6}>
                    <Typography variant="h4" sx={{ mb: 3 }}>Components</Typography>
                    <Stack spacing={2} direction="row" useFlexGap flexWrap="wrap">
                        <Button variant="contained" color="primary">MUI Primary</Button>
                        <Button variant="outlined">MUI Outline</Button>
                        <button className="n-btn n-btn-primary">Vanilla Primary</button>
                        <button className="n-btn n-btn-outline">Vanilla Outline</button>
                    </Stack>
                    <Stack spacing={1} direction="row" sx={{ mt: 3 }}>
                        <Chip label="Success" sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }} />
                        <Chip label="Error" sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }} />
                        <Chip label="Warning" sx={{ bgcolor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.2)' }} />
                        <Chip label="Info" sx={{ bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }} />
                    </Stack>
                </Grid>

                {/* Typography */}
                <Grid item xs={12}>
                    <Typography variant="h4" sx={{ mb: 3 }}>Typography</Typography>
                    <Box sx={{ p: 4, bgcolor: 'var(--n-bg-surface-alt)', borderRadius: 'var(--n-radius-xl)' }}>
                        <Typography variant="h1">Heading 1 - Outfit Bold</Typography>
                        <Typography variant="h2">Heading 2 - Outfit Bold</Typography>
                        <Typography variant="h3">Heading 3 - Outfit Semibold</Typography>
                        <Typography variant="body1" sx={{ mt: 2 }}>
                            Body Text Content. The quick brown fox jumps over the lazy dog.
                            Uses Assistant as fallback but prefers Outfit for a modern feel.
                        </Typography>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default DesignSystemShowcase;
