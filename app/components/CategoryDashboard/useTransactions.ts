import React from 'react';
import { Expense } from './types';
import { logger } from '../../utils/client-logger';
import { useDateSelection } from '../../context/DateSelectionContext';
import { useNotification } from '../NotificationContext';

const PAGE_SIZE = 50;

export function useTransactions() {
  const {
    selectedYear, selectedMonth,
    dateRangeMode,
    customStartDate, customEndDate,
    startDate, endDate, billingCycle
  } = useDateSelection();

  const { showNotification } = useNotification();

  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [transactions, setTransactions] = React.useState<Expense[]>([]);
  const [loadingTransactions, setLoadingTransactions] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<string>('date');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const pageRef = React.useRef(0);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const scrollThrottleRef = React.useRef(false);

  const fetchTransactionsWithRange = React.useCallback(async (
    sd: string, ed: string, bc?: string, isLoadMore: boolean = false
  ) => {
    if (!isLoadMore) {
      setLoadingTransactions(true);
      pageRef.current = 0;
      setTransactions([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const currentPage = isLoadMore ? pageRef.current + 1 : 0;
      const url = new URL("/api/transactions", window.location.origin);

      if (bc) {
        url.searchParams.append("billingCycle", bc);
      } else {
        url.searchParams.append("startDate", sd);
        url.searchParams.append("endDate", ed);
      }

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

  const handleSearch = React.useCallback(async (e?: React.FormEvent, isLoadMore: boolean = false) => {
    e?.preventDefault();
    if (!searchQuery.trim()) {
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
    searchQuery, startDate, endDate, billingCycle,
    fetchTransactionsWithRange, dateRangeMode,
    customStartDate, customEndDate,
    selectedYear, selectedMonth,
    sortBy, sortOrder, showNotification
  ]);

  const handleSort = (field: string) => {
    const isAsc = sortBy === field && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortBy(field);
    pageRef.current = 0;
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

  const handleRefreshClick = () => {
    if (searchQuery.trim()) {
      handleSearch();
    } else if (startDate && endDate) {
      fetchTransactionsWithRange(startDate, endDate, billingCycle);
    }
  };

  // Keep a stable ref for the refresh handler to avoid re-attaching event listeners
  const refreshRef = React.useRef(() => {});
  React.useEffect(() => {
    refreshRef.current = () => {
      if (startDate && endDate) {
        if (searchQuery.trim()) {
          handleSearch();
        } else {
          fetchTransactionsWithRange(startDate, endDate, billingCycle);
        }
      }
    };
  }, [startDate, endDate, billingCycle, fetchTransactionsWithRange, searchQuery, handleSearch]);

  // Initial data fetch
  React.useEffect(() => {
    if (startDate && endDate) {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        fetchTransactionsWithRange(startDate, endDate, billingCycle);
      }
    }
  }, [startDate, endDate, billingCycle, fetchTransactionsWithRange, searchQuery, handleSearch]);

  // Stable event listener - attached once, never re-attached
  React.useEffect(() => {
    const handleRefresh = () => refreshRef.current();
    window.addEventListener('dataRefresh', handleRefresh);
    return () => window.removeEventListener('dataRefresh', handleRefresh);
  }, []);

  const handleDeleteTransaction = async (transaction: Expense) => {
    try {
      const response = await fetch(`/api/transactions/${transaction.identifier}|${transaction.vendor}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTransactions(prev => prev.filter(t =>
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        setTransactions(prev => prev.map(t =>
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

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = true;
    requestAnimationFrame(() => {
      scrollThrottleRef.current = false;
    });
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      handleLoadMore();
    }
  }, [handleLoadMore]);

  return {
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
  };
}
