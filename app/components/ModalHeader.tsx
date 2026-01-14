import React from 'react';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';

import { useTheme } from '@mui/material/styles';

interface ModalHeaderProps {
  title: React.ReactNode;
  onClose: () => void;
  actions?: React.ReactNode;
  startAction?: React.ReactNode;
}

export default function ModalHeader({ title, onClose, actions, startAction }: ModalHeaderProps) {
  const theme = useTheme();
  return (
    <DialogTitle
      sx={{
        color: theme.palette.text.primary,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: { xs: '16px', sm: '24px 24px 16px', md: '32px 32px 24px' },
        background: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'linear-gradient(135deg, rgba(248, 250, 252, 0.5) 0%, rgba(241, 245, 249, 0.5) 100%)',
        borderBottom: `1px solid ${theme.palette.divider}`
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          fontSize: { xs: '18px', sm: '20px', md: '24px' },
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          mr: 1
        }}
      >
        {title}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {startAction}
        {actions}
        <IconButton
          onClick={onClose}
          sx={{
            color: 'text.secondary',
            background: theme.palette.mode === 'dark' ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.1)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            minWidth: { xs: 40, md: 'auto' },
            minHeight: { xs: 40, md: 'auto' },
            '&:hover': {
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              transform: 'scale(1.1)',
            }
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>
    </DialogTitle>
  );
}
