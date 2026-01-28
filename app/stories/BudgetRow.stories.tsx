import type { Meta, StoryObj } from '@storybook/react';
import BudgetRow from '../components/BudgetDashboard/BudgetRow';
import { Box } from '@mui/material';
import React from 'react';

const meta: Meta<typeof BudgetRow> = {
    title: 'Components/BudgetRow',
    component: BudgetRow,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <Box sx={{ width: '600px', p: 4, bgcolor: 'var(--n-bg-main)' }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof BudgetRow>;

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: 'ILS',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

export const Healthy: Story = {
    args: {
        category: 'Groceries',
        limit: 3000,
        spent: 1200,
        remaining: 1800,
        percentUsed: 40,
        isOverBudget: false,
        onEdit: () => console.log('Edit'),
        onDelete: () => console.log('Delete'),
        formatCurrency
    },
};

export const Warning: Story = {
    args: {
        category: 'Entertainment',
        limit: 1000,
        spent: 850,
        remaining: 150,
        percentUsed: 85,
        isOverBudget: false,
        onEdit: () => console.log('Edit'),
        onDelete: () => console.log('Delete'),
        formatCurrency
    },
};

export const OverBudget: Story = {
    args: {
        category: 'Dining Out',
        limit: 1500,
        spent: 1850,
        remaining: -350,
        percentUsed: 123,
        isOverBudget: true,
        onEdit: () => console.log('Edit'),
        onDelete: () => console.log('Delete'),
        formatCurrency
    },
};
