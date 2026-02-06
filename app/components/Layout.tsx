import React, { useState, createContext, useContext, useEffect } from "react";
import dynamic from "next/dynamic";
import { DateSelectionProvider } from "../context/DateSelectionContext";
import ResponsiveAppBar from "./menu";
import { NotificationProvider } from "./NotificationContext";
import DatabaseErrorScreen from "./DatabaseErrorScreen";
import ErrorBoundary from "./ErrorBoundary";
import Footer from "./Footer";
import { Box, useMediaQuery, useTheme } from "@mui/material";
import { StatusProvider, useStatus } from "../context/StatusContext";
import { AIProvider, useAI } from "../context/AIContext";
import GlobalEasterEggManager from "./NumberEasterEgg";

// Duplicated from AIAssistant to avoid importing the full module eagerly
const DRAWER_WIDTH = 400;

// Lazy load view components - only loaded when the user navigates to them
const MonthlySummary = dynamic(() => import("./MonthlySummary"), { ssr: false });
const BudgetDashboard = dynamic(() => import("./BudgetDashboard"), { ssr: false });
const AIAssistant = dynamic(() => import("./AIAssistant"), { ssr: false });
const ScrapeAuditView = dynamic(() => import("./ScrapeAuditView"), { ssr: false });
const RecurringPaymentsView = dynamic(() => import("./RecurringPaymentsView"), { ssr: false });
const ChatView = dynamic(() => import("./ChatView"), { ssr: false });
const DesignSystemShowcase = dynamic(() => import("./DesignSystemShowcase"), { ssr: false });
const BreakdownView = dynamic(() => import("./BreakdownView"), { ssr: false });
const ProjectionView = dynamic(() => import("./ProjectionView"), { ssr: false });

type ViewType = 'dashboard' | 'summary' | 'budget' | 'chat' | 'audit' | 'recurring' | 'design' | 'breakdown' | 'projection';

// Screen context for AI Assistant
interface ScreenContext {
  view: string;
  dateRange?: {
    startDate: string;
    endDate: string;
    mode: string;
  };
  summary?: {
    totalIncome: number;
    totalExpenses: number;
    creditCardExpenses: number;
    categories: Array<{ name: string; value: number }>;
  };
  transactions?: Array<{
    name: string;
    amount: number;
    category: string;
    date: string;
  }>;
}

interface ViewContextType {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  screenContext: ScreenContext;
  setScreenContext: (context: ScreenContext) => void;
  syncDrawerOpen: boolean;
  setSyncDrawerOpen: (open: boolean) => void;
  syncDrawerWidth: number;
  setSyncDrawerWidth: (width: number) => void;
}

const ViewContext = createContext<ViewContextType>({
  currentView: 'summary',
  setCurrentView: () => { },
  screenContext: { view: 'summary' },
  setScreenContext: () => { },
  syncDrawerOpen: false,
  setSyncDrawerOpen: () => { },
  syncDrawerWidth: 600,
  setSyncDrawerWidth: () => { },
});

export const useView = () => useContext(ViewContext);
export const useScreenContext = () => {
  const context = useContext(ViewContext);
  return { screenContext: context.screenContext, setScreenContext: context.setScreenContext };
};

interface LayoutProps {
  children: React.ReactNode;
  defaultView?: ViewType;
}

