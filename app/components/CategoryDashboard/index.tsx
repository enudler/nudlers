import React from 'react';
import { useTheme } from '@mui/material/styles';
import PageHeader from '../PageHeader';
import Box from '@mui/material/Box';
import TableChartIcon from '@mui/icons-material/TableChart';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { Expense, ModalData } from './types';
import { useCategoryColors } from './utils/categoryUtils';
import ExpensesModal from './components/ExpensesModal';
import TransactionsTable from './components/TransactionsTable';
import { useScreenContext } from '../Layout';
import { useDateSelection, DateRangeMode } from '../../context/DateSelectionContext';
import { logger } from '../../utils/client-logger';
import { useNotification } from '../NotificationContext';

const CategoryDashboard: React.FC = () => {
  const theme = useTheme();
  const {
    selectedYear, setSelectedYear,
    selectedMonth, setSelectedMonth,
    dateRangeMode, setDateRangeMode,
    customStartDate, setCustomStartDate,
    customEndDate, setCustomEndDate,
    uniqueYears,
    uniqueMonths,
    startDate, endDate, billingCycle
  } = useDateSelection();

  // Local UI State
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [modalData, setModalData] = React.useState<ModalData>();
  const [transactions, setTransactions] = React.useState<Expense[]>([]);
  const [loadingTransactions, setLoadingTransactions] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<string>('date');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const pageRef = React.useRef(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const PAGE_SIZE = 50;

  const categoryColors = useCategoryColors();
  const { setScreenContext } = useScreenContext();
  const { showNotification } = useNotification();

  const fetchTransactionsWithRange = React.useCallback(async (startDate: string, endDate: string, billingCycle?: string, isLoadMore: boolean = false) => {
    if (!isLoadMore) {
      setLoadingTransactions(true);
      pageRef.current = 0;
      setTransactions([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const currentPage = isLoadMore ? pageRef.current + 1 : 0;
      const url = new URL("/api/reports/category-expenses", window.location.origin);

      if (billingCycle) {
        url.searchParams.append("billingCycle", billingCycle);
      } else {
        url.searchParams.append("startDate", startDate);
        url.searchParams.append("endDate", endDate);
      }
      url.searchParams.append("all", "true");
      url.searchParams.append("sortBy", sortBy);
      url.searchParams.append("sortOrder", sortOrder);
      url.searchParams.append("limit", PAGE_SIZE.toString());
      url.searchParams.append("offset", (currentPage * PAGE_SIZE).toString());

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const transactionsData = await response.json();
      const mappedTransactions = transactionsData.map((t: any) => ({
        ...t,
        category: t.category || 'Unassigned',
        identifier: t.identifier || 'unknown',
        vendor: t.vendor || 'unknown'
      }));

      if (isLoadMore) {
        setTransactions(prev => [...prev, ...mappedTransactions]);
        pageRef.current = currentPage;
      } else {
        setTransactions(mappedTransactions);
      }
      setHasMore(transactionsData.length === PAGE_SIZE);
    } catch (error) {
      logger.error('Error fetching transactions data', error, {
        year: selectedYear,
        month: selectedMonth
      });
    } finally {
      if (!isLoadMore) {
        setLoadingTransactions(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [selectedYear, selectedMonth, sortBy, sortOrder]);

  const handleRefreshClick = () => {
    if (searchQuery.trim()) {
      handleSearch();
    } else if (startDate && endDate) {
      fetchTransactionsWithRange(startDate, endDate, billingCycle);
    }
  };

  const handleSearch = React.useCallback(async (e?: React.FormEvent, isLoadMore: boolean = false) => {
    e?.preventDefault();
    if (!searchQuery.trim()) {
      // If search is cleared, fetch regular data
      if (startDate && endDate) {
        fetchTransactionsWithRange(startDate, endDate, billingCycle, isLoadMore);
      }
      return;
    }

    if (!isLoadMore) {
      setLoadingTransactions(true);
      pageRef.current = 0;
      setTransactions([]);
    } else {
      setLoadingMore(true);
    }

    setIsSearching(true);
    try {
      const currentPage = isLoadMore ? pageRef.current + 1 : 0;
      let queryParams = `q=${encodeURIComponent(searchQuery)}`;
      if (dateRangeMode === 'custom' && customStartDate && customEndDate) {
        queryParams += `&startDate=${customStartDate}&endDate=${customEndDate}`;
      } else if (dateRangeMode === 'billing' && selectedYear && selectedMonth) {
        queryParams += `&billingCycle=${selectedYear}-${selectedMonth}`;
      } else if (startDate && endDate) {
        queryParams += `&startDate=${startDate}&endDate=${endDate}`;
      }

      queryParams += `&sortBy=${sortBy}&sortOrder=${sortOrder}`;
      queryParams += `&limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`;

      const response = await fetch(`/api/transactions?${queryParams}`);
      if (response.ok) {
        const results = await response.json();
        if (isLoadMore) {
          setTransactions(prev => [...prev, ...results]);
          pageRef.current = currentPage;
        } else {
          setTransactions(results);
        }
        setHasMore(results.length === PAGE_SIZE);
      }
    } catch (error) {
      logger.error('Search error', error, { query: searchQuery });
      showNotification('Search failed', 'error');
    } finally {
      if (!isLoadMore) {
        setLoadingTransactions(false);
      } else {
        setLoadingMore(false);
      }
      setIsSearching(false);
    }
  }, [
    searchQuery,
    startDate,
    endDate,
    billingCycle,
    fetchTransactionsWithRange,
    dateRangeMode,
    customStartDate,
    customEndDate,
    selectedYear,
    selectedMonth,
    sortBy,
    sortOrder,
    showNotification
  ]);

  const handleSort = (field: string) => {
    const isAsc = sortBy === field && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortBy(field);
    pageRef.current = 0; // Reset page on sort change
  };

  const handleLoadMore = () => {
    if (!loadingTransactions && !loadingMore && hasMore) {
      if (searchQuery.trim()) {
        handleSearch(undefined, true);
      } else if (startDate && endDate) {
        fetchTransactionsWithRange(startDate, endDate, billingCycle, true);
      }
    }
  };

  // Initial data fetch and Refresh listener
  React.useEffect(() => {
    if (startDate && endDate) {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        fetchTransactionsWithRange(startDate, endDate, billingCycle);
      }
    }

    const handleRefresh = () => {
      if (startDate && endDate) {
        if (searchQuery.trim()) {
          handleSearch();
        } else {
          fetchTransactionsWithRange(startDate, endDate, billingCycle);
        }
      }
    };
    window.addEventListener('dataRefresh', handleRefresh);
    return () => window.removeEventListener('dataRefresh', handleRefresh);
  }, [startDate, endDate, billingCycle, fetchTransactionsWithRange, searchQuery, handleSearch]);

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedYear(event.target.value);
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedMonth(event.target.value);
  };

  const handleDateRangeModeChange = (mode: DateRangeMode) => {
    setDateRangeMode(mode);
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setCustomStartDate(value);
    } else {
      setCustomEndDate(value);
    }
  };

  // Update AI Assistant screen context when data changes
  React.useEffect(() => {
    setScreenContext({
      view: 'transactions',
      dateRange: {
        startDate,
        endDate,
        mode: dateRangeMode
      },
      summary: undefined, // Summary data is no longer available on this screen
      transactions: transactions.slice(0, 50).map(t => ({
        name: t.name,
        amount: t.price,
        category: t.category || 'Unassigned',
        date: t.date
      }))
    });
  }, [
    dateRangeMode,
    startDate,
    endDate,
    transactions,
    setScreenContext
  ]);

  const handleDeleteTransaction = async (transaction: Expense) => {
    try {
      const response = await fetch(`/api/transactions/${transaction.identifier}|${transaction.vendor}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove the transaction from the local state
        setTransactions(transactions.filter(t =>
          t.identifier !== transaction.identifier || t.vendor !== transaction.vendor
        ));
      } else {
        throw new Error('Failed to delete transaction');
      }
    } catch (error) {
      logger.error('Error deleting transaction', error, {
        transactionId: transaction.identifier,
        vendor: transaction.vendor
      });
    }
  };

  const handleUpdateTransaction = async (transaction: Expense, newPrice: number, newCategory?: string) => {
    try {
      const updateData: Partial<Expense> = { price: newPrice };
      if (newCategory !== undefined) {
        updateData.category = newCategory;
      }

      const response = await fetch(`/api/transactions/${transaction.identifier}|${transaction.vendor}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        // Update the transaction in the local state
        setTransactions(transactions.map(t =>
          t.identifier === transaction.identifier && t.vendor === transaction.vendor
            ? { ...t, price: newPrice, ...(newCategory !== undefined && { category: newCategory }) }
            : t
        ));
      } else {
        throw new Error('Failed to update transaction');
      }
    } catch (error) {
      logger.error('Error updating transaction', error, {
        transactionId: transaction.identifier,
        vendor: transaction.vendor
      });
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      position: 'relative',
      background: 'transparent',
      overflow: 'hidden'
    }}>
      {/* Main content container */}
      <Box sx={{
        padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
        maxWidth: '1440px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1
      }}>

        <PageHeader
          title="Transactions"
          description="View and manage all your bank and credit card transactions"
          icon={<TableChartIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}
          showDateSelectors={true}
          dateRangeMode={dateRangeMode}
          onDateRangeModeChange={handleDateRangeModeChange}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
          uniqueYears={uniqueYears}
          uniqueMonths={uniqueMonths}
          customStartDate={customStartDate}
          onCustomStartDateChange={(val) => handleCustomDateChange('start', val)}
          customEndDate={customEndDate}
          onCustomEndDateChange={(val) => handleCustomDateChange('end', val)}
          onRefresh={handleRefreshClick}
          showSearch={true}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSearchSubmit={handleSearch}
          isSearching={isSearching}
          startDate={startDate}
          endDate={endDate}
        />

        <Box
          onScroll={(e) => {
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            if (scrollHeight - scrollTop <= clientHeight + 100) {
              handleLoadMore();
            }
          }}
          sx={{
            background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: { xs: '20px', md: '32px' },
            padding: { xs: '12px', md: '32px' },
            marginTop: '24px',
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
            overflowX: 'auto',
            maxHeight: '80vh',
            overflowY: 'auto',
            '&::-webkit-scrollbar': { width: '8px' },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              borderRadius: '10px',
              border: '2px solid transparent',
              backgroundClip: 'content-box'
            },
            '&:hover::-webkit-scrollbar-thumb': {
              background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
              backgroundClip: 'content-box'
            }
          }}>
          <TransactionsTable
            transactions={transactions}
            isLoading={loadingTransactions}
            onDelete={handleDeleteTransaction}
            onUpdate={handleUpdateTransaction}
            groupByDate={sortBy === 'date' && sortOrder === 'desc'}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            showProcessedDate={true}
          />
          {(loadingMore || loadingTransactions) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={32} thickness={4} />
            </Box>
          )}
          {!hasMore && transactions.length > 0 && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                That's all for this period ✨
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {
        modalData && (
          <ExpensesModal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            data={modalData}
            color={categoryColors[modalData?.type || 'expense'] || '#94a3b8'}
            setModalData={setModalData}
            currentMonth={`${selectedYear}-${selectedMonth}`}
          />
        )
      }
    </Box>
  );
};

export default CategoryDashboard;
