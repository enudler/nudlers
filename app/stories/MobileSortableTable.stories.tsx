import type { Meta, StoryObj } from '@storybook/react';
import MobileSortableTable, { SortOption } from '../components/MobileSortableTable';
import { Box, Typography, Chip } from '@mui/material';
import React, { useState } from 'react';

const meta: Meta<typeof MobileSortableTable<any>> = {
    title: 'Design System/MobileSortableTable',
    component: MobileSortableTable,
    parameters: {
        layout: 'fullscreen',
        viewport: {
            defaultViewport: 'mobile1'
        }
    },
    tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof MobileSortableTable<any>>;

interface Transaction {
    id: string;
    description: string;
    category: string;
    date: string;
    amount: number;
    account: string;
}

const transactionData: Transaction[] = [
    { id: '1', description: 'Apple Services', category: 'Subscriptions', date: '2024-01-20', amount: -29.90, account: 'Visa •••• 1234' },
    { id: '2', description: 'Super-Pharm', category: 'Health', date: '2024-01-19', amount: -142.00, account: 'Mastercard •••• 5678' },
    { id: '3', description: 'Salary Deposit', category: 'Income', date: '2024-01-15', amount: 18500.00, account: 'Bank Leumi' },
    { id: '4', description: 'Wolt Dispatch', category: 'Food', date: '2024-01-14', amount: -84.50, account: 'Visa •••• 1234' },
    { id: '5', description: 'Netflix', category: 'Entertainment', date: '2024-01-13', amount: -54.90, account: 'Amex •••• 9012' },
    { id: '6', description: 'Electric Bill', category: 'Utilities', date: '2024-01-12', amount: -320.00, account: 'Bank Hapoalim' },
    { id: '7', description: 'Coffee Shop', category: 'Food', date: '2024-01-11', amount: -18.50, account: 'Visa •••• 1234' },
    { id: '8', description: 'Freelance Payment', category: 'Income', date: '2024-01-10', amount: 2500.00, account: 'Bank Leumi' },
];

const sortOptions: SortOption[] = [
    { id: 'date', label: 'Date', defaultDirection: 'desc' },
    { id: 'amount', label: 'Amount', defaultDirection: 'desc' },
    { id: 'description', label: 'Name', defaultDirection: 'asc' },
    { id: 'category', label: 'Category', defaultDirection: 'asc' },
    { id: 'account', label: 'Account', defaultDirection: 'asc' },
];

const TransactionCard = ({ row }: { row: Transaction }) => (
    <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, pr: 2 }}>
                {row.description}
            </Typography>
            <Typography
                variant="subtitle2"
                sx={{
                    fontWeight: 700,
                    color: row.amount > 0 ? 'var(--n-success)' : 'var(--n-error)',
                    whiteSpace: 'nowrap'
                }}
            >
                {row.amount < 0 ? `-₪${Math.abs(row.amount).toFixed(2)}` : `₪${row.amount.toFixed(2)}`}
            </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Chip
                    label={row.category}
                    size="small"
                    sx={{
                        height: 22,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        bgcolor: 'var(--n-bg-surface-alt)',
                    }}
                />
                <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)' }}>
                    {row.account}
                </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'var(--n-text-muted)' }}>
                {row.date}
            </Typography>
        </Box>
    </Box>
);

// Wrapper component to manage state
const InteractiveWrapper = ({ initialSortField = 'date', initialSortDirection = 'desc' }: { initialSortField?: string, initialSortDirection?: 'asc' | 'desc' }) => {
    const [sortField, setSortField] = useState(initialSortField);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialSortDirection);

    const sortedData = [...transactionData].sort((a, b) => {
        const aVal = (a as any)[sortField];
        const bVal = (b as any)[sortField];
        const multiplier = sortDirection === 'asc' ? 1 : -1;

        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return (aVal - bVal) * multiplier;
        }
        return String(aVal).localeCompare(String(bVal)) * multiplier;
    });

    return (
        <Box sx={{ bgcolor: 'var(--n-bg-main)', minHeight: '100vh' }}>
            <MobileSortableTable
                sortOptions={sortOptions}
                rows={sortedData}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={(field, direction) => {
                    setSortField(field);
                    setSortDirection(direction);
                }}
                rowKey={(row) => row.id}
                renderCard={(row) => <TransactionCard row={row} />}
            />
        </Box>
    );
};

export const Default: Story = {
    render: () => <InteractiveWrapper />,
};

export const SortedByAmount: Story = {
    render: () => <InteractiveWrapper initialSortField="amount" initialSortDirection="asc" />,
};

export const WithHeader: Story = {
    render: () => {
        const [sortField, setSortField] = useState('date');
        const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

        const sortedData = [...transactionData].sort((a, b) => {
            const aVal = (a as any)[sortField];
            const bVal = (b as any)[sortField];
            const multiplier = sortDirection === 'asc' ? 1 : -1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * multiplier;
            }
            return String(aVal).localeCompare(String(bVal)) * multiplier;
        });

        return (
            <Box sx={{ bgcolor: 'var(--n-bg-main)', minHeight: '100vh' }}>
                <Box
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 200,
                        bgcolor: 'var(--n-bg-surface)',
                        borderBottom: '1px solid var(--n-border)',
                        p: 2,
                    }}
                >
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Transactions
                    </Typography>
                </Box>
                <MobileSortableTable
                    sortOptions={sortOptions}
                    rows={sortedData}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={(field, direction) => {
                        setSortField(field);
                        setSortDirection(direction);
                    }}
                    rowKey={(row) => row.id}
                    renderCard={(row) => <TransactionCard row={row} />}
                    stickySort={true}
                    stickyOffset={56}
                />
            </Box>
        );
    },
};

