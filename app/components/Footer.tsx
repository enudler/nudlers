import React from 'react';
import { Box, Typography, Container, Divider } from '@mui/material';
import { styled, useTheme } from '@mui/material/styles';
import packageJson from '../package.json';

const StyledFooter = styled('footer')(({ theme }) => ({
    padding: '12px 0',
    marginTop: 'auto',
    borderTop: `1px solid ${theme.palette.divider}`,
    background: theme.palette.mode === 'dark'
        ? 'rgba(15, 23, 42, 0.4)'
        : 'rgba(255, 255, 255, 0.4)',
    backdropFilter: 'blur(10px)',
    transition: 'all 0.3s ease',
}));

const FooterContainer = styled(Container)({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '16px',
    '@media (max-width: 600px)': {
        flexDirection: 'column',
        textAlign: 'center',
        gap: '8px',
    },
});

const LogoSection = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
});


const VersionTag = styled(Typography)(({ theme }) => ({
    fontSize: '0.7rem',
    color: theme.palette.text.disabled,
    fontWeight: 500,
    letterSpacing: '0.05em',
}));

const Footer: React.FC = () => {
    const theme = useTheme();

    return (
        <StyledFooter>
            <FooterContainer maxWidth="xl">
                <LogoSection>
                    <img
                        src="/nudlers-logo.svg"
                        alt="Nudlers Logo"
                        style={{
                            width: '20px',
                            height: '20px',
                            objectFit: 'contain'
                        }}
                    />
                    <Typography
                        variant="body2"
                        sx={{
                            fontWeight: 700,
                            letterSpacing: '0.1rem',
                            background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #ec4899 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontSize: '0.85rem'
                        }}
                    >
                        Nudlers
                    </Typography>
                </LogoSection>


                <VersionTag>
                    v{packageJson.version}
                </VersionTag>
            </FooterContainer>
        </StyledFooter>
    );
};

export default Footer;
