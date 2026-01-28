import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import HistoryIcon from '@mui/icons-material/History';
import PageHeader from './PageHeader';
import { useTheme } from '@mui/material/styles';
import Table from './Table';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

interface ScrapeEvent {
    id: number;
    triggered_by: string | null;
    vendor: string;
    start_date: string;
    status: 'started' | 'success' | 'failed' | string;
    message: string | null;
    created_at: string;
    report_json?: {
        body?: string;
        to?: string;
        error?: string;
        [key: string]: any;
    } | null;
}

export default function ScrapeAuditView() {
    const [events, setEvents] = useState<ScrapeEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentTab, setCurrentTab] = useState(0);
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
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

    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        setCurrentTab(newValue);
    };

    const toggleRow = (id: number) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    };

    const statusColor = (status: string) => {
        if (status === 'success') return 'success';
        if (status === 'failed') return 'error';
        return 'default';
    };

    // Filter events based on tab
    const displayEvents = events.filter(event => {
        const isWhatsApp = event.vendor === 'whatsapp_summary';
        return currentTab === 0 ? !isWhatsApp : isWhatsApp;
    });

    return (
        <Box sx={{
            padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
            maxWidth: '1440px',
            margin: '0 auto',
            position: 'relative',
            zIndex: 1
        }}>
            <PageHeader
                title="Audit"
                description="History of system events and scraping status"
                icon={<HistoryIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}
                onRefresh={fetchEvents}
            />

            <Box sx={{ mb: 3 }}>
                <Tabs
                    value={currentTab}
                    onChange={handleTabChange}
                    sx={{
                        '& .MuiTab-root': {
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            minHeight: '48px',
                            color: 'text.secondary',
                            '&.Mui-selected': {
                                color: 'primary.main',
                            }
                        }
                    }}
                >
                    <Tab label="Scrape Audit" />
                    <Tab label="Audit History" />
                </Tabs>
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
                ) : displayEvents.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                        <Typography color="text.secondary">No {currentTab === 0 ? 'scrape' : 'audit'} events found</Typography>
                    </Box>
                ) : (
                    <Table
                        rows={displayEvents}
                        rowKey={(row) => row.id}
                        emptyMessage="No events found"
                        expandedRowIds={expandedRows}
                        onRowToggle={(id) => toggleRow(id as number)}
                        columns={[
                            { id: 'created_at', label: 'Time', format: (val) => new Date(val).toLocaleString() },
                            { id: 'vendor', label: 'Vendor' },
                            ...(currentTab === 0 ? [{ id: 'start_date', label: 'Start Date', format: (val: any) => new Date(val).toLocaleDateString() }] : []),
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
                                format: (val, row) => {
                                    const hasDetails = !!(row.report_json || val);
                                    return (
                                        <Box sx={{
                                            maxWidth: '300px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            color: hasDetails ? 'primary.main' : 'inherit',
                                            fontWeight: hasDetails ? 600 : 400
                                        }} title={val}>
                                            {val || '-'}
                                            {hasDetails && ' (Click to view)'}
                                        </Box>
                                    );
                                }
                            }
                        ]}
                        renderSubRow={(row) => {
                            if (!row.report_json && !row.message) return null;
                            return (
                                <Box sx={{ p: 3, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', borderRadius: 2, m: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, opacity: 0.7 }}>
                                        {row.vendor === 'whatsapp_summary' ? 'Full Message Body:' : 'Scrape Result / Details:'}
                                    </Typography>
                                    <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', overflowX: 'auto', fontSize: '0.8125rem' }}>
                                        {row.vendor === 'whatsapp_summary' && row.report_json?.body
                                            ? row.report_json.body
                                            : row.report_json
                                                ? JSON.stringify(row.report_json, null, 2)
                                                : row.message}
                                    </Typography>
                                </Box>
                            );
                        }}
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
                                {(row.report_json || row.message) && (
                                    <Typography variant="caption" color="primary" sx={{ mt: 1, display: 'block', fontWeight: 600 }}>
                                        Tap to view {row.vendor === 'whatsapp_summary' ? 'summary body' : 'details'}
                                    </Typography>
                                )}
                            </Box>
                        )}
                    />
                )}
            </Box>
        </Box>
    );
}
