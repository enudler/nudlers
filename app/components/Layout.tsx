import React, { useState, createContext, useContext } from "react";
import ResponsiveAppBar from "./menu";
import { NotificationProvider } from "./NotificationContext";
import MonthlySummary from "./MonthlySummary";
import BudgetDashboard from "./BudgetDashboard";
import AIAssistant from "./AIAssistant";

type ViewType = 'dashboard' | 'summary' | 'budget';

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
}

const ViewContext = createContext<ViewContextType>({
  currentView: 'summary',
  setCurrentView: () => {},
  screenContext: { view: 'summary' },
  setScreenContext: () => {},
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

  // Update screen context when view changes
  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
    setScreenContext(prev => ({ ...prev, view }));
  };

  const renderView = () => {
    switch (currentView) {
      case 'summary':
        return <MonthlySummary />;
      case 'budget':
        return <BudgetDashboard />;
      default:
        return children;
    }
  };

  return (
    <NotificationProvider>
      <ViewContext.Provider value={{ currentView, setCurrentView: handleViewChange, screenContext, setScreenContext }}>
        <div>
          <ResponsiveAppBar 
            currentView={currentView} 
            onViewChange={handleViewChange} 
          />
          <main>
            {renderView()}
          </main>
          <AIAssistant screenContext={screenContext} />
        </div>
      </ViewContext.Provider>
    </NotificationProvider>
  );
};

export default Layout;
