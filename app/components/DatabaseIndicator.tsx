import React from 'react';
import { styled, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import StorageIcon from '@mui/icons-material/Storage';
// import CircularProgress from '@mui/material/CircularProgress';
import { useStatus } from '../context/StatusContext';

const Indicator = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 10px',
  borderRadius: '20px',
  backgroundColor: theme.palette.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.05)'
    : 'rgba(0, 0, 0, 0.05)',
  border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(0, 0, 0, 0.08)',
    transform: 'translateY(-1px)',
  },
}));

const StatusDot = styled('div')<{ connected: boolean }>(({ connected, theme }) => ({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: connected ? '#10B981' : '#EF4444',
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: '50%',
    backgroundColor: connected ? '#10B981' : '#EF4444',
    opacity: 0.4,
    animation: connected ? 'pulse 2s infinite' : 'none',
  },
  '@keyframes pulse': {
    '0%': { transform: 'scale(1)', opacity: 0.4 },
    '70%': { transform: 'scale(2.5)', opacity: 0 },
    '100%': { transform: 'scale(1)', opacity: 0 },
  },
}));

const DatabaseIndicator: React.FC = () => {
  const { isDbConnected } = useStatus();
  const theme = useTheme();

  return (
    <Tooltip title={isDbConnected ? "Database Connected" : "Database Disconnected"}>
      <Indicator>
        <StorageIcon
          sx={{
            fontSize: '16px',
            color: theme.palette.mode === 'dark' ? '#94A3B8' : '#64748B'
          }}
        />
        <StatusDot connected={isDbConnected} />
      </Indicator>
    </Tooltip>
  );
};

export default DatabaseIndicator;
