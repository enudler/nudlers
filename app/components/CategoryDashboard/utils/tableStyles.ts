import { Theme } from '@mui/material/styles';

// Common table header cell styles
export const getTableHeaderCellStyle = (theme: Theme) => ({
  color: theme.palette.text.secondary,
  borderBottom: `2px solid ${theme.palette.divider}`,
  fontWeight: 600,
  fontSize: '13px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
  padding: '16px'
});

// Common table body cell styles
export const getTableBodyCellStyle = (theme: Theme) => ({
  color: theme.palette.text.primary,
  borderBottom: `1px solid ${theme.palette.divider}`,
  fontWeight: 500,
  padding: '16px'
});

// Common table row hover styles
export const TABLE_ROW_HOVER_STYLE = {
  cursor: 'pointer' as const,
  transition: 'all 0.2s ease-in-out'
};

export const getTableRowHoverBackground = (theme: Theme) =>
  theme.palette.mode === 'dark'
    ? 'rgba(59, 130, 246, 0.15)'
    : 'linear-gradient(135deg, rgba(96, 165, 250, 0.05) 0%, rgba(167, 139, 250, 0.05) 100%)';

