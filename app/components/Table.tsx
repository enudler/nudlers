
import React from 'react';
import {
    Box,
    Table as MuiTable,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    CircularProgress,
    Typography,
    useTheme,
    useMediaQuery,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

export interface Column<T> {
    id: string;
    label: string | React.ReactNode;
    align?: 'left' | 'center' | 'right';
    minWidth?: string | number;
    format?: (value: any, row: T) => React.ReactNode;
    sortable?: boolean;
}

export interface TableProps<T> {
    columns: Column<T>[];
    rows: T[];
    loading?: boolean;
    emptyMessage?: string;
    onRowClick?: (row: T) => void;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    onSort?: (field: string) => void;
    rowKey: (row: T) => string | number;
    mobileCardRenderer?: (row: T) => React.ReactNode;
    footer?: React.ReactNode;
    renderSubRow?: (row: T) => React.ReactNode;
    expandedRowIds?: Set<any>;
    onRowToggle?: (rowId: string | number) => void;
    stickyHeader?: boolean;
    maxHeight?: string | number;
}

const Table = <T,>({
    columns,
    rows,
    loading = false,
    emptyMessage = 'No data available',
    onRowClick,
    sortField,
    sortDirection,
    onSort,
    rowKey,
    mobileCardRenderer,
    footer,
    renderSubRow,
    expandedRowIds,
    onRowToggle,
    stickyHeader = false,
    maxHeight = '70vh'
}: TableProps<T>) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const handleSort = (columnId: string) => {
        if (onSort) {
            onSort(columnId);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (rows.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
                <Typography>{emptyMessage}</Typography>
            </Box>
        );
    }

    if (isMobile && mobileCardRenderer) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {rows.map((row) => (
                    <Box key={rowKey(row)}>
                        <Paper
                            elevation={0}
                            sx={{
                                p: 2,
                                borderRadius: '16px',
                                border: `1px solid ${theme.palette.divider}`,
                                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                                backdropFilter: 'blur(10px)',
                                cursor: onRowClick || onRowToggle ? 'pointer' : 'default',
                                transition: 'all 0.2s ease',
                                '&:active': (onRowClick || onRowToggle) ? {
                                    transform: 'scale(0.98)',
                                    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                                } : {}
                            }}
                            onClick={() => {
                                if (onRowToggle) onRowToggle(rowKey(row));
                                if (onRowClick) onRowClick(row);
                            }}
                        >
                            {mobileCardRenderer(row)}
                        </Paper>
                        {/* Render subrow on mobile if expanded */}
                        {renderSubRow && expandedRowIds?.has(rowKey(row)) && (
                            <Box sx={{ mt: 1, pl: 2 }}>
                                {renderSubRow(row)}
                            </Box>
                        )}
                    </Box>
                ))}
                {footer && <Box sx={{ mt: 2 }}>{footer}</Box>}
            </Box>
        );
    }

    return (
        <TableContainer
            component={Paper}
            className="n-glass"
            elevation={0}
            sx={{
                borderRadius: '24px',
                border: `1px solid ${theme.palette.divider}`,
                background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(255, 255, 255, 0.6)',
                backdropFilter: 'blur(20px)',
                overflowX: 'auto',
                maxHeight: stickyHeader ? maxHeight : 'none',
                '&::-webkit-scrollbar': { width: '8px', height: '8px' },
                '&::-webkit-scrollbar-track': { background: 'transparent' },
                '&::-webkit-scrollbar-thumb': {
                    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    borderRadius: '10px',
                    border: '2px solid transparent',
                    backgroundClip: 'content-box'
                },
                '&:hover::-webkit-scrollbar-thumb': {
                    background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                    backgroundClip: 'content-box'
                }
            }}
        >
            <MuiTable sx={{ minWidth: 'unset' }} stickyHeader={stickyHeader}>
                <TableHead>
                    <TableRow sx={{
                        borderBottom: `2px solid ${theme.palette.divider}`,
                        '& th': {
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            color: 'text.secondary',
                            bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#f8fafc',
                            position: stickyHeader ? 'sticky' : 'static',
                            top: 0,
                            zIndex: 10
                        }
                    }}>
                        {columns.map((column) => (
                            <TableCell
                                key={column.id}
                                align={column.align || 'left'}
                                sx={{ minWidth: column.minWidth }}
                            >
                                {column.sortable && onSort ? (
                                    <Box
                                        onClick={() => handleSort(column.id)}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 0.5,
                                            cursor: 'pointer',
                                            justifyContent: column.align === 'right' ? 'flex-end' : column.align === 'center' ? 'center' : 'flex-start',
                                            '&:hover': { color: 'primary.main' }
                                        }}
                                    >
                                        {column.label}
                                        {sortField === column.id && (
                                            sortDirection === 'asc'
                                                ? <ArrowUpwardIcon fontSize="small" />
                                                : <ArrowDownwardIcon fontSize="small" />
                                        )}
                                    </Box>
                                ) : (
                                    column.label
                                )}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => {
                        const rKey = rowKey(row);
                        const isExpanded = expandedRowIds?.has(rKey);
                        return (
                            <React.Fragment key={rKey}>
                                <TableRow
                                    hover={!!onRowClick || !!onRowToggle}
                                    onClick={() => {
                                        if (onRowToggle) onRowToggle(rKey);
                                        if (onRowClick) onRowClick(row);
                                    }}
                                    sx={{
                                        cursor: (onRowClick || onRowToggle) ? 'pointer' : 'default',
                                        '&:last-child td, &:last-child th': { border: 0 },
                                        transition: 'background-color 0.2s',
                                        '&:hover': {
                                            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)'
                                        }
                                    }}
                                >
                                    {columns.map((column) => {
                                        const value = (row as any)[column.id];
                                        return (
                                            <TableCell key={column.id} align={column.align || 'left'} sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                                {column.format ? column.format(value, row) : value}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                                {renderSubRow && isExpanded && (
                                    <TableRow>
                                        <TableCell colSpan={columns.length} sx={{ p: 0 }}>
                                            {renderSubRow(row)}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </React.Fragment>
                        );
                    })}
                    {footer}
                </TableBody>
            </MuiTable>
        </TableContainer>
    );
};

export default Table;
