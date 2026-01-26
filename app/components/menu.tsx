import * as React from "react";
import { logger } from '../utils/client-logger';

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";

import Container from "@mui/material/Container";

import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme, styled } from "@mui/material/styles";

import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import SummarizeIcon from '@mui/icons-material/Summarize';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SavingsIcon from '@mui/icons-material/Savings';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import BackupIcon from '@mui/icons-material/Backup';

import ForumIcon from '@mui/icons-material/Forum';
import dynamic from 'next/dynamic';
import DatabaseIndicator from './DatabaseIndicator';
import SyncStatusIndicator from './SyncStatusIndicator';
import { useNotification } from './NotificationContext';
import RepeatIcon from '@mui/icons-material/Repeat';
import TuneIcon from '@mui/icons-material/Tune';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { useColorMode } from '../context/ThemeContext';
import Image from 'next/image';

const ScrapeModal = dynamic(() => import('./ScrapeModal'), { ssr: false });
const AccountsModal = dynamic(() => import('./AccountsModal'), { ssr: false });
const CategoryManagementModal = dynamic(() => import('./CategoryDashboard/components/CategoryManagementModal'), { ssr: false });
const CardVendorsModal = dynamic(() => import('./CardVendorsModal'), { ssr: false });
const DatabaseBackupModal = dynamic(() => import('./DatabaseBackupModal'), { ssr: false });
const SettingsModal = dynamic(() => import('./SettingsModal'), { ssr: false });
const SyncStatusModal = dynamic(() => import('./SyncStatusModal'), { ssr: false });



interface ResponsiveAppBarProps {
  currentView?: 'dashboard' | 'summary' | 'budget' | 'chat' | 'audit' | 'recurring' | 'design';
  onViewChange?: (view: 'dashboard' | 'summary' | 'budget' | 'chat' | 'audit' | 'recurring' | 'design') => void;
}



const StyledAppBar = styled(AppBar)(({ theme }) => ({
  background: 'var(--n-glass-bg)',
  backdropFilter: 'blur(12px)',
  borderBottom: '1px solid var(--n-border)',
  boxShadow: 'none',
  color: 'var(--n-text-primary)',
}));

const Logo = styled(Typography)({
  fontFamily: "Outfit, Assistant, sans-serif",
  fontWeight: 700,
  letterSpacing: ".3rem",
  background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #ec4899 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  textDecoration: "none",
  cursor: "pointer",
  fontSize: '1.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    transform: 'translateY(-2px)',
    filter: 'brightness(1.2)',
  },
});



import { useView } from "./Layout";



