import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Paper, Grid, Card, CardContent, CircularProgress, Chip, IconButton, Tooltip as MuiTooltip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { LineChart } from '@mui/x-charts/LineChart';
import PageHeader from './PageHeader';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import RepeatIcon from '@mui/icons-material/Repeat';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import BlockIcon from '@mui/icons-material/Block';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import { format } from 'date-fns';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, MenuItem, Select, FormControl, InputLabel } from '@mui/material';

export interface ProjectionData {
    date: string;
    balances: Record<string, number>;
    totalBalance: number;
    bankRecurring: Array<{ name: string; amount: number; category: string; account_number: string }>;
    ccPayments: Array<{ name: string; displayName: string; amount: number; vendor: string; account_number: string; count: number }>;
    dailyChange: number;
}

interface NewRecurringState {
    name: string;
    amount: string;
    category: string;
    account_number: string;
    day_of_month: number;
    frequency: string;
}

interface ProjectionViewContentProps {
    loading: boolean;
    data: ProjectionData[];
    accounts: any[];
    selectedAccount: string | 'total';
    setSelectedAccount: (val: string | 'total') => void;
    categories: string[];
    isAddDialogOpen: boolean;
    setIsAddDialogOpen: (open: boolean) => void;
    newRecurring: NewRecurringState;
    setNewRecurring: React.Dispatch<React.SetStateAction<NewRecurringState>>;
    snackbar: { open: boolean; message: string; severity: 'success' | 'error' };
    setSnackbar: React.Dispatch<React.SetStateAction<{ open: boolean; message: string; severity: 'success' | 'error' }>>;
    onRefresh: () => void;
    onToggleVisibility: (accountId: number, e: React.MouseEvent) => void;
    onMarkNotRecurring: (name: string, account_number: string) => void;
    onAddRecurring: () => void;
}

