import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, useTheme } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TransactionsTable from './CategoryDashboard/components/TransactionsTable';
import { useDateSelection } from '../context/DateSelectionContext';
import { logger } from '../utils/client-logger';

const RecentTransactionsModule: React.FC = () => {
    const theme = useTheme();
    const {
        selectedYear,
        selectedMonth,
        dateRangeMode,
        startDate,
        endDate,
        billingCycle
    } = useDateSelection();

    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchRecentTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (billingCycle) {
                params.set('billingCycle', billingCycle);
            } else if (startDate && endDate) {
                params.set('startDate', startDate);
                params.set('endDate', endDate);
            }
            params.set('limit', '50'); // Show top 50 recent

            const response = await fetch(`/api/transactions?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch transactions');
            const data = await response.json();
            setTransactions(data);
        } catch (error) {
            logger.error('Error fetching recent transactions', error as Error);
        } finally {
            setLoading(false);
        }
    }, [billingCycle, startDate, endDate]);

    useEffect(() => {
        if (billingCycle || (startDate && endDate)) {
            fetchRecentTransactions();
        }
    }, [fetchRecentTransactions, billingCycle, startDate, endDate]);

    return (
        <Box sx={{
            height: '100%',
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            border: `1px solid ${theme.palette.divider}`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
        }}>
            <Box sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderBottom: `1px solid ${theme.palette.divider}`,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
            }}>
                <ReceiptLongIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Recent Transactions</Typography>
            </Box>

            <Box sx={{
                flexGrow: 1,
                overflowY: 'auto',
                maxHeight: '480px', // Match BudgetModule height
                // Custom scrollbar for premium feel
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-track': { background: 'transparent' },
                '&::-webkit-scrollbar-thumb': {
                    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    borderRadius: '10px'
                },
                '&:hover::-webkit-scrollbar-thumb': {
                    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'
                }
            }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : transactions.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                        <Typography variant="body2">No transactions for this period</Typography>
                    </Box>
                ) : (
                    <TransactionsTable
                        transactions={transactions}
                        groupByDate={true}
                        disableWrapper={true}
                    />
                )}
            </Box>
        </Box>
    );
};

export default RecentTransactionsModule;
