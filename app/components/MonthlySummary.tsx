import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import RefreshIcon from '@mui/icons-material/Refresh';
import DescriptionIcon from '@mui/icons-material/Description';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import DateRangeIcon from '@mui/icons-material/DateRange';
import TuneIcon from '@mui/icons-material/Tune';
import SortIcon from '@mui/icons-material/Sort';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SearchIcon from '@mui/icons-material/Search';

import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Box from '@mui/material/Box';
import ExpensesModal from './CategoryDashboard/components/ExpensesModal';
import Typography from '@mui/material/Typography';
import { ModalData } from './CategoryDashboard/types';
import { useCategories } from './CategoryDashboard/utils/useCategories';
import { CardVendorIcon, CARD_VENDORS } from './CardVendorsModal';
import { useScreenContext } from './Layout';
import { useDateSelection, DateRangeMode } from '../context/DateSelectionContext';
import { logger } from '../utils/client-logger';
import { CREDIT_CARD_VENDORS, BANK_VENDORS } from '../utils/constants';

// Maximum date range in years
const MAX_YEARS_RANGE = 5;

interface BankCheckTransaction {
  card6_digits?: string;
  account_number?: string | number;
  installments_total?: number;
  vendor?: string;
  category?: string;
}

const isBankTransaction = (transaction: BankCheckTransaction) => {
  // 1. Check for Credit Card signals FIRST
  const hasCardSignals =
    Boolean(transaction.card6_digits) ||
    (transaction.account_number && String(transaction.account_number).length === 4) ||
    (transaction.installments_total && transaction.installments_total > 0);

  if (hasCardSignals) return false;

  // 2. Check vendor source against known CC vendors
  if (transaction.vendor) {
    const vendorLower = transaction.vendor.toLowerCase();
    if (CREDIT_CARD_VENDORS.some(v => vendorLower.includes(v.toLowerCase()))) {
      return false;
    }
  }

  // 3. Check vendor source against known Bank vendors
  if (transaction.vendor) {
    const vendorLower = transaction.vendor.toLowerCase();
    if (BANK_VENDORS.some(v => vendorLower.includes(v.toLowerCase()))) {
      return true;
    }
  }
  return false;
};

interface MonthlySummaryData {
  month: string;
  vendor?: string;
  vendor_nickname?: string | null;
  description?: string;
  category?: string;
  last4digits?: string;
  transaction_count?: number;
  card_expenses: number;
  amount?: number; // Amount with original sign (positive = income, negative = expense)
}

interface CardSummary {
  last4digits: string;
  card_expenses: number;
  bank_income: number;
  bank_expenses: number;
  card_vendor?: string | null;
  bank_account_id?: number | null;
  bank_account_nickname?: string | null;
  bank_account_number?: string | null;
  bank_account_vendor?: string | null;
  custom_bank_account_number?: string | null;
  custom_bank_account_nickname?: string | null;
  transaction_vendor?: string | null;
}



interface ScrapedBankSummary {
  bank_account_id: number | null;
  bank_account_nickname: string;
  bank_account_number: string | null;
  bank_account_vendor: string | null;
  net_flow: number; // Income - Expenses
  income: number;
  expenses: number;
}

interface BankCCSummary {
  bank_account_id: number | null;
  bank_account_nickname: string;
  bank_account_number: string | null;
  bank_account_vendor: string | null;
  total_cc_expenses: number;
  card_count: number;
}

type GroupByType = 'vendor' | 'description' | 'last4digits';
// DateRangeMode imported from context
type SortField = 'name' | 'count' | 'card_expenses';
type SortDirection = 'asc' | 'desc';

// Helper function to calculate date range based on mode
// getDateRange removed (handled by context)

// Helper to format date range for display


const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('he-IL').format(Math.round(num));
};







