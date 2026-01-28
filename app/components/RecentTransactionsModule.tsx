import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, CircularProgress, useTheme } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TransactionsTable from './CategoryDashboard/components/TransactionsTable';
import { useDateSelection } from '../context/DateSelectionContext';
import { logger } from '../utils/client-logger';

const PAGE_SIZE = 50;

const RecentTransactionsModule: React.FC = () => {
    const theme = useTheme();
    const {
        startDate,
        endDate,
        billingCycle
    } = useDateSelection();

    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const fetchRecentTransactions = useCallback(async (isLoadMore: boolean = false) => {
        if (!isLoadMore) {
            setLoading(true);
            setPage(0);
        } else {
            setLoadingMore(true);
        }

        try {
            const currentPage = isLoadMore ? page + 1 : 0;
            const params = new URLSearchParams();
            if (billingCycle) {
                params.set('billingCycle', billingCycle);
            } else if (startDate && endDate) {
                params.set('startDate', startDate);
                params.set('endDate', endDate);
            }
            params.set('limit', PAGE_SIZE.toString());
            params.set('offset', (currentPage * PAGE_SIZE).toString());

            const response = await fetch(`/api/transactions?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch transactions');
            const data = await response.json();

            if (isLoadMore) {
                setTransactions(prev => [...prev, ...data]);
                setPage(currentPage);
            } else {
                setTransactions(data);
            }

            setHasMore(data.length === PAGE_SIZE);
        } catch (error) {
            logger.error('Error fetching recent transactions', error as Error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [billingCycle, startDate, endDate, page]);

    useEffect(() => {
        if (billingCycle || (startDate && endDate)) {
            fetchRecentTransactions(false);
        }
    }, [billingCycle, startDate, endDate]); // Only refetch when dates change, not when fetchRecentTransactions changes (to avoid loop with page dependency)

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100 && !loading && !loadingMore && hasMore) {
            fetchRecentTransactions(true);
        }
    };

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
                justifyContent: 'space-between',
                borderBottom: `1px solid ${theme.palette.divider}`,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ReceiptLongIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Recent Transactions</Typography>
                </Box>
                {transactions.length > 0 && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        {transactions.length} items
                    </Typography>
                )}
            </Box>

            <Box
                onScroll={handleScroll}
                sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    maxHeight: '480px',
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
                {loading && page === 0 ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
                        <CircularProgress size={24} />
                    </Box>
                ) : transactions.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                        <Typography variant="body2">No transactions for this period</Typography>
                    </Box>
                ) : (
                    <>
                        <TransactionsTable
                            transactions={transactions}
                            groupByDate={true}
                            disableWrapper={true}
                        />
                        {loadingMore && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                                <CircularProgress size={20} />
                            </Box>
                        )}
                        {!hasMore && transactions.length > PAGE_SIZE && (
                            <Box sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="caption" color="text.secondary">
                                    End of list
                                </Typography>
                            </Box>
                        )}
                    </>
                )}
            </Box>
        </Box>
    );
};

export default RecentTransactionsModule;
