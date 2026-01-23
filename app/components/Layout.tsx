import React, { useState, createContext, useContext, useEffect } from "react";
import { DateSelectionProvider } from "../context/DateSelectionContext";
import ResponsiveAppBar from "./menu";
import { NotificationProvider } from "./NotificationContext";
import MonthlySummary from "./MonthlySummary";
import BudgetDashboard from "./BudgetDashboard";
import AIAssistant from "./AIAssistant";
import ChatView from "./ChatView";
import DatabaseErrorScreen from "./DatabaseErrorScreen";
import Footer from "./Footer";
import { Box } from "@mui/material";
import { useSyncStatus } from "../context/SyncStatusContext";

type ViewType = 'dashboard' | 'summary' | 'budget' | 'chat';

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
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [currentView, setCurrentView] = useState<ViewType>('summary');
  const [screenContext, setScreenContext] = useState<ScreenContext>({ view: 'summary' });
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false);
  const [syncDrawerWidth, setSyncDrawerWidth] = useState(600);

  const { dbConnected, loading, refreshStatus } = useSyncStatus();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    await refreshStatus();
    setIsRetrying(false);
  };

  // Load saved width on mount
  React.useEffect(() => {
    const savedWidth = localStorage.getItem('syncStatusDrawerWidth');
    if (savedWidth) {
      setSyncDrawerWidth(parseInt(savedWidth, 10));
    }
  }, []);

  // Update screen context when view changes
  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
    setScreenContext(prev => ({ ...prev, view }));
  };

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
      default:
        return children;
    }
  };

  // If DB check failed, block UI
  if (!dbConnected && !loading) {
    return <DatabaseErrorScreen onRetry={handleRetry} isRetrying={isRetrying} />;
  }

  // Show nothing or a loader until we know the DB status to prevent children from crashing
  if (loading && !dbConnected) {
    return null; // Or a centralized loading spinner
  }


  return (
    <DateSelectionProvider>
      <NotificationProvider>
        <ViewContext.Provider value={contextValue}>
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <ResponsiveAppBar
              currentView={currentView}
              onViewChange={handleViewChange}
            />
            <main
              style={{
                marginTop: '48px', // AppBar height
              }}
              className="main-content"
            >
              {renderView()}
            </main>
            {currentView !== 'chat' && <Footer />}
            <AIAssistant screenContext={screenContext} />
          </Box>
        </ViewContext.Provider>
      </NotificationProvider>
    </DateSelectionProvider>
  );
};

export default Layout;
