import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { Box } from '@mui/material';
import CategoryAutocomplete from '../components/CategoryAutocomplete';

const meta: Meta<typeof CategoryAutocomplete> = {
    title: 'Components/CategoryAutocomplete',
    component: CategoryAutocomplete,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <Box sx={{ width: '300px', p: 4 }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof CategoryAutocomplete>;

const sampleCategories = [
    'Groceries', 'Entertainment', 'Dining Out', 'Transportation',
    'Shopping', 'Health', 'Education', 'Bills & Utilities',
];

const manyCategories = [
    'Groceries', 'Entertainment', 'Dining Out', 'Transportation',
    'Shopping', 'Health', 'Education', 'Bills & Utilities',
    'Insurance', 'Rent', 'Savings', 'Investments',
    'Clothing', 'Electronics', 'Subscriptions', 'Gifts',
    'Travel', 'Pets', 'Home Improvement', 'Personal Care',
    'Sports & Fitness', 'Charity', 'Childcare', 'Automotive',
];

const InteractiveTemplate = (args: any) => {
    const [value, setValue] = useState(args.value || '');
    const [applyToAll, setApplyToAll] = useState(false);
    return (
        <CategoryAutocomplete
            {...args}
            value={value}
            onChange={setValue}
            applyToAll={applyToAll}
            onApplyToAllChange={setApplyToAll}
        />
    );
};

export const Default: Story = {
    render: (args) => <InteractiveTemplate {...args} />,
    args: {
        value: '',
        options: sampleCategories,
    },
};

export const WithValue: Story = {
    render: (args) => <InteractiveTemplate {...args} />,
    args: {
        value: 'Groceries',
        options: sampleCategories,
    },
};

export const WithApplyToAll: Story = {
    render: (args) => <InteractiveTemplate {...args} />,
    args: {
        value: 'Entertainment',
        options: sampleCategories,
        showApplyToAll: true,
    },
};

export const ManyOptions: Story = {
    render: (args) => <InteractiveTemplate {...args} />,
    args: {
        value: '',
        options: manyCategories,
        placeholder: 'Search 24 categories...',
    },
};