const MonthlySummary: React.FC = () => {
  const theme = useTheme();
  const [data, setData] = useState<MonthlySummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Grouping
  const [groupBy] = useState<GroupByType>('description');

  // Date range error (local validation for custom range UI feedback if needed, 
  // though context handles valid start/end dates for fetching)
  const [dateRangeError, setDateRangeError] = useState<string>('');

  // Modal for transaction details
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | undefined>();
  const [loadingDescription, setLoadingDescription] = useState<string | null>(null);
  const [loadingLast4, setLoadingLast4] = useState<string | null>(null);

  // Card summary for cards display (grouped by last 4 digits)
  const [cardSummary, setCardSummary] = useState<CardSummary[]>([]);

  // Sorting
  // Sorting
  const [sortField, setSortField] = useState<SortField>('card_expenses');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  // Removed old bankAccountSummary in favor of separated states
  const [scrapedBankSummary, setScrapedBankSummary] = useState<ScrapedBankSummary[]>([]);
  const [creditCardBankSummary, setCreditCardBankSummary] = useState<BankCCSummary[]>([]);

  // Category editing
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<string>('');
  const { categories: availableCategories } = useCategories();

  // Filter for showing/hiding bank transactions in breakdown by description
  // By default, bank transactions are hidden (showBankTransactions = false)
  const [showBankTransactions, setShowBankTransactions] = useState<boolean>(false);
  // Pagination
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 50;
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });

  // Card vendor selection
  const [vendorMenuAnchor, setVendorMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedCardForVendor, setSelectedCardForVendor] = useState<string | null>(null);
  const [cardVendorMap, setCardVendorMap] = useState<Record<string, string>>({});
  const [cardNicknameMap, setCardNicknameMap] = useState<Record<string, string>>({});
  const [editingNickname, setEditingNickname] = useState<string>('');



  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // AI context
  const { setScreenContext } = useScreenContext();

  // Validate date range (max 5 years)
  const validateDateRange = (start: string, end: string): boolean => {
    if (!start || !end) return false;

    const startDateObj = new Date(start);
    const endDateObj = new Date(end);

    if (startDateObj > endDateObj) {
      setDateRangeError('Start date must be before end date');
      return false;
    }

    const diffTime = Math.abs(endDateObj.getTime() - startDateObj.getTime());
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);

    if (diffYears > MAX_YEARS_RANGE) {
      setDateRangeError(`Date range cannot exceed ${MAX_YEARS_RANGE} years`);
      return false;
    }

    setDateRangeError('');
    return true;
  };

  // Theme-aware styles
  const selectStyle: React.CSSProperties = {
    padding: '14px 40px 14px 14px', // Extra right padding for arrow
    borderRadius: '16px',
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(10px)',
    color: theme.palette.text.primary,
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    outline: 'none',
    textAlign: 'left' as const, // Changed for consistency with LTR
    direction: 'ltr' as const,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    appearance: 'none' as const,
    WebkitAppearance: 'none',
    backgroundImage: theme.palette.mode === 'dark'
      ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`
      : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    backgroundSize: '16px'
  };

  const buttonStyle = {
    background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)',
    backdropFilter: 'blur(10px)',
    padding: '14px',
    borderRadius: '16px',
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
  };

  const fetchCardVendors = useCallback(async () => {
    try {
      const response = await fetch('/api/cards');
      if (response.ok) {
        const data = await response.json();
        const vendorMap: Record<string, string> = {};
        const nicknameMap: Record<string, string> = {};
        for (const card of data) {
          if (card.card_vendor) {
            vendorMap[card.last4_digits] = card.card_vendor;
          }
          if (card.card_nickname) {
            nicknameMap[card.last4_digits] = card.card_nickname;
          }
        }
        setCardVendorMap(vendorMap);
        setCardNicknameMap(nicknameMap);
      }
    } catch (error) {
      logger.error('Error fetching card vendors', error);
    }
  }, []);

  useEffect(() => {
    // Initialize state from local storage and settings
    const init = async () => {
      // Load persistence first
      const persistedMode = localStorage.getItem('monthlySummary_mode') as DateRangeMode | null;
      if (persistedMode && ['billing', 'calendar'].includes(persistedMode)) {
        setDateRangeMode(persistedMode);
      }

      // Settings loaded by context


      // Fetch available dates and initialize selection
      fetchCardVendors();

    }

    init();
  }, [fetchCardVendors, setDateRangeMode]);



  const handleVendorMenuOpen = (event: React.MouseEvent<HTMLElement>, last4digits: string) => {
    event.stopPropagation();
    setVendorMenuAnchor(event.currentTarget);
    setSelectedCardForVendor(last4digits);
    setEditingNickname(cardNicknameMap[last4digits] || '');
  };

  const handleVendorMenuClose = () => {
    setVendorMenuAnchor(null);
    setSelectedCardForVendor(null);
  };

  const handleVendorSelect = async (vendorKey: string) => {
    if (!selectedCardForVendor) return;

    // Keep existing nickname if any
    const existingNickname = cardNicknameMap[selectedCardForVendor] || null;

    try {
      const response = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last4_digits: selectedCardForVendor,
          card_vendor: vendorKey,
          card_nickname: existingNickname,
        }),
      });

      if (response.ok) {
        setCardVendorMap(prev => ({
          ...prev,
          [selectedCardForVendor]: vendorKey
        }));
        setSnackbar({
          open: true,
          message: `Card •••• ${selectedCardForVendor} set to ${CARD_VENDORS[vendorKey as keyof typeof CARD_VENDORS]?.name || vendorKey}`,
          severity: 'success'
        });
        // Trigger refresh for other components
        window.dispatchEvent(new CustomEvent('cardVendorsUpdated'));
      }
    } catch (error) {
      logger.error('Error saving card vendor', error, {
        card: selectedCardForVendor,
        vendor: vendorKey
      });
      setSnackbar({
        open: true,
        message: 'Failed to save card vendor',
        severity: 'error'
      });
    }

    handleVendorMenuClose();
  };

  const handleNicknameSave = async (last4digits: string, nickname: string) => {
    const existingVendor = cardVendorMap[last4digits] || null;

    try {
      const response = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last4_digits: last4digits,
          card_vendor: existingVendor || 'visa', // Default to visa if no vendor set
          card_nickname: nickname || null,
        }),
      });

      if (response.ok) {
        setCardNicknameMap(prev => ({
          ...prev,
          [last4digits]: nickname
        }));
        setSnackbar({
          open: true,
          message: nickname ? `Card nickname set to "${nickname}"` : 'Card nickname removed',
          severity: 'success'
        });
        window.dispatchEvent(new CustomEvent('cardVendorsUpdated'));
      }
    } catch (error) {
      logger.error('Error saving card nickname', error, {
        card: last4digits,
        nickname
      });
      setSnackbar({
        open: true,
        message: 'Failed to save card nickname',
        severity: 'error'
      });
    }
  };

  // fetchAvailableMonths removed

  const fetchMonthlySummary = useCallback(async (skipLoadingState = false, offsetValue = 0) => {
    // For custom mode, we need custom dates; for other modes, we need year/month
    if (dateRangeMode === 'custom') {
      if (!customStartDate || !customEndDate) return;
    } else {
      if (!selectedYear || !selectedMonth) return;
    }

    // Preserve scroll position when refetching due to filter toggle
    const scrollY = window.scrollY;

    try {
      if (!skipLoadingState) {
        setLoading(true);
      }

      let url: string;
      let cardUrl: string;

      const queryParams = new URLSearchParams();
      if (billingCycle) {
        queryParams.set('billingCycle', billingCycle);
      } else {
        queryParams.set('startDate', startDate);
        queryParams.set('endDate', endDate);
      }
      queryParams.set('groupBy', groupBy);
      queryParams.set('limit', PAGE_SIZE.toString());
      queryParams.set('offset', offsetValue.toString());
      queryParams.set('sortBy', sortField);
      queryParams.set('sortOrder', sortDirection);
      if (groupBy === 'description' && !showBankTransactions) {
        queryParams.set('excludeBankTransactions', 'true');
      }

      url = `/api/reports/monthly-summary?${queryParams.toString()}`;

      // Card summary always needs all data for sidebars/totals (or at least more than 50)
      const cardParams = new URLSearchParams(queryParams);
      cardParams.set('groupBy', 'last4digits');
      cardParams.set('limit', '500'); // Sufficient for most users
      cardParams.set('offset', '0');
      cardParams.delete('excludeBankTransactions'); // Sidebar must always show bank balances
      cardUrl = `/api/reports/monthly-summary?${cardParams.toString()}`;

      // Fetch both main data and card summary in parallel
      const [mainResponse, cardResponse] = await Promise.all([
        fetch(url),
        fetch(cardUrl)
      ]);

      const result = await mainResponse.json();
      const items = result.items || [];
      const newTotal = result.total || 0;

      if (offsetValue === 0) {
        setData(items);
      } else {
        setData(prev => [...prev, ...items]);
      }
      setTotal(newTotal);

      if (cardResponse.ok) {
        interface CardAPIResponse {
          last4digits: string;
          card_expenses: string | number;
          bank_income?: string | number;
          bank_expenses?: string | number;
          bank_account_id?: number | null;
          bank_account_nickname?: string | null;
          bank_account_number?: string | null;
          bank_account_vendor?: string | null;
          custom_bank_account_number?: string | null;
          custom_bank_account_nickname?: string | null;
          transaction_vendor?: string | null;
          card_nickname?: string | null;
          total_income?: string | number;
          total_outflow?: string | number;
        }
        const cardResponseData = await cardResponse.json();
        const cardResult: CardAPIResponse[] = cardResponseData.items || [];
        // Filter to include cards with expenses OR bank activity
        const cards: CardSummary[] = cardResult
          .filter((c) => Number(c.card_expenses) > 0 || Number(c.bank_expenses) > 0 || Number(c.bank_income) > 0)
          .map((c) => ({
            last4digits: c.last4digits,
            card_expenses: Number(c.card_expenses),
            bank_income: Number(c.bank_income || 0),
            bank_expenses: Number(c.bank_expenses || 0),
            bank_account_id: c.bank_account_id || null,
            bank_account_nickname: c.bank_account_nickname || null,
            bank_account_number: c.bank_account_number || null,
            bank_account_vendor: c.bank_account_vendor || null,
            // Prioritize custom details if they exist and no linked account
            custom_bank_account_number: c.custom_bank_account_number || null,
            custom_bank_account_nickname: c.custom_bank_account_nickname || null,
            transaction_vendor: c.transaction_vendor || null,
          }));
        setCardSummary(cards);

        // Process Bank Accounts (Scraped) vs Credit Cards (Linked)
        const scrapedBankMap = new Map<string, ScrapedBankSummary>();
        const ccBankMap = new Map<string, BankCCSummary>();

        // Helper to get bank key
        const getBankKey = (id: number | null, nickname: string | null, vendor: string | null) => {
          if (id) return `id-${id}`;
          if (nickname) return `nick-${nickname}`;
          return `vendor-${vendor || 'unknown'}`;
        };

        const allCards = cardResult; // Use original result to access all fields

        allCards.forEach((item) => {
          const transVendor = item.transaction_vendor;
          const isBank = (transVendor && BANK_VENDORS.includes(transVendor));

          // Determine if this item ITSELF is a bank account (scraped source) or a credit card
          // Detailed logic: If it's in BANK_VENDORS, it's a bank account. 
          // Note: Some cards might be scraped from bank site, but usually they are separated or have card_expenses.
          // We will treat items with 'bank_income' or matches BANK_VENDORS as Bank Account Sources.

          // However, we need to be careful. The user wants "Bank Account Data" (scraped) vs linked CC data.


          const cardExpenses = Number(item.card_expenses || 0);
          const totalIncome = Number(item.total_income || 0);
          const totalOutflow = Number(item.total_outflow || 0);

          // 1. Is it a Bank Account Source?
          if (isBank) {
            const key = getBankKey(item.bank_account_id || null, item.bank_account_nickname || null, transVendor || null);
            // Ideally we use the item's own identifiers if it IS the bank account.
            // But 'item' here is a "card/account" node. 
            // If transaction_vendor is bank, this node IS the bank account (usually).

            // Check if we already have this bank account in our map
            if (!scrapedBankMap.has(key)) {
              scrapedBankMap.set(key, {
                bank_account_id: item.bank_account_id || null,
                bank_account_nickname: item.bank_account_nickname || item.card_nickname || transVendor || 'Unknown Bank',
                bank_account_number: item.bank_account_number || item.last4digits,
                bank_account_vendor: transVendor,
                net_flow: 0,
                income: 0,
                expenses: 0
              });
            }

            const summary = scrapedBankMap.get(key)!;
            summary.income += totalIncome;
            summary.expenses += totalOutflow;
            summary.net_flow = summary.income - summary.expenses;
          }

          // 2. Is it a Credit Card? (Logic: NOT a bank AND has card_expenses)
          // Bank transactions should never be counted as credit cards
          const isCC = !isBank && cardExpenses > 0;

          if (isCC) {
            // It's a card with expenses. Attribute to its linked bank.
            let bankKey = 'unassigned';
            let bankName = 'Unassigned Cards';
            let bankId: number | null = null;
            let bankVendor: string | null = null;
            let bankNumber: string | null = null;

            if (item.bank_account_id) {
              bankKey = `id-${item.bank_account_id}`;
              bankId = item.bank_account_id;
              bankName = item.bank_account_nickname || 'Unknown Bank';
              bankVendor = item.bank_account_vendor || null;
              bankNumber = item.bank_account_number || null;
            } else if (item.custom_bank_account_nickname || item.custom_bank_account_number) {
              // Custom bank
              bankKey = `custom-${item.custom_bank_account_nickname || item.custom_bank_account_number}`;
              bankName = item.custom_bank_account_nickname || 'Custom Bank';
              bankNumber = item.custom_bank_account_number || null;
            } else {
              // If it's unassigned, we might still want to show it under "Unassigned" or similar?
              // The requirement is "show under each bank account... data coming from the attached credit card"
              // So unassigned cards go to 'Unassigned' bucket or separate.
            }

            if (!ccBankMap.has(bankKey)) {
              ccBankMap.set(bankKey, {
                bank_account_id: bankId,
                bank_account_nickname: bankName,
                bank_account_number: bankNumber,
                bank_account_vendor: bankVendor || null,
                total_cc_expenses: 0,
                card_count: 0
              });
            }

            const ccSummary = ccBankMap.get(bankKey)!;
            ccSummary.total_cc_expenses += cardExpenses;
            ccSummary.card_count += 1;
          }
        });

        setScrapedBankSummary(Array.from(scrapedBankMap.values()).sort((a, b) => b.net_flow - a.net_flow));
        setCreditCardBankSummary(Array.from(ccBankMap.values()).sort((a, b) => b.total_cc_expenses - a.total_cc_expenses));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (!skipLoadingState) {
        setLoading(false);
      }

      // Restore scroll position after render
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollY);
      });
    }
  }, [startDate, endDate, billingCycle, groupBy, dateRangeMode, customStartDate, customEndDate, showBankTransactions, selectedYear, selectedMonth, sortField, sortDirection]);

  useEffect(() => {
    setOffset(0); // Reset offset when filters change
    if (dateRangeMode === 'custom') {
      if (customStartDate && customEndDate) {
        fetchMonthlySummary(false, 0);
      }
    } else if (startDate && endDate) {
      fetchMonthlySummary(false, 0);
    }
  }, [startDate, endDate, billingCycle, groupBy, dateRangeMode, customStartDate, customEndDate, selectedYear, selectedMonth, sortField, sortDirection]);

  // Separate useEffect for filter toggle - skip loading state to prevent flicker
  useEffect(() => {
    if (dateRangeMode === 'custom') {
      if (customStartDate && customEndDate) {
        setOffset(0);
        fetchMonthlySummary(true, 0); // skipLoadingState = true
      }
    } else if (startDate && endDate) {
      setOffset(0);
      fetchMonthlySummary(true, 0); // skipLoadingState = true
    }
  }, [showBankTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleDataRefresh = () => {
      if (dateRangeMode === 'custom') {
        if (customStartDate && customEndDate) {
          fetchMonthlySummary();
        }
      } else {
        fetchMonthlySummary();
      }
    };

    window.addEventListener('dataRefresh', handleDataRefresh);
    return () => window.removeEventListener('dataRefresh', handleDataRefresh);
  }, [fetchMonthlySummary, dateRangeMode, customStartDate, customEndDate]);

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedYear(event.target.value);
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = event.target.value;
    setSelectedMonth(newMonth);
    localStorage.setItem('monthlySummary_month', newMonth);
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setCustomStartDate(value);
      if (customEndDate) {
        validateDateRange(value, customEndDate);
      }
    } else {
      setCustomEndDate(value);
      if (customStartDate) {
        validateDateRange(customStartDate, value);
      }
    }
  };

  const handleRefresh = () => {
    setOffset(0);
    if (dateRangeMode === 'custom') {
      if (customStartDate && customEndDate && validateDateRange(customStartDate, customEndDate)) {
        fetchMonthlySummary(false, 0);
      }
    } else {
      fetchMonthlySummary(false, 0);
    }
  };

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    fetchMonthlySummary(true, nextOffset);
  };

  const [loadingAll, setLoadingAll] = useState(false);

  const handleAllTransactionsClick = async () => {
    if (dateRangeMode === 'custom') {
      if (!customStartDate || !customEndDate) return;
    } else {
      if (!selectedYear || !selectedMonth) return;
    }

    try {
      setLoadingAll(true);

      let url: string;
      if (billingCycle) {
        url = `/api/reports/category-expenses?billingCycle=${billingCycle}&all=true`;
      } else {
        url = `/api/reports/category-expenses?startDate=${startDate}&endDate=${endDate}&all=true`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const transactions = await response.json();
      // Filter to only credit card transactions (not Bank)
      const cardTransactions = transactions.filter((t: BankCheckTransaction) => !isBankTransaction(t));

      setModalData({
        type: 'All Card Expenses',
        data: cardTransactions
      });
      setIsModalOpen(true);
    } catch (err) {
      logger.error('Error fetching all transactions', err);
    } finally {
      setLoadingAll(false);
    }
  };

  const handleDateRangeModeChange = (mode: DateRangeMode) => {
    setDateRangeMode(mode);
    // Mode change handled by context, no custom logic needed
  };




  // Category editing handlers
  const handleCategoryEditClick = (description: string, currentCategory: string) => {
    setEditingDescription(description);
    setEditCategory(currentCategory || '');
  };

  const handleCategorySave = async (description: string) => {
    if (!editCategory.trim()) {
      setSnackbar({
        open: true,
        message: 'Category cannot be empty',
        severity: 'error'
      });
      return;
    }

    try {
      const response = await fetch('/api/categories/update-by-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: description,
          newCategory: editCategory.trim(),
          createRule: true
        }),
      });

      if (response.ok) {
        const result = await response.json();

        // Update local data
        setData(prevData =>
          prevData.map(row =>
            row.description === description
              ? { ...row, category: editCategory.trim() }
              : row
          )
        );

        const message = result.transactionsUpdated > 1
          ? `Updated ${result.transactionsUpdated} transactions with "${description}" to "${editCategory}". Rule saved for future transactions.`
          : `Category updated to "${editCategory}". Rule saved for future transactions.`;

        setSnackbar({
          open: true,
          message,
          severity: 'success'
        });

        // Trigger a refresh of any other open components
        window.dispatchEvent(new CustomEvent('dataRefresh'));
      } else {
        setSnackbar({
          open: true,
          message: 'Failed to update category',
          severity: 'error'
        });
      }
    } catch (error) {
      logger.error('Error updating category', error, { description });
      setSnackbar({
        open: true,
        message: 'Error updating category',
        severity: 'error'
      });
    }

    setEditingDescription(null);
  };

  const handleCategoryCancel = () => {
    setEditingDescription(null);
    setEditCategory('');
  };

  const handleDescriptionClick = async (description: string) => {
    if (dateRangeMode === 'custom') {
      if (!customStartDate || !customEndDate) return;
    } else {
      if (!selectedYear || !selectedMonth) return;
    }

    try {
      setLoadingDescription(description);

      let url: string;
      if (dateRangeMode === 'custom') {
        url = `/api/transactions?startDate=${customStartDate}&endDate=${customEndDate}&description=${encodeURIComponent(description)}`;
      } else if (dateRangeMode === 'billing') {
        const billingCycle = `${selectedYear}-${selectedMonth}`;
        url = `/api/transactions?billingCycle=${billingCycle}&description=${encodeURIComponent(description)}`;
      } else {
        url = `/api/transactions?startDate=${startDate}&endDate=${endDate}&description=${encodeURIComponent(description)}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const transactions = await response.json();

      setModalData({
        type: description,
        data: transactions
      });
      setIsModalOpen(true);
    } catch (err) {
      logger.error('Error fetching transactions by description', err);
    } finally {
      setLoadingDescription(null);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;

    try {
      setIsSearching(true);

      let queryParams = `q=${encodeURIComponent(searchQuery)}`;

      if (dateRangeMode === 'custom' && customStartDate && customEndDate) {
        queryParams += `&startDate=${customStartDate}&endDate=${customEndDate}`;
      } else if (dateRangeMode === 'billing' && selectedYear && selectedMonth) {
        queryParams += `&billingCycle=${selectedYear}-${selectedMonth}`;
      } else if (startDate && endDate) {
        queryParams += `&startDate=${startDate}&endDate=${endDate}`;
      }

      const response = await fetch(`/api/transactions?${queryParams}`);
      if (response.ok) {
        const results = await response.json();
        setModalData({
          type: `Search: "${searchQuery}"`,
          data: results
        });
        setIsModalOpen(true);
      }
    } catch (error) {
      logger.error('Search error', error, { query: searchQuery });
      setSnackbar({
        open: true,
        message: 'Search failed',
        severity: 'error'
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleBankAccountClick = async (bank: ScrapedBankSummary) => {
    if (dateRangeMode === 'custom') {
      if (!customStartDate || !customEndDate) return;
    } else {
      if (!selectedYear || !selectedMonth) return;
    }

    try {
      setLoading(true);

      const params = new URLSearchParams();

      if (dateRangeMode === 'custom') {
        params.set('startDate', customStartDate);
        params.set('endDate', customEndDate);
      } else if (dateRangeMode === 'billing') {
        params.set('billingCycle', `${selectedYear}-${selectedMonth}`);
      } else {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }

      if (bank.bank_account_id) {
        params.set('bankAccountId', String(bank.bank_account_id));
        if (bank.bank_account_number) {
          params.set('bankAccountNumber', bank.bank_account_number);
        }
      } else {
        params.set('bankVendor', bank.bank_account_vendor || 'Other');
      }

      const url = `/api/transactions?${params.toString()}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const transactions = await response.json();

      // Filter: Show ONLY bank transactions (scraped from bank)
      const bankTransactions = transactions.filter((t: BankCheckTransaction) => isBankTransaction(t));

      setModalData({
        type: `${bank.bank_account_nickname} (Bank Activity)`,
        data: bankTransactions
      });
      setIsModalOpen(true);
    } catch (err) {
      logger.error('Error fetching bank transactions', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBankCCClick = async (bank: BankCCSummary) => {
    if (dateRangeMode === 'custom') {
      if (!customStartDate || !customEndDate) return;
    } else {
      if (!selectedYear || !selectedMonth) return;
    }

    try {
      setLoading(true);

      const params = new URLSearchParams();

      if (dateRangeMode === 'custom') {
        params.set('startDate', customStartDate);
        params.set('endDate', customEndDate);
      } else if (dateRangeMode === 'billing') {
        params.set('billingCycle', `${selectedYear}-${selectedMonth}`);
      } else {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }

      if (bank.bank_account_id) {
        params.set('bankAccountId', String(bank.bank_account_id));
      }
      // For unassigned cards, we don't add bankAccountId filter
      // We'll filter client-side based on which cards are unassigned

      const url = `/api/transactions?${params.toString()}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const transactions = await response.json();

      // Filter: Show ONLY Credit Card transactions (Exclude bank self-txns)
      let ccTransactions = transactions.filter((t: BankCheckTransaction) => !isBankTransaction(t));

      // If unassigned, filter to only show transactions from unassigned cards
      if (!bank.bank_account_id) {
        // Get list of unassigned card last4digits from cardSummary
        const unassignedCards = cardSummary
          .filter(card => !card.bank_account_id && !card.custom_bank_account_nickname && !card.custom_bank_account_number)
          .map(card => card.last4digits);

        ccTransactions = ccTransactions.filter((t: BankCheckTransaction) => {
          const txnLast4 = t.account_number ? String(t.account_number).slice(-4) : null;
          return txnLast4 && unassignedCards.includes(txnLast4);
        });
      }

      setModalData({
        type: `Cards linked to ${bank.bank_account_nickname}`,
        data: ccTransactions
      });
      setIsModalOpen(true);
    } catch (err) {
      logger.error('Error fetching linked card transactions', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLast4DigitsClick = async (last4digits: string) => {
    if (dateRangeMode === 'custom') {
      if (!customStartDate || !customEndDate) return;
    } else {
      if (!selectedYear || !selectedMonth) return;
    }

    try {
      setLoadingLast4(last4digits);

      let url: string;
      if (dateRangeMode === 'custom') {
        url = `/api/transactions?startDate=${customStartDate}&endDate=${customEndDate}&last4digits=${encodeURIComponent(last4digits)}`;
      } else if (dateRangeMode === 'billing') {
        const billingCycle = `${selectedYear}-${selectedMonth}`;
        url = `/api/transactions?billingCycle=${billingCycle}&last4digits=${encodeURIComponent(last4digits)}`;
      } else {
        url = `/api/transactions?startDate=${startDate}&endDate=${endDate}&last4digits=${encodeURIComponent(last4digits)}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const transactions = await response.json();

      // Determine if it's a bank account for the modal title
      const cardInfo = cardSummary.find(c => c.last4digits === last4digits);
      const isBank = cardInfo?.transaction_vendor && BANK_VENDORS.includes(cardInfo.transaction_vendor) ||
        cardInfo?.bank_account_vendor && BANK_VENDORS.includes(cardInfo.bank_account_vendor) && !cardInfo.card_vendor;

      setModalData({
        type: isBank ? `Account ending in ${last4digits}` : `Card ending in ${last4digits}`,
        data: transactions
      });
      setIsModalOpen(true);
    } catch (err) {
      logger.error('Error fetching transactions by last4', err);
    } finally {
      setLoadingLast4(null);
    }
  };

  // Calculate totals from card summary (excluding bank accounts)
  const totals = useMemo(() => {
    return cardSummary.reduce(
      (acc, card) => {
        const cardVendor = cardVendorMap[card.last4digits];
        const transVendor = card.transaction_vendor;
        const isBank = (transVendor && BANK_VENDORS.includes(transVendor)) ||
          (cardVendor && BANK_VENDORS.includes(cardVendor));

        if (!isBank) {
          acc.card_expenses += card.card_expenses;
        }
        return acc;
      },
      { card_expenses: 0 }
    );
  }, [cardSummary, cardVendorMap]);

  // Update AI Assistant screen context when data changes
  useEffect(() => {
    // getDateRangeForContext removed


    // Group expenses by category equivalent for summary
    const categoryTotals: { [key: string]: number } = {};
    data.forEach(item => {
      const categoryKey = item.category || 'Uncategorized';
      categoryTotals[categoryKey] = (categoryTotals[categoryKey] || 0) + Number(item.card_expenses);
    });
    const categorySummary = Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));

    setScreenContext({
      view: 'summary',
      dateRange: {
        startDate,
        endDate,
        mode: dateRangeMode
      },
      summary: {
        totalIncome: 0,
        totalExpenses: totals.card_expenses,
        creditCardExpenses: totals.card_expenses,
        categories: categorySummary
      }
    });
  }, [data, totals.card_expenses, dateRangeMode, selectedYear, selectedMonth, customStartDate, customEndDate, setScreenContext, startDate, endDate]);

  // Sorting handler
  const handleSortChange = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Sort the data
  const sortedData = useMemo(() => {
    if (!data.length) return data;

    // For breakdown table, we now use server-side sorting for pagination consistency
    if (groupBy === 'description' || groupBy === 'last4digits') {
      return data;
    }

    return [...data].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          const nameA = a.vendor_nickname || a.vendor || '';
          const nameB = b.vendor_nickname || b.vendor || '';
          comparison = nameA.localeCompare(nameB);
          break;
        case 'count':
          comparison = (a.transaction_count || 0) - (b.transaction_count || 0);
          break;
        case 'card_expenses':
          comparison = Number(a.card_expenses) - Number(b.card_expenses);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortField, sortDirection, groupBy]);

  if (error) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '64px',
        color: '#ef4444'
      }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      background: 'transparent',
      overflow: 'hidden'
    }}>
      {/* Animated background elements - hidden on mobile for performance */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <div style={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.08) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          zIndex: 0
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-10%',
          left: '-5%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(167, 139, 250, 0.06) 0%, transparent 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          zIndex: 0
        }} />
      </Box>

      {/* Main content container */}
      <Box sx={{
        padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
        maxWidth: '1440px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1,
        color: theme.palette.text.primary
      }}>
        {/* Hero Section with Filters */}
        <Box sx={{
          background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          borderRadius: { xs: '20px', md: '32px' },
          padding: { xs: '16px', sm: '24px', md: '36px' },
          marginBottom: { xs: '16px', md: '32px' },
          marginTop: { xs: '56px', md: '40px' },
          marginLeft: { xs: '8px', md: '24px' },
          marginRight: { xs: '8px', md: '24px' },
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
        }}>
          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', md: 'flex-start' },
            gap: { xs: '16px', md: '24px' }
          }}>
            <div>
              <Box component="h1" sx={{
                fontSize: { xs: '22px', md: '28px' },
                fontWeight: 700,
                margin: 0,
                background: theme.palette.mode === 'dark'
                  ? 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)'
                  : 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>Monthly Summary</Box>
              <Box component="p" sx={{
                color: 'text.secondary',
                marginTop: '8px',
                marginBottom: 0,
                fontSize: { xs: '14px', md: '16px' }
              }}>
                Overview of credit card expenses for{' '}
                {dateRangeMode === 'custom'
                  ? (customStartDate && customEndDate
                    ? `${new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : 'custom date range')
                  : (selectedMonth && selectedYear &&
                    new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1)
                      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
                }
              </Box>
            </div>

            {/* Controls */}
            <Box sx={{
              display: 'flex',
              gap: { xs: '8px', md: '16px' },
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: { xs: 'center', md: 'flex-end' }
            }}>


              <IconButton
                onClick={handleRefresh}
                sx={{
                  ...buttonStyle,
                  color: 'text.secondary',
                  '&:hover': {
                    transform: 'translateY(-2px) scale(1.05)',
                    boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)',
                    background: theme.palette.mode === 'dark' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(96, 165, 250, 0.15)',
                    color: 'primary.main'
                  }
                }}>
                <RefreshIcon />
              </IconButton>

              {dateRangeMode !== 'custom' && (
                <>
                  <select
                    value={selectedYear}
                    onChange={handleYearChange}
                    style={{ ...selectStyle, minWidth: '120px' }}
                  >
                    {uniqueYears.map((year) => (
                      <option key={year} value={year} style={{ background: theme.palette.background.paper, color: theme.palette.text.primary }}>
                        {year}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedMonth}
                    onChange={handleMonthChange}
                    style={{ ...selectStyle, minWidth: '160px' }}
                  >
                    {uniqueMonths.map((month) => (
                      <option key={month} value={month} style={{ background: theme.palette.background.paper, color: theme.palette.text.primary }}>
                        {new Date(`2024-${month}-01`).toLocaleDateString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {/* Date Range Mode Toggle */}
              <div style={{
                display: 'flex',
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                border: `1px solid ${theme.palette.divider}`,
                padding: '4px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
              }}>
                <button
                  onClick={() => handleDateRangeModeChange('calendar')}
                  title="Full month (1st - end of month)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: dateRangeMode === 'calendar'
                      ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)'
                      : 'transparent',
                    color: dateRangeMode === 'calendar' ? '#ffffff' : theme.palette.text.secondary,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'calendar'
                      ? '0 4px 12px rgba(59, 130, 246, 0.3)'
                      : 'none'
                  }}
                >
                  <CalendarMonthIcon style={{ fontSize: '18px' }} />
                  <span>1-31</span>
                </button>
                <button
                  onClick={() => handleDateRangeModeChange('billing')}
                  title="Billing cycle (uses actual billing date from credit card)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: dateRangeMode === 'billing'
                      ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' // Unified Blue
                      : 'transparent',
                    color: dateRangeMode === 'billing' ? '#ffffff' : theme.palette.text.secondary,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'billing'
                      ? '0 4px 12px rgba(59, 130, 246, 0.3)'
                      : 'none'
                  }}
                >
                  <DateRangeIcon style={{ fontSize: '18px' }} />
                  <span>Cycle</span>
                </button>
                <button
                  onClick={() => handleDateRangeModeChange('custom')}
                  title="Custom date range (up to 5 years)"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: 'none',
                    background: dateRangeMode === 'custom'
                      ? 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)' // Unified Blue
                      : 'transparent',
                    color: dateRangeMode === 'custom' ? '#ffffff' : theme.palette.text.secondary,
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'custom'
                      ? '0 4px 12px rgba(59, 130, 246, 0.3)'
                      : 'none'
                  }}
                >
                  <TuneIcon style={{ fontSize: '18px' }} />
                  <span>Custom</span>
                </button>
              </div>
            </Box>
          </Box>

          {/* Search Bar - New Location */}
          <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: '16px', marginBottom: '8px' }}>
            <Box
              component="form"
              onSubmit={handleSearch}
              sx={{
                display: 'flex',
                alignItems: 'center',
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                padding: '4px 8px 4px 16px',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                width: '100%',
                maxWidth: '600px',
                '&:focus-within': {
                  borderColor: 'primary.main',
                  boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)'
                }
              }}
            >
              <input
                type="text"
                placeholder="Search transactions (vendor, description, etc)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '14px',
                  width: '100%',
                  color: theme.palette.text.primary,
                  fontWeight: 500
                }}
              />
              <IconButton
                type="submit"
                size="small"
                disabled={isSearching}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main', background: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)' }
                }}
              >
                {isSearching ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
              </IconButton>
            </Box>
          </Box>

          {/* Date range indicator */}
          {dateRangeMode === 'custom' ? (
            <div style={{
              marginTop: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
                justifyContent: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: theme.palette.text.secondary, fontSize: '14px', fontWeight: 500 }}>From:</span>
                  <TextField
                    type="date"
                    value={customStartDate}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '12px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                        color: theme.palette.text.primary,
                        '& fieldset': {
                          borderColor: dateRangeError ? '#ef4444' : theme.palette.divider,
                        },
                        '&:hover fieldset': {
                          borderColor: '#10b981',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#10b981',
                        },
                      },
                      '& .MuiInputBase-input': {
                        padding: '10px 14px',
                        fontSize: '14px',
                        colorScheme: theme.palette.mode
                      },
                      '& .MuiSvgIcon-root': {
                        color: theme.palette.text.secondary
                      }
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: theme.palette.text.secondary, fontSize: '14px', fontWeight: 500 }}>To:</span>
                  <TextField
                    type="date"
                    value={customEndDate}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    size="small"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '12px',
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                        color: theme.palette.text.primary,
                        '& fieldset': {
                          borderColor: dateRangeError ? '#ef4444' : theme.palette.divider,
                        },
                        '&:hover fieldset': {
                          borderColor: '#10b981',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#10b981',
                        },
                      },
                      '& .MuiInputBase-input': {
                        padding: '10px 14px',
                        fontSize: '14px',
                        colorScheme: theme.palette.mode
                      },
                      '& .MuiSvgIcon-root': {
                        color: theme.palette.text.secondary
                      }
                    }}
                  />
                </div>
              </div>
              {dateRangeError && (
                <span style={{
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: 500,
                  background: 'rgba(239, 68, 68, 0.1)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                  {dateRangeError}
                </span>
              )}
              {customStartDate && customEndDate && !dateRangeError && (
                <span style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  color: '#10b981',
                  fontSize: '13px',
                  fontWeight: 500
                }}>
                  📅 {new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          ) : selectedYear && selectedMonth && dateRangeMode === 'billing' ? (
            <div style={{
              marginTop: '16px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '14px',
              fontWeight: 500
            }}>
              <span style={{
                background: 'rgba(139, 92, 246, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(139, 92, 246, 0.2)'
              }}>
                💳 Billing Cycle: {new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
          ) : null}
        </Box>

        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '300px'
          }}>
            <CircularProgress size={60} style={{ color: '#3b82f6' }} />
          </div>
        ) : (
          <>
            {/* Summary Cards Section */}
            <Box sx={{
              background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(20px)',
              borderRadius: { xs: '20px', md: '32px' },
              padding: { xs: '16px', sm: '20px', md: '24px 32px' },
              marginLeft: { xs: '8px', md: '24px' },
              marginRight: { xs: '8px', md: '24px' },
              marginBottom: { xs: '16px', md: '32px' },
              border: `1px solid ${theme.palette.divider}`,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}>
              <Box sx={{
                display: 'flex',
                gap: { xs: '12px', md: '16px' },
                flexWrap: 'wrap',
                justifyContent: 'flex-start',
                alignItems: 'stretch'
              }}>
                {/* Total Card Expenses - Main Card */}
                <Box
                  onClick={handleAllTransactionsClick}
                  sx={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    borderRadius: '20px',
                    padding: { xs: '16px', md: '20px 24px' },
                    minWidth: { xs: '100%', sm: '200px' },
                    flex: { xs: '1 1 100%', sm: '0 0 auto' },
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3)',
                    opacity: loadingAll ? 0.7 : 1,
                    '&:hover': {
                      transform: { xs: 'none', md: 'translateY(-2px)' },
                      boxShadow: { xs: '0 4px 16px rgba(59, 130, 246, 0.3)', md: '0 8px 24px rgba(59, 130, 246, 0.4)' },
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.3)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    {loadingAll ? (
                      <CircularProgress size={20} style={{ color: 'white' }} />
                    ) : (
                      <CreditCardIcon sx={{ color: 'white', fontSize: '20px' }} />
                    )}
                    <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontWeight: 600 }}>
                      Total Expenses
                    </span>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'white' }}>
                    ₪{formatNumber(totals.card_expenses)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                    Click to view all
                  </div>
                </Box>

                {/* Individual Cards by Last 4 Digits */}
                {cardSummary
                  .filter(card => {
                    const cardVendor = cardVendorMap[card.last4digits];
                    const transVendor = card.transaction_vendor;
                    const isBank = (transVendor && BANK_VENDORS.includes(transVendor)) ||
                      (cardVendor && BANK_VENDORS.includes(cardVendor));
                    return !isBank;
                  })
                  .map((card) => {
                    const isLoading = loadingLast4 === card.last4digits;
                    const percentage = totals.card_expenses > 0
                      ? Math.round((card.card_expenses / totals.card_expenses) * 100)
                      : 0;
                    const cardVendor = cardVendorMap[card.last4digits];
                    const transVendor = card.transaction_vendor;
                    const isBank = (transVendor && BANK_VENDORS.includes(transVendor)) ||
                      (cardVendor && BANK_VENDORS.includes(cardVendor));

                    return (
                      <Box
                        key={card.last4digits}
                        sx={{
                          background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(248, 250, 252, 0.8)',
                          borderRadius: '16px',
                          padding: '16px 20px',
                          minWidth: '160px',
                          cursor: 'pointer',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          border: `1px solid ${theme.palette.divider}`,
                          opacity: isLoading ? 0.7 : 1,
                          position: 'relative',
                          '&:hover': {
                            transform: 'translateY(-2px)',
                            background: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
                            borderColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                            '& .vendor-settings-btn': {
                              opacity: 1
                            }
                          }
                        }}
                        onClick={() => handleLast4DigitsClick(card.last4digits)}
                      >
                        {/* Settings button for vendor selection */}
                        <IconButton
                          className="vendor-settings-btn"
                          size="small"
                          onClick={(e) => handleVendorMenuOpen(e, card.last4digits)}
                          sx={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            opacity: 0,
                            transition: 'opacity 0.2s',
                            padding: '4px',
                            color: 'text.secondary',
                            '&:hover': {
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              color: 'primary.main'
                            }
                          }}
                        >
                          <SettingsIcon sx={{ fontSize: '16px' }} />
                        </IconButton>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          {isLoading ? (
                            <CircularProgress size={20} style={{ color: '#3b82f6' }} />
                          ) : isBank ? (
                            <AccountBalanceIcon sx={{ fontSize: 24, color: 'primary.main' }} />
                          ) : (
                            <CardVendorIcon vendor={cardVendor || null} size={28} />
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                            {cardNicknameMap[card.last4digits] ? (
                              <>
                                <Box component="span" sx={{
                                  color: 'text.primary',
                                  fontSize: '13px',
                                  fontWeight: 700,
                                }}>
                                  {cardNicknameMap[card.last4digits]}
                                </Box>
                                <Box component="span" sx={{
                                  color: 'text.secondary',
                                  fontSize: '11px',
                                  fontFamily: 'monospace',
                                  letterSpacing: '1px'
                                }}>
                                  {isBank ? 'Account' : '••••'} {card.last4digits}
                                </Box>
                              </>
                            ) : (
                              <Box component="span" sx={{
                                color: 'text.secondary',
                                fontSize: '13px',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                letterSpacing: '1px'
                              }}>
                                {isBank ? 'Account' : '••••'} {card.last4digits}
                              </Box>
                            )}
                            {card.bank_account_nickname && (
                              <span style={{
                                color: '#3b82f6',
                                fontSize: '10px',
                                fontWeight: 500,
                                marginTop: '2px',
                                opacity: 0.8
                              }}>
                                Bank: {card.bank_account_nickname}
                              </span>
                            )}
                          </div>
                        </div>
                        <Box sx={{ fontSize: '18px', fontWeight: 700, color: 'primary.main' }}>
                          ₪{formatNumber(card.card_expenses > 0 ? card.card_expenses : card.bank_expenses)}
                        </Box>
                        <Box sx={{
                          fontSize: '11px',
                          color: 'text.secondary',
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <div style={{
                            flex: 1,
                            height: '4px',
                            background: theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                            borderRadius: '2px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${percentage}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                              borderRadius: '2px',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                          <span>{percentage}%</span>
                        </Box>
                      </Box>
                    );
                  })}

                {/* 1. Bank Accounts Section (Scraped Data) */}
                {scrapedBankSummary.length > 0 && (
                  <Box sx={{ width: '100%', pt: 2, borderTop: `1px solid ${theme.palette.divider}`, mt: 1 }}>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
                      Bank Accounts (Net Flow)
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {scrapedBankSummary.map((bank) => (
                        <Box
                          key={bank.bank_account_id ? `id-${bank.bank_account_id}` : `vend-${bank.bank_account_vendor}`}
                          onClick={() => handleBankAccountClick(bank)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            p: 1.5,
                            borderRadius: '12px',
                            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                            border: `1px solid ${theme.palette.divider}`,
                            minWidth: '220px',
                            flex: '1 1 auto',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease-in-out',
                            position: 'relative',
                            overflow: 'hidden',
                            '&:hover': {
                              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                              borderColor: 'primary.main',
                              transform: 'translateY(-2px)'
                            }
                          }}
                        >
                          {/* Accent bar based on net flow */}
                          <Box sx={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: '4px',
                            backgroundColor: bank.net_flow >= 0 ? '#10B981' : '#F43F5E'
                          }} />

                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.1)' : 'rgba(241, 245, 249, 0.8)',
                              borderRadius: '10px',
                              color: 'text.secondary',
                              ml: 1
                            }}
                          >
                            <AccountBalanceIcon sx={{ fontSize: 20 }} />
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
                              {bank.bank_account_nickname}
                            </Typography>
                            {(bank.bank_account_number || bank.bank_account_vendor) && (
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '10px' }}>
                                {bank.bank_account_vendor} {bank.bank_account_number ? `• ${bank.bank_account_number}` : ''}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ textAlign: 'right' }}>
                            <Typography variant="body2" sx={{
                              fontWeight: 700,
                              color: bank.net_flow >= 0 ? '#10B981' : '#F43F5E'
                            }}>
                              {bank.net_flow >= 0 ? '+' : ''}₪{formatNumber(bank.net_flow)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* 2. Credit Card Expenses by Bank Section */}
                {creditCardBankSummary.length > 0 && (
                  <Box sx={{ width: '100%', pt: 2, borderTop: `1px solid ${theme.palette.divider}`, mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
                      Credit Card Usage by Linked Bank
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {creditCardBankSummary.map((bank) => (
                        <Box
                          key={bank.bank_account_id ? `cc-id-${bank.bank_account_id}` : `cc-nick-${bank.bank_account_nickname}`}
                          onClick={() => handleBankCCClick(bank)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.5,
                            p: 1.5,
                            borderRadius: '12px',
                            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                            border: `1px solid ${theme.palette.divider}`,
                            minWidth: '200px',
                            flex: '1 1 auto',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease-in-out',
                            '&:hover': {
                              backgroundColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                              borderColor: 'primary.main',
                              transform: 'translateY(-2px)'
                            }
                          }}
                        >
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              borderRadius: '10px',
                              color: '#3B82F6'
                            }}
                          >
                            <CreditCardIcon sx={{ fontSize: 20 }} />
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
                              {bank.bank_account_nickname}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '10px' }}>
                              {bank.card_count} {bank.card_count === 1 ? 'card' : 'cards'} linked
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                            ₪{formatNumber(bank.total_cc_expenses)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Vendor Selection Menu */}
                <Menu
                  anchorEl={vendorMenuAnchor}
                  open={Boolean(vendorMenuAnchor)}
                  onClose={handleVendorMenuClose}
                  PaperProps={{
                    sx: {
                      borderRadius: '16px',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
                      minWidth: '240px',
                      maxHeight: '500px',
                      background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.95)' : undefined,
                      backdropFilter: 'blur(10px)',
                      border: `1px solid ${theme.palette.divider}`
                    }
                  }}
                >
                  {/* Nickname Field */}
                  <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <span style={{ fontSize: '12px', color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                      Card Nickname
                    </span>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="e.g., My Personal Card"
                      value={editingNickname}
                      onChange={(e) => setEditingNickname(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && selectedCardForVendor) {
                          handleNicknameSave(selectedCardForVendor, editingNickname);
                        }
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      InputProps={{
                        endAdornment: editingNickname !== (cardNicknameMap[selectedCardForVendor || ''] || '') && (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedCardForVendor) {
                                handleNicknameSave(selectedCardForVendor, editingNickname);
                              }
                            }}
                            sx={{ color: '#10b981' }}
                          >
                            <CheckIcon sx={{ fontSize: '18px' }} />
                          </IconButton>
                        )
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '10px',
                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.5)' : '#f8fafc',
                          color: 'text.primary'
                        }
                      }}
                    />
                  </Box>

                  <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <span style={{ fontSize: '12px', color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase' }}>
                      Card Vendor
                    </span>
                  </Box>
                  {Object.entries(CARD_VENDORS).map(([key, config]) => (
                    <MenuItem
                      key={key}
                      onClick={() => handleVendorSelect(key)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        py: 1.5,
                        '&:hover': {
                          backgroundColor: 'rgba(59, 130, 246, 0.08)'
                        }
                      }}
                    >
                      <CardVendorIcon vendor={key} size={32} />
                      <span style={{ fontWeight: 500, color: theme.palette.text.primary }}>{config.name}</span>
                      {cardVendorMap[selectedCardForVendor || ''] === key && (
                        <CheckIcon sx={{ fontSize: '18px', color: '#10b981', ml: 'auto' }} />
                      )}
                    </MenuItem>
                  ))}
                </Menu>
              </Box>
            </Box>

            {/* Breakdown Table */}
            <Box sx={{
              background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(20px)',
              borderRadius: { xs: '20px', md: '32px' },
              padding: { xs: '16px', md: '32px' },
              marginLeft: { xs: '8px', md: '24px' },
              marginRight: { xs: '8px', md: '24px' },
              border: `1px solid ${theme.palette.divider}`,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}>
              <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', md: 'center' },
                marginBottom: { xs: '16px', md: '24px' },
                gap: { xs: '12px', md: '16px' }
              }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box component="h2" sx={{
                    fontSize: { xs: '16px', md: '20px' },
                    fontWeight: 700,
                    margin: 0,
                    color: 'text.primary'
                  }}>
                    {groupBy === 'description'
                      ? 'Breakdown by Description'
                      : groupBy === 'last4digits'
                        ? 'Breakdown by Last 4 Digits'
                        : 'Breakdown by Card / Account'}
                  </Box>

                  {/* Filter toggle for excluding bank transactions - only show for description view */}
                  {groupBy === 'description' && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={showBankTransactions}
                          onChange={(e) => setShowBankTransactions(e.target.checked)}
                          size="small"
                          sx={{
                            '& .MuiSwitch-switchBase.Mui-checked': {
                              color: '#3b82f6',
                            },
                            '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                              backgroundColor: '#3b82f6',
                            },
                          }}
                        />
                      }
                      label={
                        <Typography sx={{
                          fontSize: '12px',
                          color: 'text.secondary',
                          fontWeight: 500
                        }}>
                          Show Bank Transactions
                        </Typography>
                      }
                      sx={{ margin: 0 }}
                    />
                  )}
                </Box>

                {/* Sorting Controls */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                    <SortIcon sx={{ fontSize: '16px' }} />
                    Sort:
                  </div>
                  {[
                    { field: 'name' as SortField, label: 'Name' },
                    ...(groupBy === 'description' || groupBy === 'last4digits' ? [{ field: 'count' as SortField, label: 'Count' }] : []),
                    { field: 'card_expenses' as SortField, label: 'Amount' }
                  ].map(({ field, label }) => (
                    <button
                      key={field}
                      onClick={() => handleSortChange(field)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: sortField === field
                          ? (theme.palette.mode === 'dark' ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(59, 130, 246, 0.4)')
                          : `1px solid ${theme.palette.divider}`,
                        background: sortField === field
                          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.08) 100%)'
                          : (theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)'),
                        color: sortField === field ? '#3b82f6' : 'text.secondary',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease-in-out',
                      }}
                    >
                      {label}
                      {sortField === field && (
                        sortDirection === 'asc'
                          ? <ArrowUpwardIcon sx={{ fontSize: '14px' }} />
                          : <ArrowDownwardIcon sx={{ fontSize: '14px' }} />
                      )}
                    </button>
                  ))}
                </div>
              </Box>

              {sortedData.length === 0 ? (
                <Box sx={{
                  textAlign: 'center',
                  padding: { xs: '24px', md: '48px' },
                  color: '#64748b'
                }}>
                  No transactions found for this period.
                </Box>
              ) : (
                <Box sx={{
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  mx: { xs: -2, md: 0 },
                  px: { xs: 2, md: 0 }
                }}>
                  <Box component="table" sx={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: { xs: '12px', md: '14px' },
                    minWidth: { xs: '500px', md: 'auto' }
                  }}>
                    <thead>
                      <tr style={{
                        borderBottom: `2px solid ${theme.palette.divider}`
                      }}>
                        <th style={{
                          padding: '16px 12px',
                          textAlign: 'left',
                          color: 'text.secondary',
                          fontWeight: 600,
                          fontSize: '13px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          {groupBy === 'description'
                            ? 'Description'
                            : groupBy === 'last4digits'
                              ? 'Last 4 Digits'
                              : 'Card / Account'}
                        </th>
                        {groupBy === 'description' && (
                          <th style={{
                            padding: '16px 12px',
                            textAlign: 'left',
                            color: 'text.secondary',
                            fontWeight: 600,
                            fontSize: '13px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>Category</th>
                        )}
                        {(groupBy === 'description' || groupBy === 'last4digits') && (
                          <th style={{
                            padding: '16px 12px',
                            textAlign: 'center',
                            color: '#64748b',
                            fontWeight: 600,
                            fontSize: '13px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>Count</th>
                        )}
                        <th style={{
                          padding: '16px 12px',
                          textAlign: 'right',
                          color: '#3B82F6',
                          fontWeight: 600,
                          fontSize: '13px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                            <CreditCardIcon sx={{ fontSize: '16px' }} />
                            Amount
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedData.map((row, index) => {
                        const rowKey = groupBy === 'description'
                          ? `description-${row.description}-${index}`
                          : groupBy === 'last4digits'
                            ? `last4-${row.last4digits}-${index}`
                            : `${row.month}-${row.vendor}`;
                        const displayName = groupBy === 'description'
                          ? row.description
                          : groupBy === 'last4digits'
                            ? row.last4digits || 'Unknown'
                            : (row.vendor_nickname || row.vendor);
                        const isClickable = (groupBy === 'description' && row.description) || (groupBy === 'last4digits' && row.last4digits);
                        const isLoading = loadingDescription === row.description || loadingLast4 === row.last4digits;

                        return (
                          <tr
                            key={rowKey}
                            style={{
                              borderBottom: `1px solid ${theme.palette.divider}`,
                              transition: 'background 0.2s ease',
                              background: index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.3)' : 'rgba(248, 250, 252, 0.5)'),
                              cursor: isClickable ? 'pointer' : 'default'
                            }}
                            onClick={() => {
                              if (groupBy === 'description' && row.description) {
                                handleDescriptionClick(row.description);
                              } else if (groupBy === 'last4digits' && row.last4digits) {
                                handleLast4DigitsClick(row.last4digits);
                              }
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = isClickable
                                ? 'rgba(96, 165, 250, 0.15)'
                                : 'rgba(96, 165, 250, 0.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : (theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.3)' : 'rgba(248, 250, 252, 0.5)');
                            }}
                          >
                            <td style={{
                              padding: '16px 12px',
                              fontWeight: 600,
                              color: isClickable ? '#3b82f6' : 'text.primary',
                              maxWidth: '300px'
                            }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                opacity: isLoading ? 0.5 : 1
                              }}>
                                {isLoading ? (
                                  <CircularProgress size={18} style={{ color: '#3b82f6' }} />
                                ) : groupBy === 'description' ? (
                                  <DescriptionIcon sx={{ fontSize: '18px', color: '#64748b' }} />
                                ) : (
                                  <CreditCardIcon sx={{ fontSize: '18px', color: '#3B82F6' }} />
                                )}
                                <span style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  textDecoration: isClickable ? 'underline' : 'none',
                                  textDecorationColor: 'rgba(59, 130, 246, 0.3)'
                                }}>
                                  {groupBy === 'last4digits' ? `****${displayName}` : displayName}
                                </span>
                              </div>
                            </td>
                            {groupBy === 'description' && (
                              <td style={{
                                padding: '16px 12px',
                                color: '#64748b',
                                fontWeight: 500
                              }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {editingDescription === row.description ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Autocomplete
                                      value={editCategory}
                                      onChange={(event, newValue) => setEditCategory(newValue || '')}
                                      onInputChange={(event, newInputValue) => setEditCategory(newInputValue)}
                                      freeSolo
                                      options={availableCategories}
                                      size="small"
                                      sx={{
                                        minWidth: 140,
                                        '& .MuiOutlinedInput-root': {
                                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.5)' : 'white',
                                          color: 'text.primary',
                                          '& fieldset': {
                                            borderColor: theme.palette.divider,
                                          },
                                          '&:hover fieldset': {
                                            borderColor: '#3b82f6',
                                          },
                                          '&.Mui-focused fieldset': {
                                            borderColor: '#3b82f6',
                                          },
                                        },
                                      }}
                                      renderInput={(params) => (
                                        <TextField
                                          {...params}
                                          placeholder="Category..."
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              handleCategorySave(row.description!);
                                            } else if (e.key === 'Escape') {
                                              handleCategoryCancel();
                                            }
                                          }}
                                          sx={{
                                            '& .MuiInputBase-input': {
                                              fontSize: '13px',
                                              padding: '6px 10px',
                                            },
                                          }}
                                        />
                                      )}
                                    />
                                    <IconButton
                                      size="small"
                                      onClick={() => handleCategorySave(row.description!)}
                                      sx={{
                                        color: '#4ADE80',
                                        padding: '4px',
                                        '&:hover': { backgroundColor: 'rgba(74, 222, 128, 0.1)' }
                                      }}
                                    >
                                      <CheckIcon sx={{ fontSize: '18px' }} />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      onClick={handleCategoryCancel}
                                      sx={{
                                        color: '#ef4444',
                                        padding: '4px',
                                        '&:hover': { backgroundColor: 'rgba(239, 68, 68, 0.1)' }
                                      }}
                                    >
                                      <CloseIcon sx={{ fontSize: '18px' }} />
                                    </IconButton>
                                  </div>
                                ) : (
                                  <span
                                    style={{
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      fontSize: '13px',
                                      cursor: 'pointer',
                                      color: '#3b82f6',
                                      fontWeight: 500,
                                      transition: 'all 0.2s ease-in-out',
                                      display: 'inline-block'
                                    }}
                                    onClick={() => handleCategoryEditClick(row.description!, row.category || '')}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                  >
                                    {row.category || 'Uncategorized'}
                                  </span>
                                )}
                              </td>
                            )}
                            {(groupBy === 'description' || groupBy === 'last4digits') && (
                              <td style={{
                                padding: '16px 12px',
                                textAlign: 'center',
                                color: '#64748b',
                                fontWeight: 500
                              }}>{row.transaction_count}</td>
                            )}
                            <td style={{
                              padding: '16px 12px',
                              textAlign: 'right',
                              color: groupBy === 'description'
                                ? (row.amount && row.amount >= 0 ? '#10B981' : '#F43F5E')
                                : '#3B82F6',
                              fontWeight: 600
                            }}>
                              {groupBy === 'description' && row.amount !== undefined
                                ? `${row.amount >= 0 ? '+' : ''}₪${formatNumber(Math.abs(row.amount))}`
                                : `₪${formatNumber(row.card_expenses)}`
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Totals row */}
                    <tfoot>
                      <tr style={{
                        borderTop: `2px solid ${theme.palette.divider}`,
                        background: theme.palette.mode === 'dark'
                          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.12) 100%)'
                          : 'rgba(248, 250, 252, 0.8)'
                      }}>
                        <td style={{
                          padding: '16px 12px',
                          fontWeight: 700,
                          color: theme.palette.text.primary,
                          fontSize: '15px'
                        }}>TOTAL</td>
                        {groupBy === 'description' && (
                          <td style={{
                            padding: '16px 12px'
                          }}></td>
                        )}
                        {(groupBy === 'description' || groupBy === 'last4digits') && (
                          <td style={{
                            padding: '16px 12px',
                            textAlign: 'center',
                            color: theme.palette.text.secondary,
                            fontWeight: 700,
                            fontSize: '15px'
                          }}>{sortedData.reduce((sum, row) => sum + Number(row.transaction_count || 0), 0)}</td>
                        )}
                        <td style={{
                          padding: '16px 12px',
                          textAlign: 'right',
                          color: groupBy === 'description'
                            ? (sortedData.reduce((sum, row) => sum + Number(row.amount || 0), 0) >= 0 ? '#10B981' : '#F43F5E')
                            : '#3B82F6',
                          fontWeight: 700,
                          fontSize: '15px'
                        }}>
                          {groupBy === 'description'
                            ? (() => {
                              const total = sortedData.reduce((sum, row) => sum + Number(row.amount || 0), 0);
                              return `${total >= 0 ? '+' : ''}₪${formatNumber(Math.abs(total))}`;
                            })()
                            : `₪${formatNumber(totals.card_expenses)}`
                          }
                        </td>
                      </tr>
                    </tfoot>
                  </Box>
                  {/* Load More Button */}
                  {data.length < total && (
                    <Box sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginTop: '24px',
                      padding: '16px'
                    }}>
                      <button
                        onClick={handleLoadMore}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 24px',
                          borderRadius: '16px',
                          border: `1px solid ${theme.palette.divider}`,
                          background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                          color: '#3b82f6',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                          backdropFilter: 'blur(10px)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
                          e.currentTarget.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.2)';
                          e.currentTarget.style.background = theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0) scale(1)';
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.08)';
                          e.currentTarget.style.background = theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                        }}
                      >
                        <RefreshIcon sx={{ fontSize: '18px' }} />
                        Load More Transactions ({total - data.length} remaining)
                      </button>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Transaction Details Modal */}
      {modalData && (
        <ExpensesModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          data={modalData}
          color="#3b82f6"
          setModalData={setModalData}
          currentMonth={dateRangeMode === 'custom' ? `${customStartDate}` : `${selectedYear}-${selectedMonth}`}
        />
      )}

      {/* Snackbar for feedback messages */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{
            width: '100%',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default MonthlySummary;
