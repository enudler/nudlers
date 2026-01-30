import React, { useState, useEffect, useCallback } from 'react';
import { useTheme, styled } from '@mui/material/styles';
import {
    Box,
    Typography,
    Grid,
    Card,
    CircularProgress,
    IconButton,
    Divider
} from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import RepeatIcon from '@mui/icons-material/Repeat';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import EventIcon from '@mui/icons-material/Event';
import { TextField, InputAdornment } from '@mui/material';
import PageHeader from './PageHeader';
import { logger } from '../utils/client-logger';

// Utility for formatting numbers
const formatNumber = (num: number) => {
    return new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: 'ILS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(num);
};

// Styled Components
const GlassCard = styled(Card)(({ }) => ({
    background: 'var(--n-glass-bg)',
    backdropFilter: 'blur(16px)',
    border: '1px solid var(--n-border)',
    borderRadius: '24px',
    padding: '24px',
    boxShadow: 'var(--n-card-shadow)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': {
        transform: 'translateY(-4px)',
        borderColor: 'var(--n-primary)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
    },
}));

const DetailRow = styled(Box)({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
});

const ValueBox = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
});

interface LinkedCard {
    cardName: string;
    cardNumber: string;
    pendingAmount: number;
}

interface PredictedRecurring {
    name: string;
    amount: number;
    date: string;
    isIncome: boolean;
}

interface ProjectionItem {
    bankAccountId: number;
    bankAccountName: string;
    bankAccountNumber: string;
    currentBalance: number;
    projectedCreditCardDeduction: number;
    projectedRecurringDeduction: number;
    bankActivityInCycle: number;
    projectedBalance: number;
    linkedCards: LinkedCard[];
    predictedRecurring: PredictedRecurring[];
}

interface ProjectionData {
    projectionDate: string;
    targetMonth: string;
    items: ProjectionItem[];
}

