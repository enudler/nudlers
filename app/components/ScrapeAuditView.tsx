import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import HistoryIcon from '@mui/icons-material/History';
import PageHeader from './PageHeader';
import { useTheme } from '@mui/material/styles';
import Table from './Table';

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
            padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
            maxWidth: '1440px',
            margin: '0 auto',
            position: 'relative',
            zIndex: 1
        }}>
            <PageHeader
                title="Scrape Audit"
                description="History of scraping events and their status"
                icon={<HistoryIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}
                onRefresh={fetchEvents}
            />

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
                    <Table
                        rows={events}
                        rowKey={(row) => row.id}
                        emptyMessage="No audit events found"
                        columns={[
                            { id: 'created_at', label: 'Time', format: (val) => new Date(val).toLocaleString() },
                            { id: 'vendor', label: 'Vendor' },
                            { id: 'start_date', label: 'Start Date', format: (val) => new Date(val).toLocaleDateString() },
                            { id: 'triggered_by', label: 'Triggered By', format: (val) => val || '-' },
                            {
                                id: 'status',
                                label: 'Status',
                                format: (val) => (
                                    <Chip
                                        label={val}
                                        color={statusColor(val) as any}
                                        size="small"
                                        sx={{ fontWeight: 600, textTransform: 'capitalize' }}
                                    />
                                )
                            },
                            {
                                id: 'message',
                                label: 'Message',
                                format: (val) => (
                                    <Box sx={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={val}>
                                        {val || '-'}
                                    </Box>
                                )
                            }
                        ]}
                        mobileCardRenderer={(row) => (
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="subtitle2" fontWeight={700}>{row.vendor}</Typography>
                                    <Chip
                                        label={row.status}
                                        color={statusColor(row.status) as any}
                                        size="small"
                                        sx={{ height: 20, fontSize: '10px' }}
                                    />
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="caption" color="text.secondary">{new Date(row.created_at).toLocaleString()}</Typography>
                                    <Typography variant="caption" color="text.secondary">{row.message || '-'}</Typography>
                                </Box>
                            </Box>
                        )}
                    />
                )}
            </Box>
        </Box>
    );
}