const Layout: React.FC<LayoutProps> = ({ children, defaultView = 'summary' }) => {
  const [currentView, setCurrentView] = useState<ViewType>(defaultView);
  const [screenContext, setScreenContext] = useState<ScreenContext>({ view: 'summary' });
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
  const [syncDrawerWidth, setSyncDrawerWidth] = useState(600);
  const { dbError, checkDb } = useStatus();
  const [isRetrying, setIsRetrying] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    await checkDb();
    setIsRetrying(false);
  };

  useEffect(() => {
    // We consider it "done" once we have a status, but for simplicity
    // we just wait 500ms or until dbError is determined.
    // Actually, we can just use the context's state.
    const timer = setTimeout(() => setInitialCheckDone(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Load saved width on mount
  React.useEffect(() => {
    const savedWidth = localStorage.getItem('syncStatusDrawerWidth');
    if (savedWidth) {
      setSyncDrawerWidth(parseInt(savedWidth, 10));
    }
  }, []);

  // Update screen context when view changes
  const handleViewChange = React.useCallback((view: ViewType) => {
    setCurrentView(view);
    setScreenContext(prev => ({ ...prev, view }));
  }, []);


  const contextValue = React.useMemo(() => ({
    currentView,
    setCurrentView: handleViewChange,
    screenContext,
    setScreenContext,
    syncDrawerOpen,
    setSyncDrawerOpen,
    syncDrawerWidth,
    setSyncDrawerWidth
  }), [currentView, screenContext, syncDrawerOpen, syncDrawerWidth]);

  const renderView = () => {
    switch (currentView) {
      case 'summary':
        return <MonthlySummary />;
      case 'budget':
        return <BudgetDashboard />;
      case 'chat':
        return <ChatView />;
      case 'audit':
        return <ScrapeAuditView />;
      case 'recurring':
        return <RecurringPaymentsView />;
      case 'design':
        return <DesignSystemShowcase />;
      case 'breakdown':
        return <BreakdownView />;
      case 'projection':
        return <ProjectionView />;
      default:
        return children;
    }
  };

  // If DB check failed, block UI
  // We wait for initial check to avoid flashing error screen on first load before ping returns.
  if (dbError && initialCheckDone) {
    return <DatabaseErrorScreen onRetry={handleRetry} isRetrying={isRetrying} />;
  }

  // Show nothing or a loader until we know the DB status to prevent children from crashing
  if (!initialCheckDone) {
    return null; // Or a centralized loading spinner
  }


  return (
    <AIProvider>
      <DateSelectionProvider>
        <LayoutContent
          contextValue={contextValue}
          currentView={currentView}
          handleViewChange={handleViewChange}
          renderView={renderView}
          screenContext={screenContext}
        />
      </DateSelectionProvider>
    </AIProvider>
  );
};

// Extracted inner component to use the AI context 
const LayoutContent: React.FC<{
  contextValue: ViewContextType;
  currentView: ViewType;
  handleViewChange: (view: ViewType) => void;
  renderView: () => React.ReactNode;
  screenContext: ScreenContext;
}> = ({ contextValue, currentView, handleViewChange, renderView, screenContext }) => {
  const { isOpen } = useAI();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  return (
    <NotificationProvider>
      <ViewContext.Provider value={contextValue}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: 'var(--n-bg-main)',
            transition: 'margin-right 0.3s ease',
            marginRight: isDesktop ? `${(isOpen ? DRAWER_WIDTH : 0) + (contextValue.syncDrawerOpen ? contextValue.syncDrawerWidth : 0)}px` : 0,
          }}
        >
          {/* Ambient Background Glows */}
          <Box
            sx={{
              position: 'fixed',
              top: '-10%',
              left: '-10%',
              width: '40%',
              height: '40%',
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(99, 102, 241, 0) 70%)',
              zIndex: 0,
              pointerEvents: 'none',
              filter: 'blur(40px)',
            }}
          />
          <Box
            sx={{
              position: 'fixed',
              bottom: '-10%',
              right: '-10%',
              width: '40%',
              height: '40%',
              background: 'radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, rgba(236, 72, 153, 0) 70%)',
              zIndex: 0,
              pointerEvents: 'none',
              filter: 'blur(40px)',
            }}
          />

          <ResponsiveAppBar
            currentView={currentView}
            onViewChange={handleViewChange}
          />
          <Box
            component="main"
            sx={{
              marginTop: { xs: '56px', md: '48px' },
              flex: 1,
              zIndex: 1,
              position: 'relative',
            }}
            className="main-content"
          >
            <ErrorBoundary>
              {renderView()}
            </ErrorBoundary>
          </Box>
          {currentView !== 'chat' && <Footer />}
          <AIAssistant screenContext={screenContext} />
          <GlobalEasterEggManager />
        </Box>
      </ViewContext.Provider>
    </NotificationProvider>
  );
};

export default Layout;
