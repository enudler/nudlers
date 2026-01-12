import * as React from "react";
import packageJson from '../package.json';
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Menu from "@mui/material/Menu";
import Container from "@mui/material/Container";
import Button from "@mui/material/Button";
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
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PersonIcon from '@mui/icons-material/Person';
import SettingsIcon from '@mui/icons-material/Settings';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import SummarizeIcon from '@mui/icons-material/Summarize';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SavingsIcon from '@mui/icons-material/Savings';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import BackupIcon from '@mui/icons-material/Backup';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import ScrapeModal from './ScrapeModal';
import ManualModal from './ManualModal';
import DatabaseIndicator from './DatabaseIndicator';
import AccountsModal from './AccountsModal';
import CategoryManagementModal from './CategoryDashboard/components/CategoryManagementModal';
import ScrapeAuditModal from './ScrapeAuditModal';
import CardVendorsModal from './CardVendorsModal';
import RecurringPaymentsModal from './RecurringPaymentsModal';
import DatabaseBackupModal from './DatabaseBackupModal';
import SettingsModal from './SettingsModal';
import SyncStatusIndicator from './SyncStatusIndicator';
import SyncStatusModal from './SyncStatusModal';
import { useNotification } from './NotificationContext';
import RepeatIcon from '@mui/icons-material/Repeat';
import TuneIcon from '@mui/icons-material/Tune';

interface StringDictionary {
  [key: string]: string;
}

interface ResponsiveAppBarProps {
  currentView?: 'dashboard' | 'summary' | 'budget';
  onViewChange?: (view: 'dashboard' | 'summary' | 'budget') => void;
}

const pages: StringDictionary = {};

const StyledAppBar = styled(AppBar)({
  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
});

