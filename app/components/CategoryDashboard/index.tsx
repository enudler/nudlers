import React from 'react';
import { useTheme } from '@mui/material/styles';
import PageHeader from '../PageHeader';
import Box from '@mui/material/Box';
import TableChartIcon from '@mui/icons-material/TableChart';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { ModalData } from './types';
import { useCategoryColors } from './utils/categoryUtils';
import ExpensesModal from './components/ExpensesModal';
import TransactionsTable from './components/TransactionsTable';
import { useScreenContext } from '../Layout';
import { useDateSelection, DateRangeMode } from '../../context/DateSelectionContext';
import { useTransactions } from './useTransactions';

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
    startDate, endDate
  } = useDateSelection();

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [modalData, setModalData] = React.useState<ModalData>();

  const categoryColors = useCategoryColors();
  const { setScreenContext } = useScreenContext();

  const {
    transactions,
    loadingTransactions,
    loadingMore,
    hasMore,
    searchQuery,
    setSearchQuery,
    isSearching,
    sortBy,
    sortOrder,
    handleSort,
    handleSearch,
    handleRefreshClick,
    handleDeleteTransaction,
    handleUpdateTransaction,
    handleScroll,
  } = useTransactions();

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
      summary: undefined,
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
          onScroll={handleScroll}
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