export const WithExpandableRows: Story = {
    render: () => {
        const [sortField, setSortField] = useState('date');
        const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
        const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());

        const sortedData = [...transactionData].sort((a, b) => {
            const aVal = (a as any)[sortField];
            const bVal = (b as any)[sortField];
            const multiplier = sortDirection === 'asc' ? 1 : -1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * multiplier;
            }
            return String(aVal).localeCompare(String(bVal)) * multiplier;
        });

        return (
            <Box sx={{ bgcolor: 'var(--n-bg-main)', minHeight: '100vh' }}>
                <MobileSortableTable
                    sortOptions={sortOptions}
                    rows={sortedData}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={(field, direction) => {
                        setSortField(field);
                        setSortDirection(direction);
                    }}
                    rowKey={(row) => row.id}
                    renderCard={(row) => <TransactionCard row={row} />}
                    expandedRowIds={expandedRows}
                    onRowToggle={(id) => {
                        setExpandedRows(prev => {
                            const next = new Set(prev);
                            if (next.has(id)) {
                                next.delete(id);
                            } else {
                                next.add(id);
                            }
                            return next;
                        });
                    }}
                    renderExpandedContent={(row) => (
                        <Box sx={{ py: 1.5 }}>
                            <Typography variant="caption" sx={{ color: 'var(--n-text-secondary)', display: 'block', mb: 1 }}>
                                Transaction Details
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="body2">
                                    <strong>ID:</strong> {row.id}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Account:</strong> {row.account}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Category:</strong> {row.category}
                                </Typography>
                            </Box>
                        </Box>
                    )}
                />
            </Box>
        );
    },
};

export const WithFooter: Story = {
    render: () => {
        const [sortField, setSortField] = useState('date');
        const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

        const sortedData = [...transactionData].sort((a, b) => {
            const aVal = (a as any)[sortField];
            const bVal = (b as any)[sortField];
            const multiplier = sortDirection === 'asc' ? 1 : -1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * multiplier;
            }
            return String(aVal).localeCompare(String(bVal)) * multiplier;
        });

        const total = transactionData.reduce((sum, t) => sum + t.amount, 0);

        return (
            <Box sx={{ bgcolor: 'var(--n-bg-main)', minHeight: '100vh' }}>
                <MobileSortableTable
                    sortOptions={sortOptions}
                    rows={sortedData}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={(field, direction) => {
                        setSortField(field);
                        setSortDirection(direction);
                    }}
                    rowKey={(row) => row.id}
                    renderCard={(row) => <TransactionCard row={row} />}
                    footer={
                        <Box sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            p: 2,
                            bgcolor: 'var(--n-bg-surface-alt)',
                            borderRadius: 'var(--n-radius-lg)',
                        }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                Total
                            </Typography>
                            <Typography
                                variant="subtitle1"
                                sx={{
                                    fontWeight: 700,
                                    color: total >= 0 ? 'var(--n-success)' : 'var(--n-error)'
                                }}
                            >
                                {total >= 0 ? '+' : ''}₪{total.toFixed(2)}
                            </Typography>
                        </Box>
                    }
                />
            </Box>
        );
    },
};

export const EmptyState: Story = {
    render: () => {
        const [sortField, setSortField] = useState('date');
        const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

        return (
            <Box sx={{ bgcolor: 'var(--n-bg-main)', minHeight: '100vh' }}>
                <MobileSortableTable
                    sortOptions={sortOptions}
                    rows={[]}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={(field, direction) => {
                        setSortField(field);
                        setSortDirection(direction);
                    }}
                    rowKey={(row: any) => row.id}
                    renderCard={(row: any) => <TransactionCard row={row} />}
                    emptyMessage="No transactions found"
                />
            </Box>
        );
    },
};

export const ManyOptions: Story = {
    render: () => {
        const extendedOptions: SortOption[] = [
            ...sortOptions,
            { id: 'vendor', label: 'Vendor', defaultDirection: 'asc' },
            { id: 'type', label: 'Type', defaultDirection: 'asc' },
        ];

        const [sortField, setSortField] = useState('date');
        const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

        const sortedData = [...transactionData].sort((a, b) => {
            const aVal = (a as any)[sortField];
            const bVal = (b as any)[sortField];
            const multiplier = sortDirection === 'asc' ? 1 : -1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * multiplier;
            }
            return String(aVal ?? '').localeCompare(String(bVal ?? '')) * multiplier;
        });

        return (
            <Box sx={{ bgcolor: 'var(--n-bg-main)', minHeight: '100vh' }}>
                <MobileSortableTable
                    sortOptions={extendedOptions}
                    rows={sortedData}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={(field, direction) => {
                        setSortField(field);
                        setSortDirection(direction);
                    }}
                    rowKey={(row) => row.id}
                    renderCard={(row) => <TransactionCard row={row} />}
                    maxQuickSortChips={3}
                />
            </Box>
        );
    },
};
