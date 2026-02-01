import type { Meta, StoryObj } from '@storybook/react';
import { ProjectionViewContent, ProjectionData } from '../components/ProjectionView';
import { format, addDays } from 'date-fns';

const meta = {
    title: 'Reports/ProjectionView',
    component: ProjectionViewContent,
    parameters: {
        layout: 'fullscreen',
    },
    args: {
        loading: false,
        selectedAccount: 'total',
        isAddDialogOpen: false,
        newRecurring: {
            name: '',
            amount: '',
            category: '',
            account_number: '',
            day_of_month: 1,
            frequency: 'monthly'
        },
        snackbar: { open: false, message: '', severity: 'success' },
        categories: ['Groceries', 'Utilities', 'Entertainment', 'Transport'],
        onRefresh: () => { },
        onToggleVisibility: () => { },
        onMarkNotRecurring: (name) => { },
        onAddRecurring: () => { },
        setSelectedAccount: (val) => { },
        setIsAddDialogOpen: (open) => { },
        setNewRecurring: () => { },
        setSnackbar: () => { },
    },
} satisfies Meta<typeof ProjectionViewContent>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock Data
const today = new Date();
const mockAccounts = [
    { account_number: '12345', nickname: 'Checking', balance: 15000 },
    { account_number: '67890', nickname: 'Savings', balance: 50000 },
];

const mockProjectionData: ProjectionData[] = Array.from({ length: 15 }).map((_, i) => {
    const date = addDays(today, i).toISOString();
    return {
        date,
        balances: {
            '12345': 15000 - (i * 100),
            '67890': 50000 + (i * 50),
        },
        totalBalance: 65000 - (i * 50),
        dailyChange: -50,
        bankRecurring: i % 3 === 0 ? [
            { name: 'Netflix', amount: -45, category: 'Entertainment', account_number: '12345' },
        ] : [],
        ccPayments: i % 5 === 0 ? [
            { name: 'Visa Gold', displayName: 'Visa ***4242', amount: -2500, vendor: 'Visa', account_number: '12345', count: 12 }
        ] : [],
    };
});

export const Desktop: Story = {
    args: {
        data: mockProjectionData,
        accounts: mockAccounts,
    },
};

export const Mobile: Story = {
    args: {
        data: mockProjectionData,
        accounts: mockAccounts,
    },
    parameters: {
        viewport: {
            defaultViewport: 'mobile1',
        },
    },
};

export const Loading: Story = {
    args: {
        loading: true,
        data: [],
        accounts: [],
    },
};

export const Empty: Story = {
    args: {
        data: [],
        accounts: mockAccounts,
    },
};
