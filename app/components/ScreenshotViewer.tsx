import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Grid,
    Card,
    CardMedia,
    CardContent,
    CardActionArea,
    CircularProgress,
    IconButton,
    Alert
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import ImageIcon from '@mui/icons-material/Image';
import { logger } from '../utils/client-logger';

interface Screenshot {
    filename: string;
    url: string;
    companyId: string;
    stepName: string;
    timestamp: string;
    size: number;
}

interface ScreenshotViewerProps {
    open: boolean;
    onClose: () => void;
}

const ScreenshotViewer: React.FC<ScreenshotViewerProps> = ({ open, onClose }) => {
    const theme = useTheme();
    const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchScreenshots = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/debug/screenshots');
            if (response.ok) {
                const data = await response.json();
                setScreenshots(data.screenshots);
            } else {
                throw new Error('Failed to fetch screenshots');
            }
        } catch (err) {
            logger.error('Failed to fetch screenshots', err as Error);
            setError('Could not load screenshots.');
        } finally {
            setLoading(false);
        }
    };

    const clearScreenshots = async () => {
        if (!confirm('Are you sure you want to delete all screenshots?')) return;

        try {
            const response = await fetch('/api/debug/screenshots', { method: 'DELETE' });
            if (response.ok) {
                setScreenshots([]);
                fetchScreenshots();
            }
        } catch (err) {
            logger.error('Failed to clear screenshots', err as Error);
        }
    };

    useEffect(() => {
        if (open) {
            fetchScreenshots();
        }
    }, [open]);

    return (
        <>
            <Dialog
                open={open}
                onClose={onClose}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        background: theme.palette.mode === 'dark'
                            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)'
                            : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(20px)',
                        border: `1px solid ${theme.palette.divider}`,
                        borderRadius: '16px',
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ImageIcon color="primary" />
                        <Typography variant="h6">Debug Screenshots</Typography>
                    </Box>
                    <Box>
                        <IconButton onClick={fetchScreenshots} disabled={loading} size="small" sx={{ mr: 1 }}>
                            <RefreshIcon />
                        </IconButton>
                        <IconButton onClick={clearScreenshots} disabled={loading || screenshots.length === 0} size="small" color="error" sx={{ mr: 1 }}>
                            <DeleteIcon />
                        </IconButton>
                        <IconButton onClick={onClose} size="small">
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress />
                        </Box>
                    ) : error ? (
                        <Alert severity="error">{error}</Alert>
                    ) : screenshots.length === 0 ? (
                        <Box sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>
                            <Typography variant="body1">No screenshots found.</Typography>
                            <Typography variant="caption">Screenshots will appear here when scrapers capture them.</Typography>
                        </Box>
                    ) : (
                        <Grid container spacing={2}>
                            {screenshots.map((s) => (
                                <Grid item xs={12} sm={6} md={4} key={s.filename}>
                                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                                        <CardActionArea onClick={() => setSelectedImage(s.url)}>
                                            <CardMedia
                                                component="img"
                                                height="140"
                                                image={s.url}
                                                alt={s.stepName}
                                            />
                                            <CardContent sx={{ p: 1.5 }}>
                                                <Typography variant="subtitle2" noWrap>
                                                    {s.companyId} - {s.stepName}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    {new Date(s.timestamp).toLocaleString()} • {(s.size / 1024).toFixed(1)} KB
                                                </Typography>
                                            </CardContent>
                                        </CardActionArea>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Full screen image viewer */}
            <Dialog
                open={!!selectedImage}
                onClose={() => setSelectedImage(null)}
                maxWidth="xl"
                fullWidth
            >
                <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'black' }}>
                    <IconButton
                        onClick={() => setSelectedImage(null)}
                        sx={{ position: 'absolute', right: 8, top: 8, color: 'white', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
                    >
                        <CloseIcon />
                    </IconButton>
                    {selectedImage && (
                        <Box
                            component="img"
                            src={selectedImage}
                            sx={{ width: '100%', display: 'block' }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};

export default ScreenshotViewer;
