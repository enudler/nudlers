import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import DeleteConfirmationDialog from '../components/DeleteConfirmationDialog';

const meta: Meta<typeof DeleteConfirmationDialog> = {
    title: 'Modals/DeleteConfirmationDialog',
    component: DeleteConfirmationDialog,
    parameters: {
        layout: 'centered',
    },
};

export default meta;
type Story = StoryObj<typeof DeleteConfirmationDialog>;

export const Expense: Story = {
    args: {
        open: true,
        onClose: () => {},
        onConfirm: () => {},
        transaction: {
            name: 'Shufersal Online',
            price: -245.90,
            date: '2026-01-15',
            category: 'Groceries',
        },
    },
};

export const Income: Story = {
    args: {
        open: true,
        onClose: () => {},
        onConfirm: () => {},
        transaction: {
            name: 'Salary January',
            price: 15000,
            date: '2026-01-10',
            category: 'Income',
        },
    },
};

export const WithCategory: Story = {
    args: {
        open: true,
        onClose: () => {},
        onConfirm: () => {},
        transaction: {
            name: 'Netflix Monthly',
            price: -54.90,
            date: '2026-01-05',
            category: 'Entertainment',
        },
    },
};

export const NoCategory: Story = {
    args: {
        open: true,
        onClose: () => {},
        onConfirm: () => {},
        transaction: {
            name: 'Unknown Transaction',
            price: -120,
            date: '2026-02-01',
        },
    },
};
