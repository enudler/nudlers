import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { Box, Typography } from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PageHeader from '../components/PageHeader';
import { DateRangeMode } from '../context/DateSelectionContext';

const meta: Meta<typeof PageHeader> = {
    title: 'Components/PageHeader',
    component: PageHeader,
    parameters: {
        layout: 'fullscreen',
    },
    decorators: [
        (Story) => (
            <Box sx={{ bgcolor: 'var(--n-bg-main)', minHeight: '400px', pt: 2 }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof PageHeader>;

const iconNode = <AccountBalanceWalletIcon sx={{ fontSize: 28, color: '#fff' }} />;

export const Minimal: Story = {
    args: {
        title: 'Transactions',
        icon: iconNode,
    },
};

const BillingModeTemplate = () => {
    const [mode, setMode] = useState<DateRangeMode>('billing');
    const [year, setYear] = useState('2026');
    const [month, setMonth] = useState('01');

    return (
        <PageHeader
            title="Transactions"
            icon={iconNode}
            showDateSelectors
            dateRangeMode={mode}
            onDateRangeModeChange={setMode}
            selectedYear={year}
            onYearChange={(e) => setYear(e.target.value)}
            selectedMonth={month}
            onMonthChange={(e) => setMonth(e.target.value)}
            uniqueYears={['2024', '2025', '2026']}
            uniqueMonths={['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']}
            startDate="2025-12-10"
            endDate="2026-01-09"
        />
    );
};

export const WithDateSelectors: Story = {
    render: () => <BillingModeTemplate />,
};

const CalendarModeTemplate = () => {
    const [mode, setMode] = useState<DateRangeMode>('calendar');
    const [year, setYear] = useState('2026');
    const [month, setMonth] = useState('01');

    return (
        <PageHeader
            title="Transactions"
            icon={iconNode}
            showDateSelectors
            dateRangeMode={mode}
            onDateRangeModeChange={setMode}
            selectedYear={year}
            onYearChange={(e) => setYear(e.target.value)}
            selectedMonth={month}
            onMonthChange={(e) => setMonth(e.target.value)}
            uniqueYears={['2024', '2025', '2026']}
            uniqueMonths={['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']}
            startDate="2026-01-01"
            endDate="2026-01-31"
        />
    );
};

export const CalendarMode: Story = {
    render: () => <CalendarModeTemplate />,
};

const CustomDateRangeTemplate = () => {
    const [mode, setMode] = useState<DateRangeMode>('custom');
    const [startDate, setStartDate] = useState('2025-12-01');
    const [endDate, setEndDate] = useState('2026-01-31');

    return (
        <PageHeader
            title="Transactions"
            icon={iconNode}
            showDateSelectors
            dateRangeMode={mode}
            onDateRangeModeChange={setMode}
            customStartDate={startDate}
            onCustomStartDateChange={setStartDate}
            customEndDate={endDate}
            onCustomEndDateChange={setEndDate}
            startDate={startDate}
            endDate={endDate}
        />
    );
};

export const CustomDateRange: Story = {
    render: () => <CustomDateRangeTemplate />,
};

const WithSearchTemplate = () => {
    const [query, setQuery] = useState('');

    return (
        <PageHeader
            title="Transactions"
            icon={iconNode}
            showSearch
            searchQuery={query}
            onSearchQueryChange={setQuery}
            onSearchSubmit={(e) => { e.preventDefault(); }}
            onRefresh={() => {}}
        />
    );
};

export const WithSearch: Story = {
    render: () => <WithSearchTemplate />,
};

const FullFeaturedTemplate = () => {
    const [mode, setMode] = useState<DateRangeMode>('billing');
    const [year, setYear] = useState('2026');
    const [month, setMonth] = useState('01');
    const [query, setQuery] = useState('');

    return (
        <PageHeader
            title="Transactions"
            description="Track all your financial transactions"
            icon={iconNode}
            stats={
                <>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#ef4444' }}>-12,450</Typography>
                        <Typography variant="caption" color="text.secondary">Expenses</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#10b981' }}>+15,000</Typography>
                        <Typography variant="caption" color="text.secondary">Income</Typography>
                    </Box>
                </>
            }
            showDateSelectors
            dateRangeMode={mode}
            onDateRangeModeChange={setMode}
            selectedYear={year}
            onYearChange={(e) => setYear(e.target.value)}
            selectedMonth={month}
            onMonthChange={(e) => setMonth(e.target.value)}
            uniqueYears={['2024', '2025', '2026']}
            uniqueMonths={['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']}
            startDate="2025-12-10"
            endDate="2026-01-09"
            showSearch
            searchQuery={query}
            onSearchQueryChange={setQuery}
            onSearchSubmit={(e) => { e.preventDefault(); }}
            onRefresh={() => {}}
        />
    );
};

export const FullFeatured: Story = {
    render: () => <FullFeaturedTemplate />,
};
