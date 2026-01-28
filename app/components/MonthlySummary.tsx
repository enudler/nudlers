import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
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
import SummarizeIcon from '@mui/icons-material/Summarize';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';

import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from 'next/link';
import PageHeader from './PageHeader';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import BudgetModule from './BudgetModule';
import RecentTransactionsModule from './RecentTransactionsModule';
import { DndContext, useSensor, useSensors, PointerSensor, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

import ExpensesModal from './CategoryDashboard/components/ExpensesModal';
import Typography from '@mui/material/Typography';
import { ModalData } from './CategoryDashboard/types';
import { useCategories } from './CategoryDashboard/utils/useCategories';
import { CardVendorIcon, CARD_VENDORS } from './CardVendorsModal';
import { useScreenContext } from './Layout';
import { useDateSelection, DateRangeMode } from '../context/DateSelectionContext';
import { logger } from '../utils/client-logger';
import { isBankTransaction, BankCheckTransaction } from '../utils/transactionUtils';
import { CREDIT_CARD_VENDORS, BANK_VENDORS } from '../utils/constants';

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
  amount?: number; // Amount with original sign (positive = income, negative = expense)
  balance?: number | null;
  balance_updated_at?: string | null;
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
  balance?: number | null;
  balance_updated_at?: string | null;
  card_nickname?: string | null;
}

interface ScrapedBankSummary {
  bank_account_id: number | null;
  bank_account_nickname: string;
  bank_account_number: string | null;
  bank_account_vendor: string | null;
  net_flow: number; // Income - Expenses
  income: number;
  expenses: number;
  balance: number | null;
  balance_updated_at: string | null;
}

interface BankCCSummary {
  bank_account_id: number | null;
  bank_account_nickname: string;
  bank_account_number: string | null;
  bank_account_vendor: string | null;
  total_cc_expenses: number;
  card_count: number;
}

interface Account {
  id: number;
  vendor: string;
  account_number: string;
  last4: string;
  balance: number | null;
  balance_updated_at: string | null;
  nickname: string;
  credential: {
    id: number;
    vendor: string;
    nickname: string;
  };
  linked_bank_account_id: number | null;
  metadata: {
    is_bank: boolean;
    custom_number?: string | null;
    mapped_vendor?: string | null;
  };
}

type GroupByType = 'vendor' | 'description' | 'last4digits';
// DateRangeMode imported from context
type SortField = 'name' | 'transaction_count' | 'card_expenses' | 'category';
type SortDirection = 'asc' | 'desc';

// Helper function to calculate date range based on mode
// getDateRange removed (handled by context)

// Helper to format date range for display


const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('he-IL').format(Math.round(num));
};







// Helper components for Drag and Drop
const DraggableCardWrapper = ({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `card-${id}`,
    data: { last4digits: id },
    disabled
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative',
    touchAction: 'none',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
};

const DroppableBankWrapper = ({ id, children }: { id: number, children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `bank-${id}`,
    data: { bankId: id }
  });

  const style: React.CSSProperties = {
    transition: 'all 0.2s ease',
    transform: isOver ? 'scale(1.02)' : 'none',
    boxShadow: isOver ? '0 0 0 2px #3b82f6' : 'inherit',
    borderRadius: '16px',
    height: '100%'
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children}
    </div>
  );
};

