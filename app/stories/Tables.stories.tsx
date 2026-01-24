import type { Meta, StoryObj } from '@storybook/react';
import Table, { Column } from '../components/Table';
import { Box, Typography, Chip } from '@mui/material';
import React from 'react';

const meta: Meta<typeof Table> = {
    title: 'Design System/Tables',
    component: Table,
    parameters: {
        layout: 'padded',
    },
    tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Table>;

interface Transaction {
    id: string;
    desc: string;
    cat: string;
    date: string;
    amount: number;
    status?: string;
}

const transactionData: Transaction[] = [
    { id: '1', desc: 'Apple Services', cat: 'Subscriptions', date: '2024-01-20', amount: -29.90 },
    { id: '2', desc: 'Super-Pharm', cat: 'Health', date: '2024-01-19', amount: -142.00 },
    { id: '3', desc: 'Salary Deposit', cat: 'Income', date: '2024-01-15', amount: 18500.00, status: 'success' },
    { id: '4', desc: 'Wolt Dispatch', cat: 'Food', date: '2024-01-14', amount: -84.50 },
];

const transactionColumns: Column<Transaction>[] = [
    { id: 'desc', label: 'Description', format: (val) => <span style={{ fontWeight: 600 }}>{val}</span> },
    {
        id: 'cat',
        label: 'Category',
        align: 'right',
        format: (val) => (
            <Box sx={{
                px: 1.5, py: 0.5,
                borderRadius: '999px',
                bgcolor: 'var(--n-bg-surface-alt)',
                display: 'inline-block',
                fontSize: '0.75rem',
                fontWeight: 600
            }}>
                {val}
            </Box>
        )
    },
    { id: 'date', label: 'Date', align: 'right', format: (val) => <span style={{ color: 'var(--n-text-secondary)' }}>{val}</span> },
    {
        id: 'amount',
        label: 'Amount',
        align: 'right',
        format: (val, row) => (
            <span style={{
                fontWeight: 700,
                color: val > 0 ? 'var(--n-success)' : 'var(--n-text-primary)'
            }}>
                {val < 0 ? `-₪${Math.abs(val)}` : `₪${val}`}
            </span>
        )
    }
];

export const BasicTable: Story = {
    args: {
        columns: transactionColumns,
        rows: transactionData,
        rowKey: (row: any) => row.id,
    },
    render: (args) => (
        <Box sx={{ p: 4, bgcolor: 'var(--n-bg-main)' }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>Recent Transactions</Typography>
            <Table {...args} />
        </Box>
    )
};

interface Payment {
    id: string;
    name: string;
    acc: string;
    cat: string;
    current: number;
    total: number;
    amount: number;
    status: string;
}

const paymentColumns: Column<Payment>[] = [
    { id: 'name', label: 'Description', format: (val) => <span style={{ fontWeight: 700 }}>{val}</span> },
    {
        id: 'acc',
        label: 'Account',
        format: (val) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 24, height: 16, bgcolor: 'var(--n-border)', borderRadius: 0.5 }} />
                <Typography variant="body2">{val}</Typography>
            </Box>
        )
    },
    {
        id: 'cat',
        label: 'Category',
        format: (val) => (
            <Box sx={{
                bgcolor: 'var(--n-primary)',
                color: 'white',
                px: 1.5, py: 0.5,
                borderRadius: 1,
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5
            }}>
                {val}
            </Box>
        )
    },
    {
        id: 'progress',
        label: 'Progress',
        align: 'center',
        format: (_, row) => (
            row.total > 1 ? (
                <Box sx={{ width: '80px', mx: 'auto' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>{row.current}/{row.total}</Typography>
                    <Box sx={{ width: '100%', height: 4, bgcolor: 'var(--n-bg-surface-alt)', borderRadius: 2, mt: 0.5, overflow: 'hidden' }}>
                        <Box sx={{ width: `${(row.current / row.total) * 100}%`, height: '100%', bgcolor: 'var(--n-primary)' }} />
                    </Box>
                </Box>
            ) : (
                <Typography variant="caption" color="text.secondary">Monthly</Typography>
            )
        )
    },
    {
        id: 'amount',
        label: 'Amount',
        align: 'right',
        format: (val) => <span style={{ fontWeight: 800, color: 'var(--n-primary)' }}>₪{val}</span>
    },
    {
        id: 'status',
        label: 'Status',
        align: 'center',
        format: (val) => (
            <Chip
                label={val}
                size="small"
                sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontSize: '0.625rem',
                    bgcolor: val === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                    color: val === 'active' ? 'var(--n-success)' : 'var(--n-info)',
                    borderColor: val === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 1,
                    borderStyle: 'solid'
                }}
            />
        )
    }
];

const paymentData: Payment[] = [
    { id: '1', name: 'MacBook Pro 14"', acc: 'Visa •••• 1234', cat: 'Tech', current: 3, total: 12, amount: 849, status: 'active' },
    { id: '2', name: 'Netflix Premium', acc: 'Mastercard •••• 5678', cat: 'Entertainment', current: 1, total: 1, amount: 69.90, status: 'recurring' },
    { id: '3', name: 'Gym Membership', acc: 'Visa •••• 1234', cat: 'Health', current: 5, total: 12, amount: 250, status: 'active' },
    { id: '4', name: 'Amazon AWS', acc: 'Amex •••• 9012', cat: 'Business', current: 1, total: 1, amount: 124.50, status: 'recurring' },
];

export const AdvancedTable: Story = {
    args: {
        columns: paymentColumns,
        rows: paymentData,
        rowKey: (row: any) => row.id,
    },
    render: (args) => (
        <Box sx={{ p: 4, bgcolor: 'var(--n-bg-main)', minWidth: '800px' }}>
            <Typography variant="h5" className="gradient-text" sx={{ mb: 3, fontWeight: 800 }}>Advanced Payment Tracking</Typography>
            <Table {...args} />
        </Box>
    )
};

export const MobileView: Story = {
    parameters: {
        viewport: {
            defaultViewport: 'mobile1'
        }
    },
    args: {
        columns: transactionColumns,
        rows: transactionData,
        rowKey: (row: any) => row.id,
        mobileCardRenderer: (row: any) => (
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700}>{row.desc}</Typography>
                    <Typography variant="subtitle2" fontWeight={700} color={row.amount > 0 ? 'success.main' : 'text.primary'}>
                        {row.amount < 0 ? `-₪${Math.abs(row.amount)}` : `₪${row.amount}`}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">{row.date}</Typography>
                    <Box sx={{
                        px: 1.5, py: 0.5,
                        borderRadius: '999px',
                        bgcolor: 'var(--n-bg-surface-alt)',
                        fontSize: '0.75rem',
                        fontWeight: 600
                    }}>
                        {row.cat}
                    </Box>
                </Box>
            </Box>
        )
    },
    render: (args) => (
        <Box sx={{ p: 2, bgcolor: 'var(--n-bg-main)', maxWidth: '400px' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>Mobile Transactions</Typography>
            <Table {...args} />
        </Box>
    )
};

