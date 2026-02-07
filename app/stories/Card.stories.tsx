import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Box } from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import Card from '../components/CategoryDashboard/components/Card';

const meta: Meta<typeof Card> = {
    title: 'Components/Card',
    component: Card,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <Box sx={{ width: '320px', p: 4, bgcolor: 'var(--n-bg-main)' }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
    args: {
        title: 'Groceries',
        value: 2450,
        color: '#3b82f6',
        icon: ShoppingCartIcon,
        onClick: () => {},
    },
};

export const Loading: Story = {
    args: {
        title: 'Groceries',
        value: 2450,
        color: '#3b82f6',
        icon: ShoppingCartIcon,
        isLoading: true,
    },
};

export const WithSecondaryValue: Story = {
    args: {
        title: 'Total Spending',
        value: 8500,
        color: '#8b5cf6',
        icon: TrendingUpIcon,
        secondaryValue: 1200,
        secondaryColor: '#10b981',
        secondaryLabel: 'Income',
    },
};

export const WithBudgetHealthy: Story = {
    args: {
        title: 'Groceries',
        value: 1200,
        color: '#22c55e',
        icon: ShoppingCartIcon,
        budget: {
            budget_limit: 3000,
            actual_spent: 1200,
            remaining: 1800,
            percent_used: 40,
            is_over_budget: false,
        },
        onEditBudget: () => {},
    },
};

export const WithBudgetWarning: Story = {
    args: {
        title: 'Entertainment',
        value: 850,
        color: '#f59e0b',
        icon: ShoppingCartIcon,
        budget: {
            budget_limit: 1000,
            actual_spent: 850,
            remaining: 150,
            percent_used: 85,
            is_over_budget: false,
        },
        onEditBudget: () => {},
    },
};

export const WithBudgetOverBudget: Story = {
    args: {
        title: 'Dining Out',
        value: 1845,
        color: '#ef4444',
        icon: ShoppingCartIcon,
        budget: {
            budget_limit: 1500,
            actual_spent: 1845,
            remaining: -345,
            percent_used: 123,
            is_over_budget: true,
        },
        onEditBudget: () => {},
    },
};

export const WithSetBudget: Story = {
    args: {
        title: 'Shopping',
        value: 3200,
        color: '#8b5cf6',
        icon: ShoppingCartIcon,
        onSetBudget: () => {},
    },
};

export const LargeSize: Story = {
    args: {
        title: 'Total Expenses',
        value: 12450,
        color: '#3b82f6',
        icon: TrendingUpIcon,
        size: 'large',
    },
    decorators: [
        (Story) => (
            <Box sx={{ width: '400px', p: 4, bgcolor: 'var(--n-bg-main)' }}>
                <Story />
            </Box>
        ),
    ],
};
