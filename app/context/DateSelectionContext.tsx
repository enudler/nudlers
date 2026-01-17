import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { logger } from '../utils/client-logger';

export type DateRangeMode = 'calendar' | 'billing' | 'custom';

interface DateSelectionContextType {
    selectedYear: string;
    setSelectedYear: (year: string) => void;
    selectedMonth: string;
    setSelectedMonth: (month: string) => void;
    dateRangeMode: DateRangeMode;
    setDateRangeMode: (mode: DateRangeMode) => void;
    customStartDate: string;
    setCustomStartDate: (date: string) => void;
    customEndDate: string;
    setCustomEndDate: (date: string) => void;
    uniqueYears: string[];
    uniqueMonths: string[];
    startDate: string;
    endDate: string;
    billingCycle: string | undefined;
    isLoading: boolean;
    refreshData: () => Promise<void>;
    allAvailableDates: string[];
    billingStartDay: number;
}

const DateSelectionContext = createContext<DateSelectionContextType>({
    selectedYear: '',
    setSelectedYear: () => { },
    selectedMonth: '',
    setSelectedMonth: () => { },
    dateRangeMode: 'billing',
    setDateRangeMode: () => { },
    customStartDate: '',
    setCustomStartDate: () => { },
    customEndDate: '',
    setCustomEndDate: () => { },
    uniqueYears: [],
    uniqueMonths: [],
    startDate: '',
    endDate: '',
    billingCycle: undefined,
    isLoading: true,
    refreshData: async () => { },
    allAvailableDates: [],
    billingStartDay: 10,
});

export const useDateSelection = () => useContext(DateSelectionContext);

// Maximum date range in years
const MAX_YEARS_RANGE = 5;

// Helper function to calculate date range based on mode
const getDateRangeBase = (year: string, month: string, mode: DateRangeMode, billingStartDay: number = 10): { startDate: string; endDate: string } => {
    const y = parseInt(year);
    const m = parseInt(month);

    if (mode === 'calendar') {
        // Full calendar month: 1st to last day of month
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(y, m, 0).getDate(); // Get last day of month
        const endDate = `${year}-${month}-${lastDay.toString().padStart(2, '0')}`;
        return { startDate, endDate };
    } else {
        // Billing cycle: (Start Day + 1) of previous month to (Start Day) of selected month
        // Example: Start Day = 10. Range: 11th Prev to 10th Curr.

        // Note: MonthlySummary had logic: Start = billingStartDay + 1. End = billingStartDay.
        // BudgetDashboard had: 10th Prev to 9th Curr (hardcoded).
        // CategoryDashboard had: Start = billingStartDay + 1. End = billingStartDay.

        // We will unify to: Start = billingStartDay + 1. End = billingStartDay.

        let prevMonth = m - 1;
        let prevYear = y;
        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear = y - 1;
        }

        const startDayVal = billingStartDay + 1;
        const endDayVal = billingStartDay;

        const startDate = `${prevYear}-${prevMonth.toString().padStart(2, '0')}-${startDayVal.toString().padStart(2, '0')}`;
        const endDate = `${year}-${month}-${endDayVal.toString().padStart(2, '0')}`;
        return { startDate, endDate };
    }
};