const MonthlySummary: React.FC = () => {
  const theme = useTheme();
  const [data, setData] = useState<MonthlySummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !active) return;

    const cardLast4 = active.data.current?.last4digits;
    const bankIdStr = String(over.id).replace('bank-', '');
    const targetBankId = parseInt(bankIdStr, 10);

    if (!cardLast4 || isNaN(targetBankId)) return;

    const cardOwnershipId = cardOwnershipMap[cardLast4];
    if (!cardOwnershipId) {
      setSnackbar({ open: true, message: 'Cannot move this card (System ID not found)', severity: 'error' });
      return;
    }

    // Optimistic update could go here, but for now let's rely on refresh
    try {
      const response = await fetch(`/api/cards/ownerships/${cardOwnershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linked_bank_account_id: targetBankId })
      });

      if (response.ok) {
        setSnackbar({ open: true, message: 'Card moved successfully', severity: 'success' });
        fetchMonthlySummary(true);
        // Also refresh vendors to update ownership map if needed, though ID shouldn't change
      } else {
        setSnackbar({ open: true, message: 'Failed to move card', severity: 'error' });
      }
    } catch (e) {
      logger.error('Move failed', e);
      setSnackbar({ open: true, message: 'Move failed', severity: 'error' });
    }
  };

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


  // Date range error (local validation for custom range UI feedback if needed, 
  // though context handles valid start/end dates for fetching)
  const [dateRangeError, setDateRangeError] = useState<string>('');

  // Modal for transaction details
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | undefined>();
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgetLimit, setBudgetLimit] = useState<number | null>(null);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [newBudgetLimit, setNewBudgetLimit] = useState<string>('');

  // Category editing


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
  const [cardOwnershipMap, setCardOwnershipMap] = useState<Record<string, number>>({});
  const [editingNickname, setEditingNickname] = useState<string>('');






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

  const handleSaveBudget = async () => {
    const limit = parseFloat(newBudgetLimit);
    if (isNaN(limit) || limit <= 0) {
      setSnackbar({ open: true, message: 'Please enter a valid budget amount', severity: 'error' });
      return;
    }

    try {
      const res = await fetch('/api/reports/total-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget_limit: limit })
      });

      if (res.ok) {
        setBudgetLimit(limit);
        setIsEditingBudget(false);
        setSnackbar({ open: true, message: 'Budget updated successfully', severity: 'success' });
      } else {
        throw new Error('Failed to save');
      }
    } catch (e) {
      setSnackbar({ open: true, message: 'Failed to update budget', severity: 'error' });
    }
  };

  const fetchCardVendors = useCallback(async () => {
    try {
      const response = await fetch('/api/cards');
      if (response.ok) {
        const data = await response.json();
        const vendorMap: Record<string, string> = {};
        const nicknameMap: Record<string, string> = {};
        const ownershipMap: Record<string, number> = {};
        for (const card of data) {
          if (card.card_vendor) {
            vendorMap[card.last4_digits] = card.card_vendor;
          }
          if (card.card_nickname) {
            nicknameMap[card.last4_digits] = card.card_nickname;
          }
          if (card.card_ownership_id) {
            ownershipMap[card.last4_digits] = card.card_ownership_id;
          }
        }
        setCardVendorMap(vendorMap);
        setCardNicknameMap(nicknameMap);
        setCardOwnershipMap(ownershipMap);
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

      // Fetch available dates and initialize selection
      fetchCardVendors();

      // Fetch budget
      try {
        const res = await fetch('/api/reports/total-budget');
        if (res.ok) {
          const data = await res.json();
          if (data.is_set) {
            setBudgetLimit(data.budget_limit);
          }
        }
      } catch (e) {
        logger.error('Failed to fetch budget', e);
      }
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
      queryParams.set('groupBy', 'description');
      queryParams.set('limit', '50');
      queryParams.set('offset', '0');
      queryParams.set('sortBy', sortField);
      queryParams.set('sortOrder', sortDirection);

      url = `/api/reports/monthly-summary?${queryParams.toString()}`;

      // Card summary always needs all data for sidebars/totals (or at least more than 50)
      const cardParams = new URLSearchParams(queryParams);
      cardParams.set('groupBy', 'last4digits');
      cardParams.set('limit', '500'); // Sufficient for most users
      cardParams.set('offset', '0');
      cardParams.delete('excludeBankTransactions'); // Sidebar must always show bank balances
      cardUrl = `/api/reports/monthly-summary?${cardParams.toString()}`;

      // Fetch main data, card summary, and master account list in parallel
      const [mainResponse, cardResponse, accountsResponse] = await Promise.all([
        fetch(url),
        fetch(cardUrl),
        fetch('/api/accounts')
      ]);

      const result = await mainResponse.json();
      const items = result.items || [];
      const newTotal = result.total || 0;

      if (accountsResponse.ok) {
        setAccounts(await accountsResponse.json());
      }

      setData(items);

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
          balance?: number | null;
          balance_updated_at?: string | null;
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
            balance: c.balance !== null ? Number(c.balance) : null,
            balance_updated_at: c.balance_updated_at || null,
            card_nickname: c.card_nickname || null,
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
                expenses: 0,
                balance: item.balance !== null ? Number(item.balance) : null,
                balance_updated_at: item.balance_updated_at || null
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
  }, [startDate, endDate, billingCycle, dateRangeMode, customStartDate, customEndDate, selectedYear, selectedMonth, sortField, sortDirection]);

  // Derived bank summary that includes ALL accounts from the REST API
  const finalBankSummary = useMemo(() => {
    // Start with master list of accounts from the restful API
    const banks = accounts.filter(acc => acc.metadata.is_bank);

    return banks.map(acc => {
      // Find matching flow data from the reports API processing
      const flowData = scrapedBankSummary.find(s =>
        s.bank_account_id === acc.credential.id ||
        s.bank_account_number === acc.account_number
      );

      return {
        bank_account_id: acc.credential.id,
        bank_account_nickname: acc.nickname,
        bank_account_number: acc.account_number,
        bank_account_vendor: acc.vendor,
        net_flow: flowData?.net_flow || 0,
        income: flowData?.income || 0,
        expenses: flowData?.expenses || 0,
        balance: acc.balance,
        balance_updated_at: acc.balance_updated_at
      };
    }).filter(bank => {
      // Logic to hide "phantom" accounts:
      // Hide if the bank never reported a balance AND has no transaction activity in this view
      const hasBalance = bank.balance !== null;
      const hasActivity = bank.income !== 0 || bank.expenses !== 0;
      return hasBalance || hasActivity;
    }).sort((a, b) => {
      // Sort by balance (highest first) or fallback to net flow
      if (a.balance !== null && b.balance !== null) return b.balance - a.balance;
      return b.net_flow - a.net_flow;
    });
  }, [accounts, scrapedBankSummary]);

  useEffect(() => {
    // Reset offset logic removed as offset is no longer needed/used
    if (dateRangeMode === 'custom') {
      if (customStartDate && customEndDate) {
        fetchMonthlySummary(false, 0);
      }
    } else if (startDate && endDate) {
      fetchMonthlySummary(false, 0);
    }
  }, [startDate, endDate, billingCycle, dateRangeMode, customStartDate, customEndDate, selectedYear, selectedMonth, sortField, sortDirection]);

  // Separate useEffect for filter toggle - skip loading state to prevent flicker


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

    if (dateRangeMode === 'custom') {
      if (customStartDate && customEndDate && validateDateRange(customStartDate, customEndDate)) {
        fetchMonthlySummary(false, 0);
      }
    } else {
      fetchMonthlySummary(false, 0);
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
  const handleSortChange = (field: string) => {
    const sField = field as SortField;
    if (sField === sortField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(sField);
      setSortDirection('desc');
    }
  };

  // Sort the data


  // Table columns configuration


  // Update document title and data
  useEffect(() => {
    if (dateRangeMode === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const end = new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      document.title = `Nudlers | ${start} - ${end}`;
    } else if (selectedMonth && selectedYear) {
      const monthName = new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      document.title = `Nudlers | ${monthName} ${selectedYear}`;
    } else {
      document.title = 'Nudlers | Summary';
    }
  }, [selectedMonth, selectedYear, dateRangeMode, customStartDate, customEndDate]);

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
      {/* Background elements removed - handled by Layout.tsx */}


      {/* Main content container */}
      <Box sx={{
        padding: { xs: '12px 8px', sm: '16px 12px', md: '24px 16px' },
        maxWidth: '1440px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1,
        color: theme.palette.text.primary
      }}>
        <PageHeader
          title="Summary"
          description={
            dateRangeMode === 'custom' && customStartDate && customEndDate
              ? `${new Date(customStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(customEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : (selectedMonth && selectedYear
                ? `Summary for ${new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
                : 'Track and analyze your expenses')
          }
          icon={<SummarizeIcon sx={{ fontSize: '32px', color: '#ffffff' }} />}

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
          onRefresh={handleRefresh}
          startDate={startDate}
          endDate={endDate}
        />


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
            {/* Unified Summary Hero Card */}
            <Box sx={{
              margin: { xs: '12px 4px', md: '0 16px 24px' },
              padding: { xs: '16px', md: '20px' },
              borderRadius: '24px',
              background: theme.palette.mode === 'dark'
                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.95) 100%)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${theme.palette.divider}`,
              boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: { xs: 'column', lg: 'row' },
              gap: { xs: '16px', lg: '24px' }
            }}>
              {/* Left Section: Total Summary */}
              <Box
                onClick={handleAllTransactionsClick}
                sx={{
                  flex: '0 0 auto',
                  minWidth: { lg: '240px' },
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  p: 1.5,
                  borderRadius: '16px',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '&:hover': { transform: 'scale(1.02)' }
                }}
              >
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.65rem' }}>
                  Total Card Spend
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5, mb: 1.5 }}>
                  <Box sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    boxShadow: '0 8px 16px rgba(59, 130, 246, 0.2)',
                    color: 'white',
                    flexShrink: 0
                  }}>
                    <CreditCardIcon sx={{ fontSize: 24 }} />
                  </Box>
                  <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', letterSpacing: '-0.02em', fontSize: { lg: '1.75rem' } }}>
                      ₪{formatNumber(totals.card_expenses)}
                    </Typography>

                    {/* Budget Comparison */}
                    {(dateRangeMode === 'billing' || dateRangeMode === 'calendar') && (
                      <Box sx={{ mt: 0.5, minWidth: '180px' }}>
                        {isEditingBudget ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={e => e.stopPropagation()}>
                            <TextField
                              size="small"
                              placeholder="Set Budget..."
                              value={newBudgetLimit}
                              onChange={(e) => setNewBudgetLimit(e.target.value)}
                              autoFocus
                              type="number"
                              sx={{
                                width: '100px',
                                '& .MuiInputBase-root': { bgcolor: theme.palette.background.paper, fontSize: '0.8125rem' }
                              }}
                            />
                            <IconButton size="small" onClick={handleSaveBudget} sx={{ color: '#10b981', p: 0.5 }}>
                              <CheckIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ) : budgetLimit !== null ? (
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min((totals.card_expenses / budgetLimit) * 100, 100)}
                                sx={{
                                  height: 4,
                                  borderRadius: 2,
                                  flex: 1,
                                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: totals.card_expenses > budgetLimit ? '#ef4444' : '#10b981'
                                  }
                                }}
                              />
                              <Typography variant="caption" sx={{ fontWeight: 700, color: totals.card_expenses > budgetLimit ? '#ef4444' : '#10b981', fontSize: '0.65rem' }}>
                                {Math.round((totals.card_expenses / budgetLimit) * 100)}%
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.65rem' }}>
                                {totals.card_expenses > budgetLimit
                                  ? `Over by ₪${formatNumber(totals.card_expenses - budgetLimit)}`
                                  : `₪${formatNumber(budgetLimit - totals.card_expenses)} left`
                                }
                              </Typography>
                            </Box>
                          </Box>
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsEditingBudget(true);
                            }}
                            sx={{ fontSize: '0.65rem', py: 0.25, borderRadius: '12px' }}
                          >
                            Set Budget
                          </Button>
                        )}
                      </Box>
                    )}
                  </Box>
                </Box>
                <Button
                  size="small"
                  endIcon={<ChevronRightIcon sx={{ fontSize: 14 }} />}
                  sx={{ width: 'fit-content', borderRadius: '12px', textTransform: 'none', fontWeight: 700, fontSize: '0.7rem', py: 0 }}
                >
                  All Transactions
                </Button>
              </Box>

              {/* Vertical Divider (Desktop) */}
              <Box sx={{ width: '1px', bgcolor: 'divider', display: { xs: 'none', lg: 'block' } }} />

              {/* Horizontal Divider (Mobile) */}
              <Box sx={{ height: '1px', bgcolor: 'divider', display: { xs: 'block', lg: 'none' } }} />

              {/* Right Section: Card Breakdown Grid (Grouped by Bank) */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 600, mb: 2 }}>
                  Credit Card Usage by Bank
                </Typography>
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: 'repeat(auto-fill, minmax(240px, 1fr))',
                      md: 'repeat(auto-fill, minmax(280px, 1fr))'
                    },
                    gap: 1.5,
                    alignItems: 'start'
                  }}>
                    {creditCardBankSummary.map((bank) => {
                      const percentage = totals.card_expenses > 0
                        ? Math.round((bank.total_cc_expenses / totals.card_expenses) * 100)
                        : 0;

                      const isLargeBank = bank.card_count > 3;

                      const BankContent = (
                        <Box
                          key={bank.bank_account_id ? `cc-id-${bank.bank_account_id}` : `cc-nick-${bank.bank_account_nickname}`}
                          sx={{
                            p: 0,
                            borderRadius: '16px',
                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.8)',
                            border: `1px solid ${theme.palette.divider}`,
                            overflow: 'hidden',
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'all 0.3s',
                            gridColumn: {
                              xs: 'span 1',
                              sm: isLargeBank ? 'span 2' : 'span 1',
                              md: isLargeBank ? 'span 2' : 'span 1'
                            },
                            '&:hover': {
                              boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.1)',
                              bgcolor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 1)',
                              borderColor: theme.palette.primary.main
                            }
                          }}
                        >
                          {/* Unique Linked Bank Header */}
                          {(() => {
                            const bankDetails = finalBankSummary.find(b =>
                              (b.bank_account_id && bank.bank_account_id && String(b.bank_account_id) === String(bank.bank_account_id)) ||
                              (!b.bank_account_id && b.bank_account_nickname === bank.bank_account_nickname)
                            );

                            const balance = bankDetails?.balance ?? 0;
                            const hasBalance = bankDetails && bankDetails.balance !== null;

                            return (
                              <Box
                                onClick={hasBalance ? () => handleBankCCClick(bank) : undefined}
                                sx={{
                                  p: 1.5,
                                  background: hasBalance
                                    ? `linear-gradient(to right, ${theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.05)'}, transparent)`
                                    : 'transparent',
                                  borderBottom: `1px solid ${theme.palette.divider}`,
                                  cursor: hasBalance ? 'pointer' : 'default',
                                  '&:hover': hasBalance ? { opacity: 0.8 } : {}
                                }}
                              >
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}>
                                    <Box sx={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: '8px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'white',
                                      border: `1px solid ${theme.palette.divider}`,
                                      color: 'text.primary',
                                      flexShrink: 0
                                    }}>
                                      <AccountBalanceIcon sx={{ fontSize: 18 }} />
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.1, fontSize: '0.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {bank.bank_account_nickname}
                                      </Typography>
                                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.625rem' }}>
                                        Linked Bank
                                      </Typography>
                                    </Box>
                                  </Box>

                                  {hasBalance && (
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-end',
                                        flexShrink: 0,
                                        ml: 1
                                      }}
                                    >
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                        <Typography
                                          variant="subtitle2"
                                          sx={{
                                            fontWeight: 800,
                                            fontSize: '0.8125rem',
                                            color: balance >= 0 ? '#10B981' : '#F43F5E'
                                          }}
                                        >
                                          ₪{formatNumber(balance)}
                                        </Typography>
                                        <ChevronRightIcon sx={{ fontSize: 14, color: 'text.secondary', opacity: 0.7 }} />
                                      </Box>
                                    </Box>
                                  )}
                                </Box>
                              </Box>
                            );
                          })()}

                          {/* Credit Card List Section */}
                          <Box sx={{ p: 1.5, pt: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.625rem' }}>
                                {bank.card_count} Cards
                              </Typography>
                              <Typography variant="subtitle1" sx={{ fontWeight: 800, fontSize: '0.9rem' }}>
                                ₪{formatNumber(bank.total_cc_expenses)}
                              </Typography>
                            </Box>

                            <Box sx={{
                              display: 'grid',
                              gridTemplateColumns: {
                                xs: '1fr',
                                sm: isLargeBank ? 'repeat(2, 1fr)' : '1fr'
                              },
                              gap: 1
                            }}>
                              {cardSummary
                                .filter(card => {
                                  const cardTransVendor = card.transaction_vendor;
                                  const cardVendor = cardVendorMap[card.last4digits];
                                  const isBankItem = (cardTransVendor && BANK_VENDORS.includes(cardTransVendor) && !card.card_vendor);
                                  if (isBankItem) return false;

                                  if (bank.bank_account_id && card.bank_account_id) {
                                    return String(bank.bank_account_id) === String(card.bank_account_id);
                                  }
                                  return (
                                    cardTransVendor === bank.bank_account_vendor ||
                                    (cardVendor && cardVendor === bank.bank_account_vendor) ||
                                    (card.bank_account_nickname && card.bank_account_nickname === bank.bank_account_nickname)
                                  );
                                })
                                .map(card => {
                                  const vendorKey = cardVendorMap[card.last4digits];
                                  const nickname = cardNicknameMap[card.last4digits] || card.card_nickname;
                                  const isBankItem = (card.transaction_vendor && BANK_VENDORS.includes(card.transaction_vendor) && !card.card_vendor);

                                  return (
                                    <DraggableCardWrapper key={card.last4digits} id={card.last4digits} disabled={!!isBankItem}>
                                      <Box
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleLast4DigitsClick(card.last4digits);
                                        }}
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          p: 1,
                                          borderRadius: '10px',
                                          bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(241, 245, 249, 0.5)',
                                          border: '1px solid transparent',
                                          transition: 'all 0.2s',
                                          position: 'relative',
                                          minHeight: '44px',
                                          '&:hover': {
                                            bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(241, 245, 249, 1)',
                                            borderColor: theme.palette.divider,
                                            '& .edit-card-button': {
                                              opacity: 1,
                                              transform: 'translateX(0)'
                                            }
                                          }
                                        }}
                                      >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                                          {vendorKey ? (
                                            <CardVendorIcon vendor={vendorKey} size={24} />
                                          ) : (
                                            <Box sx={{
                                              width: 24,
                                              height: 24,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              backgroundColor: 'rgba(148, 163, 184, 0.2)',
                                              borderRadius: '6px',
                                              flexShrink: 0
                                            }}>
                                              <CreditCardIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                            </Box>
                                          )}
                                          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                            {nickname ? (
                                              <>
                                                <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.1, fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                  {nickname}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '9px', letterSpacing: '0.2px' }}>
                                                  ••{card.last4digits}
                                                </Typography>
                                              </>
                                            ) : (
                                              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontFamily: 'monospace', letterSpacing: '0.5px', fontSize: '10px' }}>
                                                •••• {card.last4digits}
                                              </Typography>
                                            )}
                                          </Box>
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, ml: 1 }}>
                                          <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.75rem' }}>
                                            ₪{formatNumber(card.card_expenses)}
                                          </Typography>

                                          <IconButton
                                            className="edit-card-button"
                                            size="small"
                                            onClick={(e) => handleVendorMenuOpen(e, card.last4digits)}
                                            sx={{
                                              opacity: 0,
                                              transform: 'translateX(5px)',
                                              transition: 'all 0.2s',
                                              padding: '2px',
                                              color: 'text.secondary',
                                              '&:hover': { color: 'primary.main', bgcolor: 'rgba(59, 130, 246, 0.1)' },
                                              display: { xs: 'none', sm: 'flex' },
                                              ...(theme.breakpoints.down('sm') ? { opacity: 1, transform: 'none', display: 'flex' } : {})
                                            }}
                                          >
                                            <TuneIcon sx={{ fontSize: 12 }} />
                                          </IconButton>
                                        </Box>
                                      </Box>
                                    </DraggableCardWrapper>
                                  );
                                })}
                            </Box>
                          </Box>
                        </Box>
                      );

                      return bank.bank_account_id ? (
                        <DroppableBankWrapper key={bank.bank_account_id} id={bank.bank_account_id}>
                          {BankContent}
                        </DroppableBankWrapper>
                      ) : (
                        <React.Fragment key={`cc-nick-${bank.bank_account_nickname}`}>
                          {BankContent}
                        </React.Fragment>
                      );
                    })}
                  </Box>
                </DndContext>
              </Box>
            </Box>





            {/* 2. Credit Card Expenses by Bank Section */}


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



            {/* Budget and Other Modules Section */}
            <Box sx={{
              px: { xs: 1, md: 3 },
              mb: 3
            }}>
              <Grid container spacing={3}>
                {/* Left Side: Budget Module */}
                <Grid item xs={12} md={6}>
                  <BudgetModule onViewTransactions={async (category) => {
                    try {
                      let queryParams = `q=${encodeURIComponent(category)}`;
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
                          type: `Category: ${category}`,
                          data: results
                        });
                        setIsModalOpen(true);
                      }
                    } catch (e) {
                      console.error("Failed to view category transactions", e);
                    }
                  }} />
                </Grid>

                {/* Right Side: Recent Transactions Module */}
                <Grid item xs={12} md={6}>
                  <RecentTransactionsModule />
                </Grid>
              </Grid>
            </Box>


          </>
        )}

        {modalData && (
          <ExpensesModal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            data={modalData}
            color="#3b82f6"
            setModalData={setModalData}
            currentMonth={dateRangeMode === "custom" ? `${customStartDate}` : `${selectedYear}-${selectedMonth}`}
          />
        )}

        <Snackbar
          open={snackbar.open}
          autoHideDuration={5000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            sx={{
              width: "100%",
              borderRadius: "12px",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)"
            }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </div>
  );
};

export default MonthlySummary;
