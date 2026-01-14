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
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';
import ExpensesModal from './CategoryDashboard/components/ExpensesModal';
import Typography from '@mui/material/Typography';
import { ModalData } from './CategoryDashboard/types';
import { useCategories } from './CategoryDashboard/utils/useCategories';
import { CardVendorIcon, CARD_VENDORS } from './CardVendorsModal';
import { useScreenContext } from './Layout';
import { logger } from '../utils/client-logger';

// Maximum date range in years
const MAX_YEARS_RANGE = 5;

interface MonthlySummaryData {
  month: string;
  vendor?: string;
  vendor_nickname?: string | null;
  description?: string;
  category?: string;
  last4digits?: string;
  transaction_count?: number;
  card_expenses: number;
}

interface CardSummary {
  last4digits: string;
  card_expenses: number;
  card_vendor?: string | null;
  bank_account_id?: number | null;
  bank_account_nickname?: string | null;
  bank_account_number?: string | null;
  bank_account_vendor?: string | null;
  custom_bank_account_number?: string | null;
  custom_bank_account_nickname?: string | null;
}

interface BankAccountSummary {
  bank_account_id: number | null;
  bank_account_nickname: string;
  bank_account_number: string | null;
  bank_account_vendor: string | null;
  total_expenses: number;
}

type GroupByType = 'vendor' | 'description' | 'last4digits';
type DateRangeMode = 'calendar' | 'billing' | 'custom';
type SortField = 'name' | 'count' | 'card_expenses';
type SortDirection = 'asc' | 'desc';

// Helper function to calculate date range based on mode
const getDateRange = (year: string, month: string, mode: DateRangeMode, billingStartDay: number = 10): { startDate: string; endDate: string } => {
  const y = parseInt(year);
  const m = parseInt(month);

  if (mode === 'calendar') {
    // Full calendar month: 1st to last day of month
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(y, m, 0).getDate(); // Get last day of month
    const endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
    return { startDate, endDate };
  } else {
    // Billing cycle: (Start Day) of previous month to (Start Day - 1) of selected month
    // Example: Start Day = 10. Range: 10th Prev to 9th Curr.
    // Existing logic was 11th to 10th.
    // If I want to maintain compatibility where "10" (default) means "Cycle ends on 10th",
    // then Start = billingStartDay + 1. End = billingStartDay.

    let prevMonth = m - 1;
    let prevYear = y;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = y - 1;
    }

    // Start Day = Setting. To match "Cycle starts on X", we use X.
    // However, matching the "Default 10 = End 10" logic means Setting is CUTOFF.
    // I will use: Start = Setting + 1. End = Setting.
    const startDayVal = billingStartDay + 1;
    const endDayVal = billingStartDay;

    const startDate = `${prevYear}-${prevMonth.toString().padStart(2, '0')}-${startDayVal.toString().padStart(2, '0')}`;
    const endDate = `${year}-${month}-${endDayVal.toString().padStart(2, '0')}`;
    return { startDate, endDate };
  }
};

