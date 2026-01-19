import React, { useState } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import RuleIcon from '@mui/icons-material/Rule';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import StorageIcon from '@mui/icons-material/Storage';
import Tooltip from '@mui/material/Tooltip';

interface ScrapeReportProps {
    report: any[];
    summary?: any; // Contains counts if report is partial or if just passed for convenience
}

// Custom table components for Virtuoso to preserve styling
const Scroller = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div {...props} ref={ref} style={{ ...props.style, overflowY: 'auto' }} />
));
Scroller.displayName = 'VirtuosoScroller';

const Table = (props: React.HTMLAttributes<HTMLTableElement>) => (
    <table {...props} style={{ ...props.style, width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.8rem', tableLayout: 'fixed' }} />
);
Table.displayName = 'VirtuosoTable';

const TableHead = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => (
    <thead {...props} ref={ref} style={{
        ...props.style,
        position: 'sticky',
        top: 0,
        backgroundColor: 'var(--table-header-bg)',
        zIndex: 10,
        boxShadow: '0 2px 4px var(--table-header-shadow)'
    }} />
));
TableHead.displayName = 'VirtuosoTableHead';

const TableRow = (props: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...props} />;
TableRow.displayName = 'VirtuosoTableRow';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>((props, ref) => <tbody {...props} ref={ref} />);
TableBody.displayName = 'VirtuosoTableBody';

const VirtuosoTableComponents = {
    Scroller,
    Table,
    TableHead,
    TableRow,
    TableBody,
};

export default function ScrapeReport({ report, summary }: ScrapeReportProps) {
    const [activeTab, setActiveTab] = useState(0);
    const theme = useTheme();

    // Set CSS variables for Virtuoso components to access theme colors
    const virtuosoStyles = {
        '--table-header-bg': theme.palette.background.paper,
        '--table-header-shadow': theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
    } as React.CSSProperties;

    const reportData = report || [];

    const counts = {
        all: reportData.length,
        new: reportData.filter(t => !t.isDuplicate && !t.isUpdate).length,
        updated: reportData.filter(t => t.isUpdate).length,
        duplicates: reportData.filter(t => t.isDuplicate).length
    };

    // Calculate categorization stats from report if not provided in summary
    const reportStats = {
        cachedCategories: reportData.filter(t => t.source === 'cache').length,
        ruleCategories: reportData.filter(t => t.source === 'rule').length,
        scraperCategories: reportData.filter(t => (t.source === 'scraper' || !t.source)).length,
    };

    // Use passed summary or calculate from items
    const stats = {
        savedTransactions: summary?.savedTransactions ?? counts.new,
        updatedTransactions: summary?.updatedTransactions ?? counts.updated,
        duplicateTransactions: summary?.duplicateTransactions ?? counts.duplicates,
        durationSeconds: summary?.durationSeconds ?? summary?.duration_seconds ?? 0,
        cachedCategories: summary?.cachedCategories ?? reportStats.cachedCategories,
        ruleCategories: summary?.ruleCategories ?? reportStats.ruleCategories,
        scraperCategories: summary?.scraperCategories ?? reportStats.scraperCategories,
    };

    const formatDuration = (seconds: number) => {
        if (seconds === undefined || seconds === null) return '--';
        const min = Math.floor(seconds / 60);
        const sec = Math.round(seconds % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    if (reportData.length === 0) {
        return (
            <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.3)' : '#bbf7d0'}`, borderRadius: 3, textAlign: 'center' }}>
                        <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#4ade80' : '#166534', fontWeight: 700, mb: 0.5 }}>0</Typography>
                        <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#4ade80' : '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>New</Typography>
                    </Paper>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe'}`, borderRadius: 3, textAlign: 'center' }}>
                        <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1e40af', fontWeight: 700, mb: 0.5 }}>0</Typography>
                        <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1e40af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Updated</Typography>
                    </Paper>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(251, 146, 60, 0.15)' : '#fff7ed', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(251, 146, 60, 0.3)' : '#fed7aa'}`, borderRadius: 3, textAlign: 'center' }}>
                        <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#fb923c' : '#9a3412', fontWeight: 700, mb: 0.5 }}>{stats.duplicateTransactions}</Typography>
                        <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#fb923c' : '#9a3412', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Duplicates</Typography>
                    </Paper>
                    <Paper elevation={0} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(167, 139, 250, 0.15)' : '#f5f3ff', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(167, 139, 250, 0.3)' : '#ddd6fe'}`, borderRadius: 3, textAlign: 'center' }}>
                        <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#a78bfa' : '#5b21b6', fontWeight: 700, mb: 0.5 }}>
                            {formatDuration(stats.durationSeconds)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#a78bfa' : '#5b21b6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Time</Typography>
                    </Paper>
                </Box>
                <Box sx={{ p: 4, textAlign: 'center', color: '#9ca3af', border: `1px dashed ${theme.palette.divider}`, borderRadius: 3 }}>
                    <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>No transactions found for this period.</Typography>
                    <Typography variant="body2">The bank or credit card company returned no transaction data for the selected dates.</Typography>
                </Box>
            </Box>
        );
    }

    const getFilteredTransactions = () => {
        switch (activeTab) {
            case 0: return reportData;
            case 1: return reportData.filter(t => !t.isDuplicate && !t.isUpdate);
            case 2: return reportData.filter(t => t.isUpdate);
            case 3: return reportData.filter(t => t.isDuplicate);
            default: return reportData;
        }
    };

    const filteredTransactions = getFilteredTransactions();

    const renderTableHeader = () => (
        <tr style={{ color: theme.palette.text.secondary }}>
            <th style={{ padding: '10px 12px', fontWeight: 600, width: '90px', textAlign: 'left', borderBottom: `1px solid ${theme.palette.divider}` }}>Date</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, width: '120px', textAlign: 'left', borderBottom: `1px solid ${theme.palette.divider}` }}>Account</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, width: '200px', textAlign: 'left', borderBottom: `1px solid ${theme.palette.divider}` }}>Description</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right', width: '100px', borderBottom: `1px solid ${theme.palette.divider}` }}>Amount</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, width: '150px', textAlign: 'left', borderBottom: `1px solid ${theme.palette.divider}` }}>Category</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, width: '100px', textAlign: 'left', borderBottom: `1px solid ${theme.palette.divider}` }}>Status</th>
        </tr>
    );

    const renderRow = (_idx: number, tx: any) => (
        <>
            <td style={{ padding: '6px 12px', color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>
                {new Date(tx.date).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' })}
            </td>
            <td style={{ padding: '6px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tx.accountName ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {tx.accountName}
                    </Typography>
                ) : tx.cardLast4 ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <CreditCardIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
                        <Typography variant="caption" sx={{ color: '#6b7280', fontFamily: 'monospace' }}>
                            ••••{tx.cardLast4}
                        </Typography>
                    </Box>
                ) : '-'}
            </td>
            <td style={{ padding: '6px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Typography variant="caption" sx={{ color: 'text.primary' }} title={tx.description || tx.name || '-'}>
                    {tx.description || tx.name || '-'}
                </Typography>
            </td>
            <td style={{ padding: '6px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Typography variant="body2" sx={{
                    color: tx.amount < 0 ? '#ef4444' : '#22c55e',
                    fontSize: '0.8rem',
                    fontWeight: 600
                }}>
                    {Math.abs(tx.amount).toFixed(2)}
                </Typography>
            </td>
            <td style={{ padding: '6px 12px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{
                        color: theme.palette.text.primary,
                        width: 'fit-content',
                        fontSize: '0.75rem',
                        bgcolor: tx.isUpdate
                            ? (theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff')
                            : (theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.1)' : '#f3f4f6'),
                        px: 1,
                        py: 0.25,
                        borderRadius: 1,
                        border: tx.isUpdate
                            ? `1px solid ${theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe'}`
                            : '1px solid transparent',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {tx.isUpdate && tx.oldCategory ? (
                            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>
                                    {tx.oldCategory}
                                </span>
                                <span style={{ color: '#9ca3af' }}>→</span>
                                <span style={{ fontWeight: 600, color: '#1e40af' }}>
                                    {tx.category || '-'}
                                </span>
                            </Box>
                        ) : (
                            tx.category || '-'
                        )}
                    </Typography>
                </Box>
            </td>
            <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'nowrap', alignItems: 'center' }}>
                    {tx.isUpdate ? (
                        <Chip size="small" label="Updated" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#dbeafe', color: '#1e40af' }} />
                    ) : tx.isDuplicate ? (
                        <Chip size="small" label="Duplicate" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f3f4f6', color: '#6b7280' }} />
                    ) : null}

                    {tx.source === 'rule' ? (
                        <Tooltip title={tx.rule ? `Rule: ${tx.rule}` : 'Rule match'}>
                            <Chip size="small" label="Rule" icon={<RuleIcon sx={{ fontSize: '10px !important' }} />} sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#e0f2fe', color: '#0369a1', '& .MuiChip-icon': { color: 'inherit' } }} />
                        </Tooltip>
                    ) : tx.source === 'cache' ? (
                        <Chip size="small" label="Cache" icon={<StorageIcon sx={{ fontSize: '10px !important' }} />} sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f3e8ff', color: '#6b21a8', '& .MuiChip-icon': { color: 'inherit' } }} />
                    ) : tx.source === 'scraper' ? (
                        <Chip size="small" label="Scraper" icon={<AutorenewIcon sx={{ fontSize: '10px !important' }} />} sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#dcfce7', color: '#15803d', '& .MuiChip-icon': { color: 'inherit' } }} />
                    ) : (!tx.isUpdate && !tx.isDuplicate) && (
                        <Chip size="small" label="Saved" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f3f4f6', color: '#6b7280' }} />
                    )}
                </Box>
            </td>
        </>
    );

    return (
        <Box sx={{ width: '100%', ...virtuosoStyles }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
                <Paper elevation={0} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.3)' : '#bbf7d0'}`, borderRadius: 3, textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#4ade80' : '#166534', fontWeight: 700, mb: 0.5 }}>{stats.savedTransactions || 0}</Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#4ade80' : '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>New</Typography>
                </Paper>
                <Paper elevation={0} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe'}`, borderRadius: 3, textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1e40af', fontWeight: 700, mb: 0.5 }}>{stats.updatedTransactions || 0}</Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1e40af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Updated</Typography>
                </Paper>
                <Paper elevation={0} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(251, 146, 60, 0.15)' : '#fff7ed', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(251, 146, 60, 0.3)' : '#fed7aa'}`, borderRadius: 3, textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#fb923c' : '#9a3412', fontWeight: 700, mb: 0.5 }}>{stats.duplicateTransactions || 0}</Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#fb923c' : '#9a3412', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Duplicates</Typography>
                </Paper>
                <Paper elevation={0} sx={{ p: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(167, 139, 250, 0.15)' : '#f5f3ff', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(167, 139, 250, 0.3)' : '#ddd6fe'}`, borderRadius: 3, textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#a78bfa' : '#5b21b6', fontWeight: 700, mb: 0.5 }}>{formatDuration(stats.durationSeconds)}</Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#a78bfa' : '#5b21b6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Time</Typography>
                </Paper>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
                <Paper elevation={0} sx={{ p: 1.5, bgcolor: theme.palette.mode === 'dark' ? 'rgba(168, 85, 247, 0.05)' : '#faf5ff', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(168, 85, 247, 0.2)' : '#f3e8ff'}`, borderRadius: 3, textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
                        <StorageIcon sx={{ fontSize: 16, color: theme.palette.mode === 'dark' ? '#a855f7' : '#6b21a8' }} />
                        <Typography variant="h6" sx={{ color: theme.palette.mode === 'dark' ? '#a855f7' : '#6b21a8', fontWeight: 700 }}>{stats.cachedCategories || 0}</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#a855f7' : '#6b21a8', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 0.5 }}>From Cache</Typography>
                </Paper>
                <Paper elevation={0} sx={{ p: 1.5, bgcolor: theme.palette.mode === 'dark' ? 'rgba(14, 165, 233, 0.05)' : '#f0f9ff', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(14, 165, 233, 0.2)' : '#e0f2fe'}`, borderRadius: 3, textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
                        <RuleIcon sx={{ fontSize: 16, color: theme.palette.mode === 'dark' ? '#0ea5e9' : '#0369a1' }} />
                        <Typography variant="h6" sx={{ color: theme.palette.mode === 'dark' ? '#0ea5e9' : '#0369a1', fontWeight: 700 }}>{stats.ruleCategories || 0}</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#0ea5e9' : '#0369a1', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 0.5 }}>From Rules</Typography>
                </Paper>
                <Paper elevation={0} sx={{ p: 1.5, bgcolor: theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.05)' : '#f0fdf4', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7'}`, borderRadius: 3, textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 0.5 }}>
                        <AutorenewIcon sx={{ fontSize: 16, color: theme.palette.mode === 'dark' ? '#4ade80' : '#15803d' }} />
                        <Typography variant="h6" sx={{ color: theme.palette.mode === 'dark' ? '#4ade80' : '#15803d', fontWeight: 700 }}>{stats.scraperCategories || 0}</Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#4ade80' : '#15803d', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 0.5 }}>From Scraper</Typography>
                </Paper>
            </Box>

            <Paper elevation={0} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 3, overflow: 'hidden', bgcolor: theme.palette.background.paper }}>
                <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <Tabs
                        value={activeTab}
                        onChange={(_, v) => setActiveTab(v)}
                        variant="fullWidth"
                        sx={{
                            minHeight: 48,
                            '& .MuiTab-root': { textTransform: 'none', fontSize: '0.9rem', fontWeight: 500, minHeight: 48 },
                            '& .Mui-selected': { fontWeight: 700 }
                        }}
                    >
                        <Tab label="All" />
                        <Tab label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                New
                                {counts.new > 0 && <Chip label={counts.new} size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#bbf7d0', color: '#166534' }} />}
                            </Box>
                        } />
                        <Tab label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                Updated
                                {counts.updated > 0 && <Chip label={counts.updated} size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#bfdbfe', color: '#1e40af' }} />}
                            </Box>
                        } />
                        <Tab label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                Skipped
                                {counts.duplicates > 0 && <Chip label={counts.duplicates} size="small" sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#fed7aa', color: '#9a3412' }} />}
                            </Box>
                        } />
                    </Tabs>
                </Box>

                <Box sx={{ height: 600, overflow: 'hidden' }}>
                    {filteredTransactions.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center', color: '#9ca3af' }}>
                            <Typography variant="body2">No transactions found in this category.</Typography>
                        </Box>
                    ) : (
                        <TableVirtuoso
                            style={{ height: 600 }}
                            data={filteredTransactions}
                            components={VirtuosoTableComponents}
                            fixedHeaderContent={renderTableHeader}
                            itemContent={(idx, tx) => renderRow(idx, tx)}
                        />
                    )}
                </Box>
                <Box sx={{ p: 1, bgcolor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.3)' : '#f9fafb', borderTop: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Showing {filteredTransactions.length} of {report.length} records
                    </Typography>
                </Box>
            </Paper>
        </Box>
    );
}