export const DateSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [selectedYear, setSelectedYear] = useState<string>("");
    const [selectedMonth, setSelectedMonth] = useState<string>("");
    const [uniqueYears, setUniqueYears] = useState<string[]>([]);
    const [uniqueMonths, setUniqueMonths] = useState<string[]>([]);
    const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>('billing');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [billingStartDay, setBillingStartDay] = useState<number>(10);
    const [allAvailableDates, setAllAvailableDates] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Calculate Computed Range synchronously
    const computedRange = React.useMemo(() => {
        if (dateRangeMode === 'custom') {
            return { startDate: customStartDate, endDate: customEndDate };
        } else if (selectedYear && selectedMonth) {
            return getDateRangeBase(selectedYear, selectedMonth, dateRangeMode, billingStartDay);
        }
        return { startDate: '', endDate: '' };
    }, [selectedYear, selectedMonth, dateRangeMode, customStartDate, customEndDate, billingStartDay]);

    // Initialize state
    const init = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Load Billing Start Day
            let startDay = 10;
            try {
                const settingsResponse = await fetch('/api/settings');
                if (settingsResponse.ok) {
                    const settingsData = await settingsResponse.json();
                    startDay = parseInt(settingsData.settings.billing_cycle_start_day) || 10;
                    setBillingStartDay(startDay);
                }
            } catch (e) {
                logger.error('Error fetching settings, using default start day', e);
            }

            // 2. Load Persisted Mode
            const persistedMode = localStorage.getItem('monthlySummary_mode') as DateRangeMode | null;
            if (persistedMode && ['billing', 'calendar', 'custom'].includes(persistedMode)) {
                setDateRangeMode(persistedMode);
            }

            // 3. Fetch Available Months
            const response = await fetch("/api/available_months");
            const transactionsData = await response.json();
            setAllAvailableDates(transactionsData);

            // Sort dates descending
            const sortedDates = transactionsData.sort((a: string, b: string) => b.localeCompare(a));
            const years = Array.from(new Set(transactionsData.map((date: string) => date.substring(0, 4)))) as string[];
            setUniqueYears(years);

            // 4. Determine Initial Year/Month
            const persistedYear = localStorage.getItem('monthlySummary_year');
            const persistedMonth = localStorage.getItem('monthlySummary_month');

            let defaultYear: string;
            let defaultMonth: string;

            if (persistedYear && persistedMonth && sortedDates.includes(`${persistedYear}-${persistedMonth}`)) {
                defaultYear = persistedYear;
                defaultMonth = persistedMonth;
            } else {
                // Default to current month/year logic
                const now = new Date();
                let currentYear = now.getFullYear();
                let currentMonth = now.getMonth() + 1;

                if (now.getDate() > startDay) {
                    currentMonth += 1;
                    if (currentMonth > 12) {
                        currentMonth = 1;
                        currentYear += 1;
                    }
                }

                const currentYearStr = currentYear.toString();
                const currentMonthStr = String(currentMonth).padStart(2, '0');
                const currentYearMonth = `${currentYearStr}-${currentMonthStr}`;

                const defaultDate = sortedDates.includes(currentYearMonth) ? currentYearMonth : sortedDates[0];
                if (defaultDate) {
                    defaultYear = defaultDate.substring(0, 4);
                    defaultMonth = defaultDate.substring(5, 7);
                } else {
                    // Fallback if no data
                    defaultYear = currentYearStr;
                    defaultMonth = currentMonthStr;
                }
            }

            // Set Year and Month
            setSelectedYear(defaultYear);

            // Set Available Months for that Year
            const monthsForYear = transactionsData
                .filter((date: string) => date.startsWith(defaultYear))
                .map((date: string) => date.substring(5, 7));
            const uniqueMonthsForYear = Array.from(new Set(monthsForYear)) as string[];
            setUniqueMonths(uniqueMonthsForYear);

            setSelectedMonth(defaultMonth);

            // Persist defaults if they weren't there
            localStorage.setItem('monthlySummary_year', defaultYear);
            localStorage.setItem('monthlySummary_month', defaultMonth);

            // Init Custom Dates if needed
            const now = new Date();
            const threeMonthsAgo = new Date(now);
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            const formatDate = (d: Date) => d.toISOString().split('T')[0];

            // Check local storage for custom dates if you want persistence, otherwise default
            if (!customStartDate) setCustomStartDate(formatDate(threeMonthsAgo));
            if (!customEndDate) setCustomEndDate(formatDate(now));

        } catch (error) {
            logger.error('Error initializing DateSelectionContext', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        init();
    }, [init]);

    // Handle Year Change
    const handleSetYear = useCallback((year: string) => {
        setSelectedYear(year);
        localStorage.setItem('monthlySummary_year', year);

        // Update unique months
        const monthsForYear = allAvailableDates
            .filter((date: string) => date.startsWith(year))
            .map((date: string) => date.substring(5, 7));
        const unique = Array.from(new Set(monthsForYear)) as string[];
        setUniqueMonths(unique);

        // If selected month is not in new year, switch to first available
        if (!unique.includes(selectedMonth) && unique.length > 0) {
            const newMonth = unique[0];
            setSelectedMonth(newMonth);
            localStorage.setItem('monthlySummary_month', newMonth);
        }
    }, [allAvailableDates, selectedMonth]);

    // Handle Month Change
    const handleSetMonth = useCallback((month: string) => {
        setSelectedMonth(month);
        localStorage.setItem('monthlySummary_month', month);
    }, []);

    // Handle Mode Change
    const handleSetMode = useCallback((mode: DateRangeMode) => {
        setDateRangeMode(mode);
        localStorage.setItem('monthlySummary_mode', mode);

        // If switching to 'custom' and dates are empty, set defaults
        if (mode === 'custom') {
            if (!customStartDate || !customEndDate) {
                const now = new Date();
                const threeMonthsAgo = new Date(now);
                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                const formatDate = (d: Date) => d.toISOString().split('T')[0];
                setCustomStartDate(formatDate(threeMonthsAgo));
                setCustomEndDate(formatDate(now));
            }
        }
    }, [customStartDate, customEndDate]);


    const billingCycle = dateRangeMode === 'billing' ? `${selectedYear}-${selectedMonth}` : undefined;

    const contextValue = React.useMemo(() => ({
        selectedYear,
        setSelectedYear: handleSetYear,
        selectedMonth,
        setSelectedMonth: handleSetMonth,
        dateRangeMode,
        setDateRangeMode: handleSetMode,
        customStartDate,
        setCustomStartDate,
        customEndDate,
        setCustomEndDate,
        uniqueYears,
        uniqueMonths,
        startDate: computedRange.startDate,
        endDate: computedRange.endDate,
        billingCycle,
        isLoading,
        refreshData: init,
        allAvailableDates,
        billingStartDay
    }), [
        selectedYear, handleSetYear,
        selectedMonth, handleSetMonth,
        dateRangeMode, handleSetMode,
        customStartDate, customEndDate,
        uniqueYears, uniqueMonths,
        computedRange, billingCycle,
        isLoading, init,
        allAvailableDates, billingStartDay
    ]);

    return (
        <DateSelectionContext.Provider value={contextValue}>
            {children}
        </DateSelectionContext.Provider>
    );
};
