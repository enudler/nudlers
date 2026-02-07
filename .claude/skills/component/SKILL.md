---
name: component
description: Scaffold a new React component with TypeScript and MUI. Use when the user wants to create a new UI component.
---

Create a new component at `app/components/$ARGUMENTS.tsx` following the project's established patterns.

## Requirements

1. **TypeScript** with explicit interface for props
2. **MUI components** (`Box`, `Typography`, `Button`, etc.) — not raw HTML
3. **CSS variables** for theming — always use `var(--n-*)` tokens, never hardcoded colors
4. **Functional component** with `React.FC<Props>` typing
5. **Default export** at the bottom of the file

## Key Design Tokens

```
Backgrounds: var(--n-bg-main), var(--n-bg-surface), var(--n-bg-elevated)
Text: var(--n-text-primary), var(--n-text-secondary), var(--n-text-muted)
Borders: var(--n-border), var(--n-border-light)
Primary: var(--n-primary), var(--n-primary-soft)
Spacing: var(--n-space-xs) through var(--n-space-2xl)
Radius: var(--n-radius-sm), var(--n-radius-md), var(--n-radius-lg), var(--n-radius-xl)
Shadows: var(--n-shadow-sm), var(--n-shadow-md), var(--n-shadow-lg)
```

## Template Structure

```tsx
import React from 'react';
import { Box, Typography } from '@mui/material';

interface ComponentNameProps {
    title: string;
    onAction?: () => void;
}

const ComponentName: React.FC<ComponentNameProps> = ({ title, onAction }) => {
    return (
        <Box
            sx={{
                p: 'var(--n-space-md)',
                backgroundColor: 'var(--n-bg-surface)',
                borderRadius: 'var(--n-radius-lg)',
                border: '1px solid var(--n-border)',
            }}
        >
            <Typography
                variant="h6"
                sx={{ color: 'var(--n-text-primary)' }}
            >
                {title}
            </Typography>
        </Box>
    );
};

export default ComponentName;
```

## If Adding as a Main View

1. Add lazy import in `Layout.tsx`: `const NewView = dynamic(() => import('./NewView'), { ssr: false });`
2. Add to `ViewType` union type
3. Add case in `renderView()` switch
4. Add nav item in `menu.tsx`
