---
name: story
description: Scaffold a Storybook story for a component. Use when the user wants to add a story for a component.
---

Create a new story at `app/stories/$ARGUMENTS.stories.tsx` following the project's established Storybook patterns.

## Requirements

1. **Import type** `Meta` and `StoryObj` from `@storybook/react`
2. **Use decorators** to wrap components in a container with `var(--n-bg-main)` background
3. **Export default meta** with `title` following `Components/ComponentName` convention
4. **Export named stories** for each meaningful state (Default, Loading, Error, Empty, etc.)
5. **Use realistic mock data** — Israeli finance context (shekel amounts, Hebrew-friendly categories)

## Template Structure

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Box } from '@mui/material';
import ComponentName from '../components/ComponentName';

const meta: Meta<typeof ComponentName> = {
    title: 'Components/ComponentName',
    component: ComponentName,
    parameters: {
        layout: 'centered',
    },
    decorators: [
        (Story) => (
            <Box sx={{ width: '400px', p: 4, bgcolor: 'var(--n-bg-main)' }}>
                <Story />
            </Box>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ComponentName>;

export const Default: Story = {
    args: {
        // Default props with realistic data
    },
};

export const Loading: Story = {
    args: {
        isLoading: true,
    },
};

export const Empty: Story = {
    args: {
        data: [],
    },
};
```

## Story Categories

Use these title prefixes for organization:
- `Components/` — reusable UI components
- `Views/` — full page views
- `Design System/` — design tokens, typography, colors

## Running Storybook

```bash
cd app && npm run storybook
```
