import { useState } from 'react';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import CopyAllIcon from '@mui/icons-material/CopyAll';
import RuleIcon from '@mui/icons-material/Rule';
import SaveIcon from '@mui/icons-material/Save';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import StorageIcon from '@mui/icons-material/Storage';
import Tooltip from '@mui/material/Tooltip';

interface ScrapeReportProps {
    report: any[];
    summary?: any; // Contains counts if report is partial or if just passed for convenience
}

export default function ScrapeReport({ report, summary }: ScrapeReportProps) {
    const [activeTab, setActiveTab] = useState(0);
    const theme = useTheme();

    if (!report || report.length === 0) {
        return (
            <Box sx={{ p: 4, textAlign: 'center', color: '#9ca3af' }}>
                <Typography variant="body2">No transactions in this report.</Typography>
            </Box>
        );
    }

    // Filter transactions based on active tab
    const getFilteredTransactions = () => {
        switch (activeTab) {
            case 0: // All
                return report;
            case 1: // New
                return report.filter(t => !t.isDuplicate && !t.isUpdate);
            case 2: // Updated
                return report.filter(t => t.isUpdate);
            case 3: // Duplicates
                return report.filter(t => t.isDuplicate);
            default:
                return report;
        }
    };

    const filteredTransactions = getFilteredTransactions();

    const counts = {
        all: report.length,
        new: report.filter(t => !t.isDuplicate && !t.isUpdate).length,
        updated: report.filter(t => t.isUpdate).length,
        duplicates: report.filter(t => t.isDuplicate).length
    };

    // Use passed summary or calculate from items
    const stats = summary || {
        savedTransactions: counts.new,
        updatedTransactions: counts.updated,
        duplicateTransactions: counts.duplicates
    };

    return (
        <Box sx={{ width: '100%' }}>
            {/* Summary Stats Cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
                <Paper elevation={0} sx={{
                    p: 2,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4',
                    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(34, 197, 94, 0.3)' : '#bbf7d0'}`,
                    borderRadius: 3,
                    textAlign: 'center'
                }}>
                    <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#4ade80' : '#166534', fontWeight: 700, mb: 0.5 }}>
                        {stats.savedTransactions || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#4ade80' : '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        New
                    </Typography>
                </Paper>
                <Paper elevation={0} sx={{
                    p: 2,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : '#bfdbfe'}`,
                    borderRadius: 3,
                    textAlign: 'center'
                }}>
                    <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1e40af', fontWeight: 700, mb: 0.5 }}>
                        {stats.updatedTransactions || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#60a5fa' : '#1e40af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Updated
                    </Typography>
                </Paper>
                <Paper elevation={0} sx={{
                    p: 2,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(251, 146, 60, 0.15)' : '#fff7ed',
                    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(251, 146, 60, 0.3)' : '#fed7aa'}`,
                    borderRadius: 3,
                    textAlign: 'center'
                }}>
                    <Typography variant="h4" sx={{ color: theme.palette.mode === 'dark' ? '#fb923c' : '#9a3412', fontWeight: 700, mb: 0.5 }}>
                        {stats.duplicateTransactions || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: theme.palette.mode === 'dark' ? '#fb923c' : '#9a3412', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Duplicates
                    </Typography>
                </Paper>
            </Box>

            {/* Detailed Report */}
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

                <Box sx={{ maxHeight: 600, overflowY: 'auto' }}>
                    {filteredTransactions.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center', color: '#9ca3af' }}>
                            <Typography variant="body2">No transactions found in this category.</Typography>
                        </Box>
                    ) : (
                        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', tableLayout: 'fixed' }}>
                            <Box component="thead" sx={{ position: 'sticky', top: 0, bgcolor: theme.palette.background.paper, zIndex: 1, boxShadow: `0 1px 2px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)'}` }}>
                                <tr style={{ borderBottom: `1px solid ${theme.palette.divider}`, textAlign: 'left', color: theme.palette.text.secondary }}>
                                    <th style={{ padding: '8px 12px', fontWeight: 600, width: '90px' }}>Date</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 600, width: '120px' }}>Account</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 600, width: '200px' }}>Description</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right', width: '100px' }}>Amount</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 600, width: '150px' }}>Category</th>
                                    <th style={{ padding: '8px 12px', fontWeight: 600, width: '100px' }}>Status</th>
                                </tr>
                            </Box>
                            <tbody>
                                {filteredTransactions.map((tx, idx) => (
                                    <tr key={idx} style={{
                                        borderBottom: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.1)' : '#f3f4f6'}`,
                                        backgroundColor: tx.isDuplicate
                                            ? (theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.05)' : '#fafaf9')
                                            : 'transparent',
                                    }}>
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
                                            {tx.isUpdate ? (
                                                <Chip size="small" label="Updated" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#dbeafe', color: '#1e40af' }} />
                                            ) : tx.isDuplicate ? (
                                                <Chip size="small" label="Duplicate" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f3f4f6', color: '#6b7280' }} />
                                            ) : tx.source === 'rule' ? (
                                                <Tooltip title={tx.rule ? `Rule: ${tx.rule}` : 'Rule'}>
                                                    <Chip size="small" label="Rule" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#e0f2fe', color: '#0369a1' }} />
                                                </Tooltip>
                                            ) : tx.source === 'cache' ? (
                                                <Chip size="small" label="Cache" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f3e8ff', color: '#6b21a8' }} />
                                            ) : (
                                                <Chip size="small" label="Saved" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#dcfce7', color: '#15803d' }} />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Box>
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
