import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import HistoryIcon from '@mui/icons-material/History';
import { useTheme } from '@mui/material/styles';

interface ScrapeEvent {
    id: number;
    triggered_by: string | null;
    vendor: string;
    start_date: string;
    status: 'started' | 'success' | 'failed' | string;
    message: string | null;
    created_at: string;
}

export default function ScrapeAuditView() {
    const [events, setEvents] = useState<ScrapeEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const theme = useTheme();

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/scrape-events?limit=200');
            const data = await res.json();
            setEvents(data);
        } catch {
            // noop
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, []);

    const statusColor = (status: string) => {
        if (status === 'success') return 'success';
        if (status === 'failed') return 'error';
        return 'default';
    };

    return (
        <Box sx={{
            padding: { xs: '16px', md: '32px' },
            maxWidth: '1440px',
            margin: '0 auto',
            marginTop: { xs: '56px', md: '40px' },
        }}>
            {/* Header Section */}
            <Box sx={{
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '24px',
                marginBottom: '24px',
                border: `1px solid ${theme.palette.divider}`,
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
            }}>
                <HistoryIcon sx={{ fontSize: '32px', color: theme.palette.primary.main }} />
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>Scrape Audit</Typography>
                    <Typography variant="body2" color="text.secondary">History of scraping events and their status</Typography>
                </Box>
            </Box>

            {/* Content Section */}
            <Box sx={{
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
                borderRadius: '24px',
                padding: '24px',
                border: `1px solid ${theme.palette.divider}`,
                minHeight: '400px'
            }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
                        <CircularProgress />
                    </Box>
                ) : events.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                        <Typography color="text.secondary">No audit events found</Typography>
                    </Box>
                ) : (
                    <Box sx={{ overflowX: 'auto' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Start Date</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Triggered By</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Message</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {events.map(ev => (
                                    <TableRow key={ev.id} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                        <TableCell>{new Date(ev.created_at).toLocaleString()}</TableCell>
                                        <TableCell>{ev.vendor}</TableCell>
                                        <TableCell>{new Date(ev.start_date).toLocaleDateString()}</TableCell>
                                        <TableCell>{ev.triggered_by || '-'}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={ev.status}
                                                color={statusColor(ev.status) as any}
                                                size="small"
                                                sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {ev.message || '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
