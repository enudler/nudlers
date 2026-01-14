
import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import StorageIcon from '@mui/icons-material/Storage';
import RefreshIcon from '@mui/icons-material/Refresh';
import { styled } from '@mui/material/styles';

const Container = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    color: '#fff',
    padding: '2rem',
    textAlign: 'center',
});

const IconWrapper = styled(Box)({
    marginBottom: '2rem',
    padding: '2rem',
    borderRadius: '50%',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    animation: 'pulse 2s infinite',
    '@keyframes pulse': {
        '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.4)' },
        '70%': { transform: 'scale(1.05)', boxShadow: '0 0 0 20px rgba(239, 68, 68, 0)' },
        '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(239, 68, 68, 0)' },
    },
});

const StyledButton = styled(Button)({
    marginTop: '2rem',
    padding: '12px 32px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
    color: '#fff',
    textTransform: 'none',
    fontSize: '1rem',
    fontWeight: 600,
    '&:hover': {
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)',
    },
});

interface DatabaseErrorScreenProps {
    onRetry: () => void;
    isRetrying?: boolean;
}

const DatabaseErrorScreen: React.FC<DatabaseErrorScreenProps> = ({ onRetry, isRetrying }) => {
    return (
        <Container>
            <IconWrapper>
                <StorageIcon sx={{ fontSize: '64px', color: '#ef4444' }} />
            </IconWrapper>
            <Typography variant="h3" sx={{ fontWeight: 700, mb: 2, background: 'linear-gradient(to right, #ef4444, #f87171)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Database Connection Failed
            </Typography>
            <Typography variant="h6" sx={{ color: '#94a3b8', maxWidth: '600px', mb: 4, fontWeight: 400, lineHeight: 1.6 }}>
                The application cannot connect to the database. Please verify that the database service is running and accessible.
            </Typography>
            <StyledButton
                onClick={onRetry}
                disabled={isRetrying}
                startIcon={<RefreshIcon className={isRetrying ? 'spin' : ''} />}
                sx={{
                    '& .spin': { animation: 'spin 1s linear infinite' },
                    '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } }
                }}
            >
                {isRetrying ? 'Connecting...' : 'Retry Connection'}
            </StyledButton>
        </Container>
    );
};

export default DatabaseErrorScreen;
