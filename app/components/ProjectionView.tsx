import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Grid, Card, CardContent, CircularProgress, Chip, IconButton, Tooltip as MuiTooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import PageHeader from './PageHeader';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import RepeatIcon from '@mui/icons-material/Repeat';
import FilterListIcon from '@mui/icons-material/FilterList';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SettingsIcon from '@mui/icons-material/Settings';
import { format } from 'date-fns';

interface ProjectionData {
    date: string;
    balances: Record<string, number>;
    totalBalance: number;
    bankRecurring: Array<{ name: string; amount: number; category: string; account_number: string }>;
    ccPayments: Array<{ name: string; displayName: string; amount: number; vendor: string; account_number: string; count: number }>;
    dailyChange: number;
}

const ProjectionView: React.FC = () => {
    const theme = useTheme();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ProjectionData[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string | 'total'>('total');

    const fetchProjection = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/reports/projection');
            const result = await res.json();
            setData(result.projection);
            setAccounts(result.accounts);
        } catch (err) {
            console.error('Failed to fetch projection', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleVisibility = async (accountId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const response = await fetch(`/api/accounts/${accountId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_hidden: true }),
            });

            if (response.ok) {
                fetchProjection();
                window.dispatchEvent(new CustomEvent('dataRefresh'));
            }
        } catch (err) {
            console.error('Failed to hide account', err);
        }
    };

    useEffect(() => {
        fetchProjection();
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    const chartLabels = data.map(d => format(new Date(d.date), 'dd/MM'));

    // Prepare chart series based on selection
    const chartSeries = [];

    if (selectedAccount === 'total') {
        chartSeries.push({
            data: data.map(d => d.totalBalance),
            label: 'Total Balance',
            area: true,
            color: theme.palette.primary.main,
            showMark: false,
            valueFormatter: (v: number | null) => formatCurrency(v || 0),
        });
    } else {
        const acc = accounts.find(a => a.account_number === selectedAccount);
        chartSeries.push({
            data: data.map(d => d.balances[selectedAccount] || 0),
            label: acc?.nickname || 'Account',
            area: true,
            color: theme.palette.secondary.main,
            showMark: false,
            valueFormatter: (v: number | null) => formatCurrency(v || 0),
        });
    }

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: '1440px', margin: '0 auto' }}>
            <PageHeader
                title="Projected Balance"
                description="Financial forecast per bank account for the next 30 days"
                icon={<TimelineIcon sx={{ fontSize: 32, color: '#fff' }} />}
                onRefresh={fetchProjection}
            />

            <Grid container spacing={3}>
                {/* Balance Chart Area */}
                <Grid item xs={12}>
                    <Paper sx={{
                        p: 3,
                        borderRadius: '24px',
                        border: '1px solid var(--n-border)',
                        background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(20px)',
                    }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                {selectedAccount === 'total' ? 'Combined Outlook' : `${accounts.find(a => a.account_number === selectedAccount)?.nickname} Outlook`}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Chip
                                    label="All Accounts"
                                    onClick={() => setSelectedAccount('total')}
                                    color={selectedAccount === 'total' ? 'primary' : 'default'}
                                    variant={selectedAccount === 'total' ? 'filled' : 'outlined'}
                                    sx={{ fontWeight: 600 }}
                                />
                                {accounts.map(acc => (
                                    <Chip
                                        key={acc.account_number}
                                        label={acc.nickname}
                                        onClick={() => setSelectedAccount(acc.account_number)}
                                        color={selectedAccount === acc.account_number ? 'secondary' : 'default'}
                                        variant={selectedAccount === acc.account_number ? 'filled' : 'outlined'}
                                        sx={{ fontWeight: 600 }}
                                    />
                                ))}
                            </Box>
                        </Box>

                        <Box sx={{ height: 400, width: '100%' }}>
                            <LineChart
                                xAxis={[{
                                    data: chartLabels,
                                    scaleType: 'point',
                                    tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 11 }
                                }]}
                                series={chartSeries}
                                height={400}
                                margin={{ left: 80, right: 30, top: 20, bottom: 40 }}
                                sx={{
                                    '& .MuiAreaElement-root': {
                                        fillOpacity: 0.1,
                                    },
                                    '& .MuiLineElement-root': {
                                        strokeWidth: 3,
                                    }
                                }}
                            />
                        </Box>
                    </Paper>
                </Grid>

                {/* Account Cards */}
                <Grid item xs={12} md={4}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, px: 1 }}>Bank Balances</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {accounts.map((acc, idx) => (
                            <Card
                                key={idx}
                                onClick={() => setSelectedAccount(acc.account_number)}
                                sx={{
                                    borderRadius: '16px',
                                    cursor: 'pointer',
                                    border: selectedAccount === acc.account_number ? `2px solid ${theme.palette.secondary.main}` : '1px solid var(--n-border)',
                                    background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.2)' : 'rgba(255, 255, 255, 0.5)',
                                    transition: 'all 0.2s ease',
                                    '&:hover': { transform: 'translateY(-2px)', background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.3)' : 'rgba(255, 255, 255, 0.8)' }
                                }}
                            >
                                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: '16px !important' }}>
                                    <AccountBalanceIcon color={selectedAccount === acc.account_number ? "secondary" : "primary"} />
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{acc.nickname}</Typography>
                                        <Typography variant="caption" color="text.secondary">Ending in {acc.account_number.slice(-4)}</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{formatCurrency(acc.balance)}</Typography>
                                        <MuiTooltip title="Hide from reports">
                                            <IconButton
                                                size="small"
                                                onClick={(e) => handleToggleVisibility(acc.id, e)}
                                                sx={{ opacity: 0.3, '&:hover': { opacity: 1, color: 'warning.main' } }}
                                            >
                                                <VisibilityOffIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </MuiTooltip>
                                    </Box>
                                </CardContent>
                            </Card>
                        ))}
                    </Box>
                </Grid>

                {/* Movement Ledger */}
                <Grid item xs={12} md={8}>
                    <Typography variant="h6" sx={{ mb: 2, fontWeight: 700, px: 1 }}>
                        {selectedAccount === 'total' ? 'All Projected Movements' : 'Account Movements'}
                    </Typography>
                    <Box sx={{
                        maxHeight: '600px',
                        overflowY: 'auto',
                        pr: 1,
                        '&::-webkit-scrollbar': { width: '6px' },
                        '&::-webkit-scrollbar-thumb': { background: theme.palette.divider, borderRadius: '10px' }
                    }}>
                        {data
                            .filter(d => {
                                const movements = [...d.bankRecurring, ...d.ccPayments];
                                if (selectedAccount === 'total') return movements.length > 0;
                                return movements.some(m => m.account_number === selectedAccount);
                            })
                            .map((day, idx) => (
                                <Paper key={idx} sx={{
                                    p: 2, mb: 2, borderRadius: '16px',
                                    background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.8)',
                                    border: '1px solid var(--n-border)',
                                    backdropFilter: 'blur(10px)',
                                }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                            {format(new Date(day.date), 'EEEE, MMM do')}
                                        </Typography>
                                        <Typography variant="subtitle2" sx={{ opacity: 0.8, fontWeight: 600 }}>
                                            {selectedAccount === 'total' ? 'Total' : 'Balance'}: {formatCurrency(selectedAccount === 'total' ? day.totalBalance : day.balances[selectedAccount])}
                                        </Typography>
                                    </Box>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                        {/* Bank Recurring */}
                                        {day.bankRecurring
                                            .filter(br => selectedAccount === 'total' || br.account_number === selectedAccount)
                                            .map((br, i) => (
                                                <Box key={`br-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 2, pl: 1 }}>
                                                    <Box sx={{ p: 0.5, borderRadius: '6px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex' }}>
                                                        <RepeatIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                                                    </Box>
                                                    <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 500 }}>
                                                        {br.name}
                                                        {selectedAccount === 'total' && accounts.length > 1 && (
                                                            <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.6 }}>
                                                                ({accounts.find(a => a.account_number === br.account_number)?.nickname})
                                                            </Typography>
                                                        )}
                                                    </Typography>
                                                    <Typography variant="body2" color={br.amount < 0 ? "error.main" : "success.main"} sx={{ fontWeight: 700 }}>
                                                        {br.amount > 0 ? '+' : ''}{formatCurrency(br.amount)}
                                                    </Typography>
                                                </Box>
                                            ))}

                                        {/* CC Settlements */}
                                        {day.ccPayments
                                            .filter(cc => selectedAccount === 'total' || cc.account_number === selectedAccount)
                                            .map((cc, i) => (
                                                <Box key={`cc-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 2, pl: 1 }}>
                                                    <Box sx={{ p: 0.5, borderRadius: '6px', background: 'rgba(236, 72, 153, 0.1)', display: 'flex' }}>
                                                        <CreditCardIcon sx={{ fontSize: 16, color: '#ec4899' }} />
                                                    </Box>
                                                    <Box sx={{ flexGrow: 1 }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                            {cc.displayName}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            Settlement ({cc.count} items)
                                                            {selectedAccount === 'total' && accounts.length > 1 && (
                                                                <> • {accounts.find(a => a.account_number === cc.account_number)?.nickname}</>
                                                            )}
                                                        </Typography>
                                                    </Box>
                                                    <Typography variant="body2" color={cc.amount < 0 ? "error.main" : "success.main"} sx={{ fontWeight: 700 }}>
                                                        {cc.amount > 0 ? '+' : ''}{formatCurrency(cc.amount)}
                                                    </Typography>
                                                </Box>
                                            ))}
                                    </Box>
                                </Paper>
                            ))}
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ProjectionView;