const ProjectionView: React.FC = () => {

    const [data, setData] = useState<ProjectionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [payrollDay, setPayrollDay] = useState<number>(1);

    const fetchProjection = useCallback(async (pDay?: number) => {
        setLoading(true);
        setError(null);
        try {
            const dayToUse = pDay ?? payrollDay;
            const response = await fetch(`/api/reports/projection?payrollDay=${dayToUse}`);
            if (!response.ok) throw new Error('Failed to fetch projection');
            const projectionData = await response.json();
            setData(projectionData);
            if (projectionData.payrollDay) {
                setPayrollDay(projectionData.payrollDay);
            }
        } catch (err) {
            logger.error('Error fetching projection', err);
            setError('Could not load projection data. Please try again later.');
        } finally {
            setLoading(false);
        }
    }, [payrollDay]);

    useEffect(() => {
        fetchProjection();
    }, [fetchProjection]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress sx={{ color: 'var(--n-primary)' }} />
            </Box>
        );
    }

    if (error || !data) {
        return (
            <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="error" variant="h6">{error || 'No data available'}</Typography>
                <IconButton onClick={() => fetchProjection()} sx={{ mt: 2, color: 'var(--n-primary)' }}>
                    <RefreshIcon />
                </IconButton>
            </Box>
        );
    }

    const [year, month] = data.targetMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, direction: 'ltr' }}>
            <PageHeader
                title="Balance Projection"
                description={`What your bank accounts will look like in ${monthName} ${year}`}
                icon={<TimelineIcon sx={{ color: 'var(--n-primary)' }} />}
                extraControls={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TextField
                            label="Payroll Day"
                            type="number"
                            size="small"
                            value={payrollDay}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1 && val <= 31) {
                                    setPayrollDay(val);
                                    fetchProjection(val);
                                }
                            }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <EventIcon sx={{ color: 'var(--n-primary)', fontSize: 20 }} />
                                    </InputAdornment>
                                ),
                                style: {
                                    borderRadius: '12px',
                                    background: 'var(--n-glass-bg)',
                                    width: '130px'
                                }
                            }}
                        />
                        <IconButton
                            onClick={() => fetchProjection()}
                            sx={{
                                background: 'var(--n-glass-bg)',
                                border: '1px solid var(--n-border)',
                                '&:hover': { background: 'rgba(59, 130, 246, 0.1)' }
                            }}
                        >
                            <RefreshIcon sx={{ color: 'var(--n-primary)' }} />
                        </IconButton>
                    </Box>
                }
            />

            <Grid container spacing={4} sx={{ mt: 2 }}>
                {data.items.map((item) => (
                    <Grid item xs={12} md={6} key={item.bankAccountId}>
                        <GlassCard>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                                <Box
                                    sx={{
                                        p: 1.5,
                                        borderRadius: '16px',
                                        background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                                        color: 'white'
                                    }}
                                >
                                    <AccountBalanceIcon />
                                </Box>
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'var(--n-text-primary)' }}>
                                        {item.bankAccountName}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'var(--n-text-secondary)' }}>
                                        •••• {item.bankAccountNumber.slice(-4)}
                                    </Typography>
                                </Box>
                            </Box>

                            <Box sx={{ mb: 4 }}>
                                <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                                    Current Balance
                                </Typography>
                                <Typography variant="h4" sx={{ fontWeight: 800, color: 'var(--n-text-primary)', mt: 0.5 }}>
                                    {formatNumber(item.currentBalance)}
                                </Typography>
                            </Box>

                            <Divider sx={{ my: 2, borderColor: 'var(--n-border)' }} />

                            <DetailRow>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <CreditCardIcon sx={{ color: '#ef4444', fontSize: 20 }} />
                                    <Typography variant="body1" sx={{ color: 'var(--n-text-primary)', fontWeight: 500 }}>
                                        Credit Card Charges
                                    </Typography>
                                </Box>
                                <ValueBox>
                                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#ef4444' }}>
                                        {formatNumber(item.projectedCreditCardDeduction)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                                        From {item.linkedCards.length} linked cards
                                    </Typography>
                                </ValueBox>
                            </DetailRow>

                            {item.linkedCards.map((card, idx) => (
                                <Box key={idx} sx={{ pl: 4.5, pb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                                        {card.cardName} (•••• {card.cardNumber.slice(-4)})
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'var(--n-text-secondary)' }}>
                                        {formatNumber(card.pendingAmount)}
                                    </Typography>
                                </Box>
                            ))}

                            <DetailRow>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <RepeatIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                                    <Typography variant="body1" sx={{ color: 'var(--n-text-primary)', fontWeight: 500 }}>
                                        Predicted Recurring
                                    </Typography>
                                </Box>
                                <ValueBox>
                                    <Typography variant="body1" sx={{ fontWeight: 700, color: item.projectedRecurringDeduction >= 0 ? '#10b981' : '#f59e0b' }}>
                                        {item.projectedRecurringDeduction > 0 ? '+' : ''}{formatNumber(item.projectedRecurringDeduction)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                                        Subscriptions & Expected Income
                                    </Typography>
                                </ValueBox>
                            </DetailRow>

                            {item.predictedRecurring.map((rec, idx) => (
                                <Box key={idx} sx={{ pl: 4.5, pb: 1, display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        {rec.name}
                                        {rec.isIncome && <Box component="span" sx={{ fontSize: '10px', px: 0.5, py: 0.1, borderRadius: '4px', bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>INCOME</Box>}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: rec.isIncome ? '#10b981' : 'var(--n-text-secondary)' }}>
                                        {rec.amount > 0 ? '+' : ''}{formatNumber(rec.amount)}
                                    </Typography>
                                </Box>
                            ))}

                            {item.bankActivityInCycle !== 0 && (
                                <DetailRow>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <AccountBalanceIcon sx={{ color: 'var(--n-text-secondary)', fontSize: 20 }} />
                                        <Typography variant="body1" sx={{ color: 'var(--n-text-primary)', fontWeight: 500 }}>
                                            Bank Activity in Cycle
                                        </Typography>
                                    </Box>
                                    <ValueBox>
                                        <Typography variant="body1" sx={{ fontWeight: 700, color: item.bankActivityInCycle > 0 ? '#10b981' : '#ef4444' }}>
                                            {item.bankActivityInCycle > 0 ? '+' : ''}{formatNumber(item.bankActivityInCycle)}
                                        </Typography>
                                    </ValueBox>
                                </DetailRow>
                            )}

                            <Box
                                sx={{
                                    mt: 4,
                                    p: 3,
                                    borderRadius: '20px',
                                    background: 'var(--n-bg-secondary)',
                                    border: '1px dashed var(--n-border)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                                        Projected Balance
                                    </Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 800, color: item.projectedBalance >= item.currentBalance ? '#10b981' : '#3b82f6', mt: 0.5 }}>
                                        {formatNumber(item.projectedBalance)}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    {item.projectedBalance >= item.currentBalance ? (
                                        <TrendingUpIcon sx={{ fontSize: 32, color: '#10b981' }} />
                                    ) : (
                                        <TrendingDownIcon sx={{ fontSize: 32, color: '#ef4444' }} />
                                    )}
                                </Box>
                            </Box>

                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                                    {formatNumber(item.currentBalance)}
                                </Typography>
                                <ArrowForwardIcon sx={{ fontSize: 14, color: 'var(--n-text-secondary)' }} />
                                <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                                    {formatNumber(item.projectedBalance)}
                                </Typography>
                            </Box>
                        </GlassCard>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default ProjectionView;