// Helper to format date range for display
const formatDateRangeDisplay = (year: string, month: string, mode: DateRangeMode, billingStartDay: number = 10): string => {
  const { startDate, endDate } = getDateRange(year, month, mode, billingStartDay);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startStr} - ${endStr}`;
};

const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('he-IL').format(Math.round(num));
};

const formatMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const BUTTON_STYLE = {
  background: 'rgba(255, 255, 255, 0.8)',
  backdropFilter: 'blur(10px)',
  padding: '14px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  color: '#475569',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)'
};

const SELECT_STYLE = {
  padding: '14px 28px',
  borderRadius: '16px',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  background: 'rgba(255, 255, 255, 0.8)',
  backdropFilter: 'blur(10px)',
  color: '#1e293b',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  outline: 'none',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
};

const MonthlySummary: React.FC = () => {
  const theme = useTheme();
  const [data, setData] = useState<MonthlySummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Month/Year selection
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [uniqueYears, setUniqueYears] = useState<string[]>([]);
  const [uniqueMonths, setUniqueMonths] = useState<string[]>([]);
  const [allAvailableDates, setAllAvailableDates] = useState<string[]>([]);


  // Grouping
  const [groupBy, setGroupBy] = useState<GroupByType>('description');

  // Date range mode
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>('billing');

  // Settings
  const [billingStartDay, setBillingStartDay] = useState<number>(10);

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
  const [bankAccountSummary, setBankAccountSummary] = useState<BankAccountSummary[]>([]);

  // Category editing
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<string>('');
  const { categories: availableCategories } = useCategories();
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

  // Custom date range state
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [dateRangeError, setDateRangeError] = useState<string>('');

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

  useEffect(() => {
    // Initialize state from local storage and settings
    const init = async () => {
      // Load persistence first
      const persistedMode = localStorage.getItem('monthlySummary_mode') as DateRangeMode | null;
      if (persistedMode) {
        setDateRangeMode(persistedMode);
      }

      // Fetch settings
      let startDay = 10;
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          startDay = parseInt(data.settings.billing_cycle_start_day) || 10;
          setBillingStartDay(startDay);
        }
      } catch (e) {
        logger.error('Error fetching settings, using default start day', e);
      }

      // Fetch available dates and initialize selection
      await fetchAvailableMonths();
      fetchCardVendors();
    }

    init();
  }, []);

  const fetchCardVendors = async () => {
    try {
      const response = await fetch('/api/card_vendors');
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
  };

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
      const response = await fetch('/api/card_vendors', {
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
      const response = await fetch('/api/card_vendors', {
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

  const fetchAvailableMonths = async () => {
    try {
      const response = await fetch('/api/available_months');
      const datesData = await response.json();
      setAllAvailableDates(datesData);

      // Sort dates in descending order to get the most recent first
      const sortedDates = datesData.sort((a: string, b: string) => b.localeCompare(a));

      // Default to current month/year (the current billing cycle)
      // Default to current month/year (the current billing cycle)
      // If today is past the 10th, we are in the cycle ending next month
      const now = new Date();
      let currentYear = now.getFullYear();
      let currentMonth = now.getMonth() + 1;

      if (now.getDate() > 10) {
        currentMonth += 1;
        if (currentMonth > 12) {
          currentMonth = 1;
          currentYear += 1;
        }
      }

      const currentYearStr = currentYear.toString();
      const currentMonthStr = String(currentMonth).padStart(2, '0');
      const currentYearMonth = `${currentYearStr}-${currentMonthStr}`;

      // Use current month if available, otherwise fall back to most recent
      const defaultDate = sortedDates.includes(currentYearMonth) ? currentYearMonth : sortedDates[0];
      const defaultYear = defaultDate.substring(0, 4);
      const defaultMonth = defaultDate.substring(5, 7);

      const years = Array.from(new Set(datesData.map((date: string) => date.substring(0, 4)))) as string[];

      setUniqueYears(years);
      setSelectedYear(defaultYear);

      // Get months for the default year
      const monthsForYear = datesData
        .filter((date: string) => date.startsWith(defaultYear))
        .map((date: string) => date.substring(5, 7));

      const months = Array.from(new Set(monthsForYear)) as string[];

      setUniqueMonths(months);
      setSelectedMonth(defaultMonth);
    } catch (error) {
      logger.error('Error fetching available months', error);
    }
  };

  const fetchMonthlySummary = useCallback(async () => {
    // For custom mode, we need custom dates; for other modes, we need year/month
    if (dateRangeMode === 'custom') {
      if (!customStartDate || !customEndDate) return;
    } else {
      if (!selectedYear || !selectedMonth) return;
    }

    try {
      setLoading(true);

      let url: string;
      let cardUrl: string;

      if (dateRangeMode === 'custom') {
        // In custom mode, use custom date range
        url = `/api/monthly_summary?startDate=${customStartDate}&endDate=${customEndDate}&groupBy=${groupBy}`;
        cardUrl = `/api/monthly_summary?startDate=${customStartDate}&endDate=${customEndDate}&groupBy=last4digits`;
      } else if (dateRangeMode === 'billing') {
        // In billing mode, filter by processed_date month (actual billing cycle from credit card)
        const billingCycle = `${selectedYear}-${selectedMonth}`;
        url = `/api/monthly_summary?billingCycle=${billingCycle}&groupBy=${groupBy}`;
        cardUrl = `/api/monthly_summary?billingCycle=${billingCycle}&groupBy=last4digits`;
      } else {
        // In calendar mode, use date range
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        url = `/api/monthly_summary?startDate=${startDate}&endDate=${endDate}&groupBy=${groupBy}`;
        cardUrl = `/api/monthly_summary?startDate=${startDate}&endDate=${endDate}&groupBy=last4digits`;
      }

      // Fetch both main data and card summary in parallel
      const [mainResponse, cardResponse] = await Promise.all([
        fetch(url),
        fetch(cardUrl)
      ]);

      if (!mainResponse.ok) {
        throw new Error('Failed to fetch monthly summary');
      }

      const result = await mainResponse.json();
      setData(result);

      if (cardResponse.ok) {
        interface CardAPIResponse {
          last4digits: string;
          card_expenses: string | number;
          bank_account_id?: number | null;
          bank_account_nickname?: string | null;
          bank_account_number?: string | null;
          bank_account_vendor?: string | null;
          custom_bank_account_number?: string | null;
          custom_bank_account_nickname?: string | null;
        }
        const cardResult: CardAPIResponse[] = await cardResponse.json();
        // Filter to only include cards with expenses (exclude 0 card_expenses)
        const cards: CardSummary[] = cardResult
          .filter((c) => Number(c.card_expenses) > 0)
          .map((c) => ({
            last4digits: c.last4digits,
            card_expenses: Number(c.card_expenses),
            bank_account_id: c.bank_account_id || null,
            bank_account_nickname: c.bank_account_nickname || null,
            bank_account_number: c.bank_account_number || null,
            bank_account_vendor: c.bank_account_vendor || null,
            // Prioritize custom details if they exist and no linked account
            custom_bank_account_number: c.custom_bank_account_number || null,
            custom_bank_account_nickname: c.custom_bank_account_nickname || null,
          }));
        setCardSummary(cards);

        // Process bank account summary from card data
        const bankSummaryMap = new Map<string, BankAccountSummary>();

        cards.forEach((card) => {
          let key = 'unassigned';
          let nickname = 'Unassigned Cards';
          let acctNumber: string | null = null;
          let vendor: string | null = null;
          let id: number | null = null;

          if (card.bank_account_id) {
            // Linked Account
            key = `id-${card.bank_account_id}`;
            id = card.bank_account_id;
            nickname = card.bank_account_nickname || 'Unknown Bank';
            acctNumber = card.bank_account_number || null;
            vendor = card.bank_account_vendor || null;
          } else if (card.custom_bank_account_number || card.custom_bank_account_nickname) {
            // Custom Account (Group by number if available, else nickname)
            const customKey = card.custom_bank_account_number || card.custom_bank_account_nickname || 'custom-unknown';
            key = `custom-${customKey}`;
            nickname = card.custom_bank_account_nickname || 'Custom Bank Account';
            acctNumber = card.custom_bank_account_number || null;
            vendor = 'Custom';
          }

          if (!bankSummaryMap.has(key)) {
            bankSummaryMap.set(key, {
              bank_account_id: id,
              bank_account_nickname: nickname,
              bank_account_number: acctNumber,
              bank_account_vendor: vendor || 'Unknown',
              total_expenses: 0
            });
          }

          const summary = bankSummaryMap.get(key)!;
          summary.total_expenses += card.card_expenses;
        });

        // Convert map to array and sort by expenses descending
        const bankSummaryArray = Array.from(bankSummaryMap.values())
          .sort((a, b) => b.total_expenses - a.total_expenses);

        setBankAccountSummary(bankSummaryArray);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, groupBy, dateRangeMode, customStartDate, customEndDate]);

  useEffect(() => {
    if (dateRangeMode === 'custom') {
      if (customStartDate && customEndDate) {
        // Ensure not null/undefined before checking
        fetchMonthlySummary();
      }
    } else if (selectedYear && selectedMonth) {
      fetchMonthlySummary();
    }
  }, [selectedYear, selectedMonth, groupBy, dateRangeMode, fetchMonthlySummary, customStartDate, customEndDate]);

  const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = event.target.value;
    setSelectedYear(newYear);
    localStorage.setItem('monthlySummary_year', newYear);

    // Update available months for the selected year
    const monthsForYear = allAvailableDates
      .filter((date: string) => date.startsWith(newYear))
      .map((date: string) => date.substring(5, 7));

    const uniqueMonthsForYear = Array.from(new Set(monthsForYear)) as string[];
    setUniqueMonths(uniqueMonthsForYear);

    // If current month is not available in new year, select the first available month
    if (!uniqueMonthsForYear.includes(selectedMonth)) {
      const firstMonth = uniqueMonthsForYear[0];
      setSelectedMonth(firstMonth);
      localStorage.setItem('monthlySummary_month', firstMonth);
    }
  };

  const handleMonthChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = event.target.value;
    setSelectedMonth(newMonth);
    localStorage.setItem('monthlySummary_month', newMonth);
  };

  const handleDateRangeModeChange = (mode: DateRangeMode) => {
    setDateRangeMode(mode);
    localStorage.setItem('monthlySummary_mode', mode);

    // When switching modes, we might want to "reset" the selected month to the smart default for that mode?
    // User requirement: "if i am on 1-31 show current month" (Calendar Mode).
    // If I switch to Billing, I should switch to Next Month if > 10th.
    // If I switch to Calendar, I should switch to Current Month (if today is > 10th, Calendar is physically same month, Billing is next).
    // Let's re-evaluate the selected month based on the NEW mode.

    const now = new Date();
    const currentDay = now.getDate();

    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth() + 1;

    if (mode === 'billing') {
      if (currentDay > billingStartDay) {
        targetMonth += 1;
        if (targetMonth > 12) { targetMonth = 1; targetYear += 1; }
      }
    }
    // Calendar mode defaults to current month (no change needed from now)

    const targetDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    // Check if target is available
    if (allAvailableDates.includes(targetDate)) {
      // Only auto-switch if the user hasn't explicitly navigated far away?
      // User asked: "remember my choice when moving from overvie and summary".
      // But also said "if i am on 1-31 show current month".
      // I'll assume that switching modes implies requesting the "Default View" for that mode.
      setSelectedYear(targetYear.toString());
      setSelectedMonth(String(targetMonth).padStart(2, '0'));
      localStorage.setItem('monthlySummary_year', targetYear.toString());
      localStorage.setItem('monthlySummary_month', String(targetMonth).padStart(2, '0'));
    }

    setDateRangeError('');

    if (mode === 'custom') {
      // Initialize custom dates if not set
      if (!customStartDate || !customEndDate) {
        // Default to last 3 months from today
        const today = new Date();
        const threeMonthsAgo = new Date(today);
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        setCustomStartDate(formatDate(threeMonthsAgo));
        setCustomEndDate(formatDate(today));
      }
    }
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
    if (dateRangeMode === 'custom') {
      if (customStartDate && customEndDate && validateDateRange(customStartDate, customEndDate)) {
        fetchMonthlySummary();
      }
    } else {
      fetchMonthlySummary();
    }
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
      if (dateRangeMode === 'custom') {
        url = `/api/category_expenses?startDate=${customStartDate}&endDate=${customEndDate}&all=true`;
      } else if (dateRangeMode === 'billing') {
        const billingCycle = `${selectedYear}-${selectedMonth}`;
        url = `/api/category_expenses?billingCycle=${billingCycle}&all=true`;
      } else {
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        url = `/api/category_expenses?startDate=${startDate}&endDate=${endDate}&all=true`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const transactions = await response.json();
      // Filter to only credit card transactions (exclude Bank and Income)
      const cardTransactions = transactions.filter((t: any) =>
        t.category !== 'Bank' && t.category !== 'Income'
      );

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
      const response = await fetch('/api/update_category_by_description', {
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
        url = `/api/transactions_by_description?startDate=${customStartDate}&endDate=${customEndDate}&description=${encodeURIComponent(description)}`;
      } else if (dateRangeMode === 'billing') {
        const billingCycle = `${selectedYear}-${selectedMonth}`;
        url = `/api/transactions_by_description?billingCycle=${billingCycle}&description=${encodeURIComponent(description)}`;
      } else {
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        url = `/api/transactions_by_description?startDate=${startDate}&endDate=${endDate}&description=${encodeURIComponent(description)}`;
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
      console.error('Error fetching transactions:', err);
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
      } else if (selectedYear && selectedMonth) {
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        queryParams += `&startDate=${startDate}&endDate=${endDate}`;
      }

      const response = await fetch(`/api/search_transactions?${queryParams}`);
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
        url = `/api/transactions_by_last4?startDate=${customStartDate}&endDate=${customEndDate}&last4digits=${encodeURIComponent(last4digits)}`;
      } else if (dateRangeMode === 'billing') {
        const billingCycle = `${selectedYear}-${selectedMonth}`;
        url = `/api/transactions_by_last4?billingCycle=${billingCycle}&last4digits=${encodeURIComponent(last4digits)}`;
      } else {
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        url = `/api/transactions_by_last4?startDate=${startDate}&endDate=${endDate}&last4digits=${encodeURIComponent(last4digits)}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const transactions = await response.json();

      setModalData({
        type: `Card ending in ${last4digits}`,
        data: transactions
      });
      setIsModalOpen(true);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoadingLast4(null);
    }
  };

  // Calculate totals from filtered data
  const totals = data.reduce(
    (acc, row) => ({
      card_expenses: acc.card_expenses + Number(row.card_expenses),
    }),
    { card_expenses: 0 }
  );

  // Update AI Assistant screen context when data changes
  useEffect(() => {
    const getDateRangeForContext = () => {
      if (dateRangeMode === 'custom') {
        return {
          startDate: customStartDate,
          endDate: customEndDate,
          mode: 'custom'
        };
      } else if (selectedYear && selectedMonth) {
        const { startDate, endDate } = getDateRange(selectedYear, selectedMonth, dateRangeMode as 'calendar' | 'billing');
        return {
          startDate,
          endDate,
          mode: dateRangeMode
        };
      }
      return undefined;
    };

    // Group expenses by category equivalent for summary
    const categoryTotals: { [key: string]: number } = {};
    data.forEach(item => {
      const categoryKey = item.category || 'Uncategorized';
      categoryTotals[categoryKey] = (categoryTotals[categoryKey] || 0) + Number(item.card_expenses);
    });
    const categorySummary = Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));

    setScreenContext({
      view: 'summary',
      dateRange: getDateRangeForContext(),
      summary: {
        totalIncome: 0,
        totalExpenses: totals.card_expenses,
        creditCardExpenses: totals.card_expenses,
        categories: categorySummary
      }
    });
  }, [data, totals.card_expenses, dateRangeMode, selectedYear, selectedMonth, customStartDate, customEndDate, setScreenContext]);

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

    return [...data].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          const nameA = groupBy === 'description'
            ? (a.description || '')
            : groupBy === 'last4digits'
              ? (a.last4digits || '')
              : (a.vendor_nickname || a.vendor || '');
          const nameB = groupBy === 'description'
            ? (b.description || '')
            : groupBy === 'last4digits'
              ? (b.last4digits || '')
              : (b.vendor_nickname || b.vendor || '');
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
              {/* Search Bar */}
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
                  '&:focus-within': {
                    borderColor: 'primary.main',
                    boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)'
                  }
                }}
              >
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: '14px',
                    width: '180px',
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

              <IconButton
                onClick={handleRefresh}
                sx={{
                  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(10px)',
                  padding: '14px',
                  borderRadius: '16px',
                  border: `1px solid ${theme.palette.divider}`,
                  color: 'text.secondary',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  '&:hover': {
                    background: theme.palette.mode === 'dark' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(96, 165, 250, 0.15)',
                    color: 'primary.main',
                    transform: 'translateY(-2px) scale(1.05)',
                    boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)'
                  }
                }}
              >
                <RefreshIcon />
              </IconButton>

              {dateRangeMode !== 'custom' && (
                <>
                  <select
                    value={selectedYear}
                    onChange={handleYearChange}
                    style={{
                      minWidth: '120px',
                      padding: '14px 28px',
                      borderRadius: '16px',
                      border: `1px solid ${theme.palette.divider}`,
                      background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(10px)',
                      color: theme.palette.text.primary,
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      outline: 'none',
                      textAlign: 'right',
                      direction: 'rtl',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
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
                    style={{
                      minWidth: '160px',
                      padding: '14px 28px',
                      borderRadius: '16px',
                      border: `1px solid ${theme.palette.divider}`,
                      background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(10px)',
                      color: theme.palette.text.primary,
                      fontSize: '15px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      outline: 'none',
                      textAlign: 'right',
                      direction: 'rtl',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
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
                    color: dateRangeMode === 'calendar' ? '#ffffff' : '#64748b',
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
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)'
                      : 'transparent',
                    color: dateRangeMode === 'billing' ? '#ffffff' : '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'billing'
                      ? '0 4px 12px rgba(139, 92, 246, 0.3)'
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
                      ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                      : 'transparent',
                    color: dateRangeMode === 'custom' ? '#ffffff' : '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: dateRangeMode === 'custom'
                      ? '0 4px 12px rgba(16, 185, 129, 0.3)'
                      : 'none'
                  }}
                >
                  <TuneIcon style={{ fontSize: '18px' }} />
                  <span>Custom</span>
                </button>
              </div>
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
                {cardSummary.map((card) => {
                  const isLoading = loadingLast4 === card.last4digits;
                  const percentage = totals.card_expenses > 0
                    ? Math.round((card.card_expenses / totals.card_expenses) * 100)
                    : 0;
                  const cardVendor = cardVendorMap[card.last4digits];

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
                                •••• {card.last4digits}
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
                              •••• {card.last4digits}
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
                        ₪{formatNumber(card.card_expenses)}
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

                {/* Bank Account Summary Section */}
                <Box sx={{ width: '100%', pt: 2, borderTop: `1px solid ${theme.palette.divider}`, mt: 1 }}>
                  <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
                    By Bank Account
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {bankAccountSummary.map((bank) => (
                      <Box
                        key={bank.bank_account_id || 'unassigned'}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.5,
                          borderRadius: '12px',
                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                          border: `1px solid ${theme.palette.divider}`,
                          minWidth: '200px',
                          flex: '1 1 auto'
                        }}
                      >
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.1)' : 'rgba(241, 245, 249, 0.8)',
                            borderRadius: '10px',
                            color: 'text.secondary'
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
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
                          ₪{formatNumber(bank.total_expenses)}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>

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
                              color: '#3B82F6',
                              fontWeight: 600
                            }}>₪{formatNumber(row.card_expenses)}</td>
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
                          color: '#3B82F6',
                          fontWeight: 700,
                          fontSize: '15px'
                        }}>₪{formatNumber(totals.card_expenses)}</td>
                      </tr>
                    </tfoot>
                  </Box>
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
