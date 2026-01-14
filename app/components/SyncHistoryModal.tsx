import { useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemButton from '@mui/material/ListItemButton';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ModalHeader from './ModalHeader';
import ScrapeReport from './ScrapeReport';

interface SyncHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SyncHistoryModal({ isOpen, onClose }: SyncHistoryModalProps) {
    const theme = useTheme();
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState<any[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/scrape_events');
            if (res.ok) {
                const data = await res.json();
                setEvents(data);
            }
        } catch (err) {
            console.error('Failed to fetch sync history', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchEvents();
            setSelectedEvent(null);
        }
    }, [isOpen]);

    const handleSelectEvent = (event: any) => {
        setSelectedEvent(event);
    };

    const handleBack = () => {
        setSelectedEvent(null);
    };

    const getStatusIcon = (status: string) => {
        if (status === 'success') return <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 20 }} />;
        if (status === 'error') return <ErrorIcon sx={{ color: '#ef4444', fontSize: 20 }} />;
        return <CircularProgress size={20} />;
    };

    return (
        <Dialog
            open={isOpen}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                style: {
                    backgroundColor: theme.palette.mode === 'dark' ? theme.palette.background.paper : '#ffffff',
                    borderRadius: '24px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                    height: '80vh',
                    backgroundImage: theme.palette.mode === 'dark' ? 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))' : 'none',
                }
            }}
        >
            <ModalHeader
                title={selectedEvent ? "Sync Details" : "Sync History"}
                onClose={onClose}
                startAction={selectedEvent ? (
                    <Button onClick={handleBack} startIcon={<ArrowBackIcon />} sx={{ mr: 1, minWidth: 'auto' }}>
                        Back
                    </Button>
                ) : undefined}
            />
            <DialogContent style={{ padding: '0 24px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {selectedEvent ? (
                    <Box sx={{ flex: 1, overflowY: 'auto', mt: 2 }}>
                        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{selectedEvent.vendor}</Typography>
                                <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                                    {new Date(selectedEvent.created_at).toLocaleString()}
                                </Typography>
                            </Box>
                            <Chip
                                label={selectedEvent.status}
                                color={selectedEvent.status === 'success' ? 'success' : 'error'}
                                size="small"
                                variant="outlined"
                            />
                        </Box>

                        {selectedEvent.report_json ? (
                            <ScrapeReport
                                report={selectedEvent.report_json.processedTransactions || []}
                                summary={selectedEvent.report_json}
                            />
                        ) : (
                            <Box sx={{ p: 4, textAlign: 'center', bgcolor: '#f9fafb', borderRadius: 2 }}>
                                <Typography variant="body1" sx={{ color: '#374151' }}>No detailed report available for this sync.</Typography>
                                <Typography variant="caption" sx={{ color: '#6b7280', mt: 1, display: 'block' }}>
                                    {selectedEvent.message}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                ) : (
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : events.length === 0 ? (
                            <Box sx={{ textAlign: 'center', p: 4 }}>
                                <Typography variant="body2" sx={{ color: '#9ca3af' }}>No sync history found.</Typography>
                            </Box>
                        ) : (
                            <List>
                                {events.map((event) => (
                                    <div key={event.id}>
                                        <ListItemButton
                                            onClick={() => handleSelectEvent(event)}
                                            sx={{
                                                borderRadius: 2,
                                                mb: 1,
                                                border: `1px solid ${theme.palette.divider}`,
                                                '&:hover': {
                                                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#f9fafb',
                                                    borderColor: theme.palette.text.secondary
                                                }
                                            }}
                                        >
                                            <ListItemText
                                                primary={
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        {getStatusIcon(event.status)}
                                                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                                            {event.vendor}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                                                            via {event.triggered_by || 'manual'}
                                                        </Typography>
                                                    </Box>
                                                }
                                                secondary={
                                                    <Box sx={{ mt: 0.5 }}>
                                                        <Typography variant="body2" sx={{ color: theme.palette.text.primary, fontSize: '0.85rem' }} noWrap>
                                                            {event.message}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                                                            {new Date(event.created_at).toLocaleString()}
                                                        </Typography>
                                                    </Box>
                                                }
                                            />
                                            <PlayArrowIcon sx={{ color: '#d1d5db' }} fontSize="small" />
                                        </ListItemButton>
                                    </div>
                                ))}
                            </List>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
                <Button onClick={onClose} style={{ color: theme.palette.text.secondary }}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
}