function ResponsiveAppBar({ currentView = 'summary', onViewChange }: ResponsiveAppBarProps) {
  const theme = useTheme();
  const { toggleColorMode, mode } = useColorMode();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [desktopDrawerOpen, setDesktopDrawerOpen] = React.useState(true); // Persistent drawer for desktop
  const [isScrapeModalOpen, setIsScrapeModalOpen] = React.useState(false);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = React.useState(false);
  const [isCategoryManagementOpen, setIsCategoryManagementOpen] = React.useState(false);
  const [isCardVendorsOpen, setIsCardVendorsOpen] = React.useState(false);
  const [isBackupOpen, setIsBackupOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  // Use global sync drawer state
  const { syncDrawerOpen, setSyncDrawerOpen, syncDrawerWidth, setSyncDrawerWidth } = useView();

  const { showNotification } = useNotification();

  const handleDrawerToggle = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  const handleDesktopDrawerToggle = () => {
    setDesktopDrawerOpen(!desktopDrawerOpen);
  };

  const handleLogoClick = () => {
    if (isMobile) {
      handleDrawerToggle();
    } else {
      handleDesktopDrawerToggle();
    }
  };

  // Update body class based on drawer state for CSS styling
  React.useEffect(() => {
    if (!isMobile) {
      if (desktopDrawerOpen) {
        document.body.classList.add('drawer-open');
        document.body.classList.remove('drawer-closed');
      } else {
        document.body.classList.add('drawer-closed');
        document.body.classList.remove('drawer-open');
      }
    }
    return () => {
      document.body.classList.remove('drawer-open', 'drawer-closed');
    };
  }, [desktopDrawerOpen, isMobile]);

  const viewMenuItems = [
    { label: 'Cards', icon: <CreditCardIcon />, view: 'summary' as const, color: 'var(--n-primary)' },
    { label: 'Budgets', icon: <SavingsIcon />, view: 'dashboard' as const, color: 'var(--n-primary)' },
    { label: 'Audit', icon: <HistoryIcon />, view: 'audit' as const, color: 'var(--n-primary)' },
    { label: 'Recurring', icon: <RepeatIcon />, view: 'recurring' as const, color: 'var(--n-primary)' },
    { label: 'Chat', icon: <ForumIcon />, view: 'chat' as const, color: 'var(--n-primary)' },
  ];


  const settingsMenuItems = [
    { label: 'Categories', icon: <SettingsIcon />, action: () => setIsCategoryManagementOpen(true) },
    { label: 'Accounts', icon: <PersonIcon />, action: () => setIsAccountsModalOpen(true) },
    { label: 'Cards', icon: <CreditCardIcon />, action: () => setIsCardVendorsOpen(true) },
    { label: 'Backup', icon: <BackupIcon />, action: () => setIsBackupOpen(true) },
    { label: 'Settings', icon: <TuneIcon />, action: () => setIsSettingsOpen(true) },
  ];



  const handleScrapeSuccess = () => {
    showNotification('Scraping process completed successfully!', 'success');
    // Dispatch a custom event to trigger data refresh
    window.dispatchEvent(new CustomEvent('dataRefresh'));
  };

  // Shared drawer content component
  const drawerContent = (isMobile: boolean) => (
    <Box
      sx={{
        width: isMobile ? 250 : 220,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        pb: isMobile ? 8 : 2,
        overflow: 'hidden', // Completely hide scrolling
      }}
      role="presentation"
    >
      {/* Content */}
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        // Hide scrollbar
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',  /* Firefox */
        msOverflowStyle: 'none',  /* IE and Edge */
      }}>
        {/* Views Section */}
        <Box sx={{ p: 1, pb: 0 }}>
          <Typography sx={{ px: 2, py: 0.5, fontSize: '10px', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Views
          </Typography>
          <List disablePadding>
            {viewMenuItems.map((item) => (
              <ListItem key={item.label} disablePadding>
                <ListItemButton
                  onClick={() => {
                    onViewChange?.(item.view);
                    if (isMobile) {
                      handleDrawerToggle();
                    }
                  }}
                  sx={{
                    borderRadius: '8px',
                    mx: 1,
                    mb: 0.25,
                    py: 0.5,
                    minHeight: 32,
                    backgroundColor: currentView === item.view ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: currentView === item.view ? item.color : 'text.secondary', minWidth: 32, '& .MuiSvgIcon-root': { fontSize: 18 } }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    sx={{
                      m: 0,
                      '& .MuiTypography-root': {
                        fontSize: '0.8125rem',
                        fontWeight: currentView === item.view ? 600 : 500,
                        color: currentView === item.view ? theme.palette.primary.main : theme.palette.text.secondary,
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        <Divider sx={{ my: 0.5 }} />

        {/* Settings Section */}
        <Box sx={{ p: 1, pb: 0 }}>
          <Typography sx={{ px: 2, py: 0.5, fontSize: '10px', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Settings
          </Typography>
          <List disablePadding>
            {settingsMenuItems.map((item) => (
              <ListItem key={item.label} disablePadding>
                <ListItemButton
                  onClick={() => {
                    item.action();
                    if (isMobile) {
                      handleDrawerToggle();
                    }
                  }}
                  sx={{
                    borderRadius: '8px',
                    mx: 1,
                    mb: 0.25,
                    py: 0.5,
                    minHeight: 32,
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: 'text.secondary', minWidth: 32, '& .MuiSvgIcon-root': { fontSize: 18 } }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.label} sx={{ m: 0, '& .MuiTypography-root': { fontSize: '0.8125rem', fontWeight: 500, color: 'text.secondary' } }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

      </Box>

    </Box>
  );

  // Mobile drawer content
  const mobileDrawer = drawerContent(true);

  return (
    <>
      <StyledAppBar position="fixed">
        <Container maxWidth={false}>
          <Toolbar disableGutters variant="dense" sx={{ minHeight: { xs: '56px', md: '48px' } }}>
            {/* Logo - always visible */}
            <Logo
              variant="h4"
              noWrap
              onClick={handleLogoClick}
              sx={{
                mr: 2,
                display: 'flex',
                fontSize: { xs: '1.2rem', md: '1.5rem' },
              }}
            >
              <Image
                src="/nudlers-logo.svg"
                alt="Nudlers Logo"
                width={36}
                height={36}
                style={{
                  width: 'auto',
                  height: '36px',
                  objectFit: 'contain'
                }}
              />
              Nudlers
            </Logo>

            <Box sx={{ flexGrow: 1 }} />

            {/* Desktop Actions - Only status indicators */}
            <Box sx={{ flexGrow: 0, display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: '8px' }}>
              <IconButton onClick={toggleColorMode} sx={{ color: 'text.primary' }}>
                {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
              <SyncStatusIndicator onClick={() => setSyncDrawerOpen(true)} />
              <DatabaseIndicator />
            </Box>

            {/* Mobile Status Indicators */}
            <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' }, justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
              <IconButton onClick={toggleColorMode} sx={{ color: 'text.primary' }}>
                {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
              <SyncStatusIndicator onClick={() => setSyncDrawerOpen(true)} />
              <DatabaseIndicator />
            </Box>
          </Toolbar>
        </Container>
      </StyledAppBar>

      {/* Mobile Drawer */}
      <Drawer
        anchor="left"
        open={mobileDrawerOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile
        }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 250,
            background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
          },
        }}
      >
        {mobileDrawer}
      </Drawer>

      {/* Desktop Persistent Drawer */}
      <Drawer
        variant="persistent"
        anchor="left"
        open={desktopDrawerOpen}
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: 220,
            background: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(10px)',
            borderRight: 'none',
            top: '48px', // Height of AppBar
            height: 'calc(100vh - 48px)',
          },
        }}
      >
        {drawerContent(false)}
      </Drawer>
      <ScrapeModal
        isOpen={isScrapeModalOpen}
        onClose={() => setIsScrapeModalOpen(false)}
        onSuccess={handleScrapeSuccess}
      />
      <AccountsModal
        isOpen={isAccountsModalOpen}
        onClose={() => setIsAccountsModalOpen(false)}
      />
      <CategoryManagementModal
        open={isCategoryManagementOpen}
        onClose={() => setIsCategoryManagementOpen(false)}
        onCategoriesUpdated={() => {
          // Dispatch a custom event to trigger data refresh
          window.dispatchEvent(new CustomEvent('dataRefresh'));
        }}
      />
      <CardVendorsModal
        isOpen={isCardVendorsOpen}
        onClose={() => setIsCardVendorsOpen(false)}
      />
      <DatabaseBackupModal
        open={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
      />
      <SettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <SyncStatusModal
        open={syncDrawerOpen}
        onClose={() => setSyncDrawerOpen(false)}
        width={syncDrawerWidth}
        onWidthChange={setSyncDrawerWidth}
        onSyncSuccess={() => {
          window.dispatchEvent(new CustomEvent('dataRefresh'));
        }}
      />
    </>
  );
}

export default ResponsiveAppBar;