const Logo = styled(Typography)({
  fontFamily: "Assistant, sans-serif",
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

const NavButton = styled(Button)({
  color: 'rgba(255, 255, 255, 0.9)',
  textTransform: 'none',
  fontSize: '0.95rem',
  fontWeight: 500,
  padding: '8px 16px',
  borderRadius: '12px',
  margin: '0 4px',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '-100%',
    width: '100%',
    height: '100%',
    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
    transition: 'left 0.5s ease-in-out',
  },
  '&:hover': {
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 16px rgba(96, 165, 250, 0.3)',
    color: '#fff',
  },
  '&:hover::before': {
    left: '100%',
  },
  '&:active': {
    transform: 'translateY(0)',
  },
});

const redirectTo = (page: string) => {
  return () => (window.location.href = page);
};

function ResponsiveAppBar({ currentView = 'dashboard', onViewChange }: ResponsiveAppBarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [desktopDrawerOpen, setDesktopDrawerOpen] = React.useState(true); // Persistent drawer for desktop
  const [anchorElUser, setAnchorElUser] = React.useState<null | HTMLElement>(null);
  const [isScrapeModalOpen, setIsScrapeModalOpen] = React.useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = React.useState(false);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = React.useState(false);
  const [isCategoryManagementOpen, setIsCategoryManagementOpen] = React.useState(false);
  const [isAuditOpen, setIsAuditOpen] = React.useState(false);
  const [isCardVendorsOpen, setIsCardVendorsOpen] = React.useState(false);
  const [isRecurringOpen, setIsRecurringOpen] = React.useState(false);
  const [isBackupOpen, setIsBackupOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isSyncStatusOpen, setIsSyncStatusOpen] = React.useState(false);
  const { showNotification } = useNotification();

  const handleDrawerToggle = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  const handleDesktopDrawerToggle = () => {
    setDesktopDrawerOpen(!desktopDrawerOpen);
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

  // Menu items for mobile drawer
  const viewMenuItems = [
    { label: 'Summary', icon: <SummarizeIcon />, view: 'summary' as const, color: '#3b82f6' },
    { label: 'Overview', icon: <DashboardIcon />, view: 'dashboard' as const, color: '#3b82f6' },
    { label: 'Budget', icon: <SavingsIcon />, view: 'budget' as const, color: '#22c55e' },
  ];

  const actionMenuItems = [
    { label: 'Audit', icon: <HistoryIcon />, action: () => setIsAuditOpen(true) },
    { label: 'Recurring', icon: <RepeatIcon />, action: () => setIsRecurringOpen(true) },
    { label: 'Manual', icon: <EditIcon />, action: () => setIsManualModalOpen(true) },
  ];

  const settingsMenuItems = [
    { label: 'Categories', icon: <SettingsIcon />, action: () => setIsCategoryManagementOpen(true) },
    { label: 'Accounts', icon: <PersonIcon />, action: () => setIsAccountsModalOpen(true) },
    { label: 'Cards', icon: <CreditCardIcon />, action: () => setIsCardVendorsOpen(true) },
    { label: 'Backup', icon: <BackupIcon />, action: () => setIsBackupOpen(true) },
    { label: 'Settings', icon: <TuneIcon />, action: () => setIsSettingsOpen(true) },
  ];

  const handleCloseUserMenu = () => {
    setAnchorElUser(null);
  };

  const handleAddManualTransaction = async (transactionData: {
    name: string;
    amount: number;
    date: Date;
    type: 'income' | 'expense';
    category?: string;
  }) => {
    try {
      const formattedDate = transactionData.date.toISOString().split('T')[0];

      const response = await fetch("/api/manual_transaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: transactionData.name,
          amount: transactionData.amount,
          date: formattedDate,
          type: transactionData.type,
          category: transactionData.category
        }),
      });

      if (response.ok) {
        setIsManualModalOpen(false);
        // Dispatch a custom event to trigger data refresh
        window.dispatchEvent(new CustomEvent('dataRefresh'));
      } else {
        console.error("Failed to add manual transaction");
      }
    } catch (error) {
      console.error("Error adding manual transaction:", error);
    }
  };

  const handleScrapeSuccess = () => {
    showNotification('Scraping process completed successfully!', 'success');
    // Dispatch a custom event to trigger data refresh
    window.dispatchEvent(new CustomEvent('dataRefresh'));
  };

  // Shared drawer content component
  const drawerContent = (isMobile: boolean) => (
    <Box
      sx={{ 
        width: isMobile ? 280 : 280,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        pb: isMobile ? 8 : 2,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
      role="presentation"
    >
      {/* Close Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', p: 1 }}>
        {isMobile ? (
          <IconButton onClick={handleDrawerToggle} sx={{ color: '#64748b' }}>
            <CloseIcon />
          </IconButton>
        ) : (
          <IconButton onClick={handleDesktopDrawerToggle} sx={{ color: '#64748b' }}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {/* Scrollable Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
      {/* Views Section */}
      <Box sx={{ p: 1 }}>
        <Typography sx={{ px: 2, py: 1, fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
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
                  borderRadius: '12px',
                  mx: 1,
                  mb: 0.5,
                  backgroundColor: currentView === item.view ? `${item.color}15` : 'transparent',
                  '&:hover': {
                    backgroundColor: `${item.color}20`,
                  },
                }}
              >
                <ListItemIcon sx={{ color: currentView === item.view ? item.color : '#64748b', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  sx={{
                    '& .MuiTypography-root': {
                      fontWeight: currentView === item.view ? 600 : 500,
                      color: currentView === item.view ? item.color : '#1e293b',
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Actions Section */}
      <Box sx={{ p: 1 }}>
        <Typography sx={{ px: 2, py: 1, fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
          Actions
        </Typography>
        <List disablePadding>
          {actionMenuItems.map((item) => (
            <ListItem key={item.label} disablePadding>
              <ListItemButton
                onClick={() => {
                  item.action();
                  if (isMobile) {
                    handleDrawerToggle();
                  }
                }}
                sx={{
                  borderRadius: '12px',
                  mx: 1,
                  mb: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: '#64748b', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} sx={{ '& .MuiTypography-root': { fontWeight: 500, color: '#1e293b' } }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Settings Section */}
      <Box sx={{ p: 1 }}>
        <Typography sx={{ px: 2, py: 1, fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
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
                  borderRadius: '12px',
                  mx: 1,
                  mb: 0.5,
                  '&:hover': {
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: '#64748b', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.label} sx={{ '& .MuiTypography-root': { fontWeight: 500, color: '#1e293b' } }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      </Box>
      
      {/* Version Footer */}
      <Box sx={{
        p: 2,
        textAlign: 'center',
        borderTop: '1px solid rgba(148, 163, 184, 0.1)',
        background: '#fff',
        flexShrink: 0,
      }}>
        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '11px' }}>
          v{packageJson.version}
        </Typography>
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
            {/* Mobile Menu Button */}
            <IconButton
              onClick={handleDrawerToggle}
              sx={{
                display: { xs: 'flex', md: 'none' },
                color: '#fff',
                mr: 1,
              }}
            >
              <MenuIcon />
            </IconButton>

            {/* Logo - always visible */}
            <Logo
              variant="h4"
              noWrap
              onClick={redirectTo("/")}
              sx={{
                mr: 2,
                display: 'flex',
                fontSize: { xs: '1.2rem', md: '1.5rem' },
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: { xs: '20px', md: '24px' }, color: '#60a5fa' }} />
              Nudlers
            </Logo>

            {/* Desktop Actions - Only status indicators */}
            <Box sx={{ flexGrow: 0, display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: '8px' }}>
              <IconButton
                onClick={handleDesktopDrawerToggle}
                sx={{
                  color: '#fff',
                  mr: 1,
                }}
              >
                <MenuIcon />
              </IconButton>
              <SyncStatusIndicator onClick={() => setIsSyncStatusOpen(true)} />
              <DatabaseIndicator />
            </Box>

            {/* Mobile Status Indicators */}
            <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' }, justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
              <SyncStatusIndicator onClick={() => setIsSyncStatusOpen(true)} />
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
            width: 280,
            background: '#fff',
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
            width: 280,
            background: '#fff',
            borderRight: '1px solid rgba(148, 163, 184, 0.1)',
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
      <ManualModal
        open={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSave={handleAddManualTransaction}
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
      <ScrapeAuditModal open={isAuditOpen} onClose={() => setIsAuditOpen(false)} />
      <CardVendorsModal
        isOpen={isCardVendorsOpen}
        onClose={() => setIsCardVendorsOpen(false)}
      />
      <RecurringPaymentsModal
        open={isRecurringOpen}
        onClose={() => setIsRecurringOpen(false)}
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
        open={isSyncStatusOpen}
        onClose={() => setIsSyncStatusOpen(false)}
      />
    </>
  );
}

export default ResponsiveAppBar;