export const ProjectionViewContent: React.FC<ProjectionViewContentProps> = ({
    loading,
    data,
    accounts,
    selectedAccount,
    setSelectedAccount,
    categories,
    isAddDialogOpen,
    setIsAddDialogOpen,
    newRecurring,
    setNewRecurring,
    snackbar,
    setSnackbar,
    onRefresh,
    onToggleVisibility,
    onMarkNotRecurring,
    onAddRecurring
}) => {
    const theme = useTheme();

    // Refs for synchronization
    const graphScrollRef = useRef<HTMLDivElement>(null);
    const listScrollRef = useRef<HTMLDivElement>(null);
    const isInteracting = useRef<'graph' | 'list' | null>(null);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
    };

    // Sync scroll from graph to list
    const onGraphScroll = useCallback(() => {
        if (isInteracting.current === 'list') return;
        isInteracting.current = 'graph';

        if (graphScrollRef.current && listScrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = graphScrollRef.current;
            const maxScrollLeft = scrollWidth - clientWidth;
            if (maxScrollLeft <= 0) return;

            const ratio = scrollLeft / maxScrollLeft;
            const { scrollHeight, clientHeight } = listScrollRef.current;
            listScrollRef.current.scrollTop = ratio * (scrollHeight - clientHeight);
        }

        setTimeout(() => { isInteracting.current = null; }, 50);
    }, []);

    // Sync scroll from list to graph
    const onListScroll = useCallback(() => {
        if (isInteracting.current === 'graph') return;
        isInteracting.current = 'list';

        if (graphScrollRef.current && listScrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = listScrollRef.current;
            const maxScrollTop = scrollHeight - clientHeight;
            if (maxScrollTop <= 0) return;

            const ratio = scrollTop / maxScrollTop;
            const { scrollWidth, clientWidth } = graphScrollRef.current;
            graphScrollRef.current.scrollLeft = ratio * (scrollWidth - clientWidth);
        }

        setTimeout(() => { isInteracting.current = null; }, 50);
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    const chartLabels = data.map(d => format(new Date(d.date), 'dd/MM'));

    // Calculate Y range for dynamic gradient
    const allValues = selectedAccount === 'total'
        ? data.map(d => d.totalBalance)
        : data.map(d => d.balances[selectedAccount] || 0);
    const minVal = Math.min(...allValues, 0);
    const maxVal = Math.max(...allValues, 0);
    const range = maxVal - minVal;
    const zeroPos = range === 0 ? 0 : (maxVal / range) * 100;

    // Prepare chart series based on selection
    const chartSeries = [];
    if (selectedAccount === 'total') {
        chartSeries.push({
            data: data.map(d => d.totalBalance),
            label: 'Total Balance',
            area: true,
            color: theme.palette.primary.main,
            showMark: true,
            valueFormatter: (v: number | null) => formatCurrency(v || 0),
        });
    } else {
        const acc = accounts.find(a => a.account_number === selectedAccount);
        chartSeries.push({
            data: data.map(d => d.balances[selectedAccount] || 0),
            label: acc?.nickname || 'Account',
            area: true,
            color: theme.palette.primary.main,
            showMark: true,
            valueFormatter: (v: number | null) => formatCurrency(v || 0),
        });
    }

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: '1600px', margin: '0 auto', height: { xs: 'auto', md: 'calc(100vh - 60px)' }, minHeight: { xs: '100vh', md: 0 }, display: 'flex', flexDirection: 'column' }}>
            <PageHeader
                title="Financial Forecast"
                description="30-day balance projection and scheduled movements"
                icon={<TimelineIcon sx={{ fontSize: 32 }} className="gradient-text" />}
                onRefresh={onRefresh}
            />

            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: 4,
                flexGrow: 1,
                minHeight: 0,
            }}>
                {/* LEFT SIDE: Sticky Graph & Accounts */}
                <Box sx={{
                    flex: { lg: 1.8, md: 1.5, xs: 1 },
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                    height: { xs: 'auto', md: '100%' },
                    position: { xs: 'static', md: 'sticky' },
                    top: 0
                }}>
                    {/* Account Quick Select */}
                    <Box className="n-glass" sx={{ p: 2, borderRadius: '20px', display: 'flex', gap: 1, overflowX: 'auto', flexShrink: 0 }}>
                        <Chip
                            label="Unified View"
                            onClick={() => setSelectedAccount('total')}
                            className={selectedAccount === 'total' ? 'n-btn-primary' : ''}
                            sx={{
                                fontWeight: 600,
                                borderRadius: '12px',
                                background: selectedAccount === 'total' ? undefined : 'transparent'
                            }}
                            variant={selectedAccount === 'total' ? 'filled' : 'outlined'}
                        />
                        {accounts.map(acc => (
                            <Chip
                                key={acc.account_number}
                                label={acc.nickname}
                                onClick={() => setSelectedAccount(acc.account_number)}
                                color={selectedAccount === acc.account_number ? 'primary' : 'default'}
                                variant={selectedAccount === acc.account_number ? 'filled' : 'outlined'}
                                sx={{ fontWeight: 600, borderRadius: '12px' }}
                            />
                        ))}
                    </Box>

                    {/* Main Chart Container */}
                    <Box className="n-card n-glass" sx={{
                        flexGrow: 1,
                        p: 3,
                        borderRadius: '32px',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: { xs: '450px', md: 0 },
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <TimelineIcon color="primary" /> Balance Projection
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<AddIcon />}
                                    onClick={() => setIsAddDialogOpen(true)}
                                    sx={{
                                        borderRadius: '12px',
                                        textTransform: 'none',
                                        background: 'var(--n-primary)',
                                        fontWeight: 700
                                    }}
                                >
                                    Add Recurring
                                </Button>
                            </Box>
                        </Box>

                        <Box
                            ref={graphScrollRef}
                            onScroll={onGraphScroll}
                            sx={{
                                flexGrow: 1,
                                overflowX: 'auto',
                                overflowY: 'hidden',
                                '&::-webkit-scrollbar': { height: '6px' },
                                '&::-webkit-scrollbar-thumb': { background: theme.palette.divider, borderRadius: '10px' }
                            }}
                        >
                            <Box sx={{ width: '200%', height: { xs: '320px', md: '100%' } }}>
                                <LineChart
                                    xAxis={[{
                                        data: chartLabels,
                                        scaleType: 'point',
                                        tickLabelStyle: { fill: theme.palette.text.secondary, fontSize: 10, fontWeight: 600 }
                                    }]}
                                    series={chartSeries.map(s => ({
                                        ...s,
                                        area: true,
                                    }))}
                                    margin={{ left: 70, right: 30, top: 20, bottom: 40 }}
                                    sx={{
                                        '& .MuiAreaElement-root': {
                                            fill: `url(#areaGradient)`,
                                        },
                                        '& .MuiLineElement-root': {
                                            strokeWidth: 4,
                                            stroke: `url(#lineGradient)`,
                                        },
                                        '& .MuiMarkElement-root': {
                                            stroke: theme.palette.primary.main,
                                            strokeWidth: 2,
                                            fill: theme.palette.background.paper,
                                            scale: '0.6',
                                        }
                                    }}
                                    slotProps={{
                                        legend: { hidden: true }
                                    }}
                                >
                                    <defs>
                                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset={`${zeroPos}%`} stopColor={theme.palette.primary.main} stopOpacity={0.6} />
                                            <stop offset={`${zeroPos}%`} stopColor={theme.palette.error.main} stopOpacity={0.6} />
                                        </linearGradient>
                                        <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset={`${zeroPos}%`} stopColor={theme.palette.primary.main} />
                                            <stop offset={`${zeroPos}%`} stopColor={theme.palette.error.main} />
                                        </linearGradient>
                                    </defs>
                                </LineChart>
                            </Box>
                        </Box>

                        {/* Legend/Info */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, alignItems: 'center' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                                ← Slide to explore future dates
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 3 }}>
                                {accounts.map(acc => (
                                    <Box key={acc.account_number} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                                        <Typography variant="caption" sx={{ fontWeight: 700 }}>{formatCurrency(acc.balance)}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* RIGHT SIDE: Scrollable Ledger */}
                <Box sx={{
                    flex: 1.2,
                    display: 'flex',
                    flexDirection: 'column',
                    height: { xs: 'auto', md: '100%' },
                    minHeight: 0
                }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, px: 1 }}>
                        Upcoming Movements
                    </Typography>

                    <Box
                        ref={listScrollRef}
                        onScroll={onListScroll}
                        sx={{
                            flexGrow: 1,
                            overflowY: { xs: 'visible', md: 'auto' },
                            pr: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            '&::-webkit-scrollbar': { width: '6px' },
                            '&::-webkit-scrollbar-thumb': { background: theme.palette.divider, borderRadius: '10px' }
                        }}
                    >
                        {data.map((day, idx) => {
                            const movements = [...day.bankRecurring, ...day.ccPayments].filter(m => selectedAccount === 'total' || m.account_number === selectedAccount);
                            if (movements.length === 0) return null;

                            return (
                                <Box
                                    key={idx}
                                    id={`day-ledger-${idx}`}
                                    className="n-card n-card-hover"
                                    sx={{
                                        p: 2.5,
                                        borderRadius: '24px',
                                        background: theme.palette.mode === 'dark' ? 'rgba(30,30,30,0.4)' : 'white'
                                    }}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                                        <Box>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main' }}>
                                                {format(new Date(day.date), 'EEEE')}
                                            </Typography>
                                            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                                {format(new Date(day.date), 'MMM do')}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Projected Balance</Typography>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                                {formatCurrency(selectedAccount === 'total' ? day.totalBalance : day.balances[selectedAccount])}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                        {day.bankRecurring
                                            .filter(br => selectedAccount === 'total' || br.account_number === selectedAccount)
                                            .map((br, i) => (
                                                <Box key={`br-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <Box sx={{ p: 0.8, borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', display: 'flex' }}>
                                                        <RepeatIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                                                    </Box>
                                                    <Box sx={{ flexGrow: 1 }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                            {br.name}
                                                            {(br as any).is_manual && <Chip label="Manual" size="small" sx={{ height: 16, fontSize: '9px', ml: 1, bgcolor: 'secondary.main', color: 'white' }} />}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Standard Recurring</Typography>
                                                    </Box>
                                                    <Typography variant="body2" color={br.amount < 0 ? "error.main" : "success.main"} sx={{ fontWeight: 800 }}>
                                                        {br.amount > 0 ? '+' : ''}{formatCurrency(br.amount)}
                                                    </Typography>
                                                    <MuiTooltip title="Stop projecting this recurring item">
                                                        <IconButton
                                                            size="small"
                                                            sx={{ ml: 1, opacity: 0.1, '&:hover': { opacity: 1, color: 'error.main' } }}
                                                            onClick={(e) => { e.stopPropagation(); onMarkNotRecurring(br.name, br.account_number); }}
                                                        >
                                                            <BlockIcon sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </MuiTooltip>
                                                </Box>
                                            ))}

                                        {day.ccPayments
                                            .filter(cc => selectedAccount === 'total' || cc.account_number === selectedAccount)
                                            .map((cc, i) => (
                                                <Box key={`cc-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                    <Box sx={{ p: 0.8, borderRadius: '10px', background: 'rgba(236, 72, 153, 0.1)', display: 'flex' }}>
                                                        <CreditCardIcon sx={{ fontSize: 18, color: '#ec4899' }} />
                                                    </Box>
                                                    <Box sx={{ flexGrow: 1 }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{cc.displayName}</Typography>
                                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>CC Settlement ({cc.count} items)</Typography>
                                                    </Box>
                                                    <Typography variant="body2" color={cc.amount < 0 ? "error.main" : "success.main"} sx={{ fontWeight: 800 }}>
                                                        {cc.amount > 0 ? '+' : ''}{formatCurrency(cc.amount)}
                                                    </Typography>
                                                </Box>
                                            ))}
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            </Box>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert severity={snackbar.severity} sx={{ borderRadius: '12px', fontWeight: 600 }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>

            {/* Add Recurring Dialog */}
            <Dialog
                open={isAddDialogOpen}
                onClose={() => setIsAddDialogOpen(false)}
                PaperProps={{
                    className: 'n-glass',
                    sx: { borderRadius: '24px', width: { xs: '100%', sm: '400px' }, maxWidth: '100%', m: 2 }
                }}
            >
                <DialogTitle sx={{ fontWeight: 800 }}>Add Recurring Payment</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <TextField
                            label="Payment Name"
                            fullWidth
                            variant="outlined"
                            value={newRecurring.name}
                            onChange={(e) => setNewRecurring(prev => ({ ...prev, name: e.target.value }))}
                        />
                        <TextField
                            label="Amount (Negative for expense)"
                            type="number"
                            fullWidth
                            variant="outlined"
                            value={newRecurring.amount}
                            onChange={(e) => setNewRecurring(prev => ({ ...prev, amount: e.target.value }))}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Category</InputLabel>
                            <Select
                                value={newRecurring.category}
                                label="Category"
                                onChange={(e) => setNewRecurring(prev => ({ ...prev, category: e.target.value }))}
                            >
                                {categories.map(cat => (
                                    <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth>
                            <InputLabel>Bank Account</InputLabel>
                            <Select
                                value={newRecurring.account_number}
                                label="Bank Account"
                                onChange={(e) => setNewRecurring(prev => ({ ...prev, account_number: e.target.value }))}
                            >
                                {accounts.map(acc => (
                                    <MenuItem key={acc.account_number} value={acc.account_number}>{acc.nickname} (..{acc.account_number.slice(-4)})</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label="Day of Month"
                            type="number"
                            fullWidth
                            variant="outlined"
                            inputProps={{ min: 1, max: 31 }}
                            value={newRecurring.day_of_month}
                            onChange={(e) => setNewRecurring(prev => ({ ...prev, day_of_month: parseInt(e.target.value) || 1 }))}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setIsAddDialogOpen(false)} color="inherit">Cancel</Button>
                    <Button
                        onClick={onAddRecurring}
                        variant="contained"
                        color="primary"
                        startIcon={<SaveIcon />}
                        sx={{ borderRadius: '12px' }}
                    >
                        Save Recurring
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const ProjectionView: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ProjectionData[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string | 'total'>('total');
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [categories, setCategories] = useState<string[]>([]);
    const [newRecurring, setNewRecurring] = useState({
        name: '',
        amount: '',
        category: '',
        account_number: '',
        day_of_month: new Date().getDate(),
        frequency: 'monthly'
    });

    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success'
    });

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

    const handleMarkNotRecurring = async (name: string, account_number: string) => {
        try {
            const response = await fetch('/api/reports/non-recurring-exclusions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    account_number
                }),
            });
            if (!response.ok) throw new Error('Failed to mark as non-recurring');
            setSnackbar({ open: true, message: `"${name}" excluded from recurring projections`, severity: 'success' });
            fetchProjection();
            window.dispatchEvent(new CustomEvent('dataRefresh'));
        } catch (err) {
            console.error('Error marking as non-recurring', err);
            setSnackbar({ open: true, message: 'Failed to exclude recurring payment', severity: 'error' });
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/categories');
            const result = await res.json();
            if (Array.isArray(result)) {
                setCategories(result.map((c: any) => c.name || c));
            }
        } catch (err) {
            console.error('Failed to fetch categories', err);
        }
    };

    const handleAddRecurring = async () => {
        try {
            const res = await fetch('/api/finance/recurring', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newRecurring,
                    amount: parseFloat(newRecurring.amount)
                }),
            });
            if (res.ok) {
                setSnackbar({ open: true, message: 'Recurring payment added', severity: 'success' });
                setIsAddDialogOpen(false);
                setNewRecurring({
                    name: '',
                    amount: '',
                    category: '',
                    account_number: '',
                    day_of_month: new Date().getDate(),
                    frequency: 'monthly'
                });
                fetchProjection();
            }
        } catch (err) {
            console.error('Failed to add recurring', err);
            setSnackbar({ open: true, message: 'Failed to add recurring payment', severity: 'error' });
        }
    };

    useEffect(() => {
        fetchProjection();
        fetchCategories();
    }, []);

    return (
        <ProjectionViewContent
            loading={loading}
            data={data}
            accounts={accounts}
            selectedAccount={selectedAccount}
            setSelectedAccount={setSelectedAccount}
            categories={categories}
            isAddDialogOpen={isAddDialogOpen}
            setIsAddDialogOpen={setIsAddDialogOpen}
            newRecurring={newRecurring}
            setNewRecurring={setNewRecurring}
            snackbar={snackbar}
            setSnackbar={setSnackbar}
            onRefresh={fetchProjection}
            onToggleVisibility={handleToggleVisibility}
            onMarkNotRecurring={handleMarkNotRecurring}
            onAddRecurring={handleAddRecurring}
        />
    );
};


export default ProjectionView;
