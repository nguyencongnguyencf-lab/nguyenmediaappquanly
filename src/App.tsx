import React, { useEffect } from 'react';
import { useUIStore } from './store/useUIStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useNetworkStore } from './store/useNetworkStore';
import { performFullSync, setupRealtimeSyncListener } from './services/syncEngine';

import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { ToastContainer } from './components/common/ToastContainer';
import { PWAUpdatePrompt } from './components/common/PWAUpdatePrompt';

import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { WarehouseManagementPage } from './pages/WarehouseManagementPage';
import { PromotionsAndPricingPage } from './pages/PromotionsAndPricingPage';
import { FinancialManagementPage } from './pages/FinancialManagementPage';
import { StockImportPage } from './pages/StockImportPage';
import { StockExportPage } from './pages/StockExportPage';
import { SyncHistoryPage } from './pages/SyncHistoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const { activeTab } = useUIStore();
  const { theme, autoSyncInterval } = useSettingsStore();
  const { setOnlineStatus, refreshCounts } = useNetworkStore();

  // Apply dark mode on initialization & theme change
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Setup Realtime Sync Broadcast Listener for instant multi-machine reset
  useEffect(() => {
    const unsubRealtime = setupRealtimeSyncListener();
    return () => {
      unsubRealtime();
    };
  }, []);

  // Setup online/offline event listeners & auto-sync interval
  useEffect(() => {
    const handleOnline = () => {
      setOnlineStatus(true);
      performFullSync();
    };

    const handleOffline = () => {
      setOnlineStatus(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    refreshCounts();

    // Perform immediate full sync on startup if online
    if (navigator.onLine) {
      performFullSync().catch((err) => console.warn('Startup sync error:', err));
    }

    // Auto-sync interval
    let intervalId: any = null;
    if (autoSyncInterval > 0) {
      intervalId = setInterval(() => {
        if (navigator.onLine) {
          performFullSync();
        }
      }, autoSyncInterval * 1000);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoSyncInterval]);

  const renderActivePage = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'products':
        return <ProductsPage />;
      case 'warehouse':
        return <WarehouseManagementPage />;
      case 'promotions':
        return <PromotionsAndPricingPage />;
      case 'financials':
        return <FinancialManagementPage />;
      case 'import':
        return <StockImportPage />;
      case 'export':
        return <StockExportPage />;
      case 'reports':
        return <ReportsPage />;
      case 'synchistory':
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 font-sans">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation (Desktop) */}
        <Sidebar />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 mb-16 md:mb-0">
          <div className="mx-auto max-w-7xl">
            {renderActivePage()}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      {/* Global Toast Notifications & PWA Update Prompt */}
      <ToastContainer />
      <PWAUpdatePrompt />
    </div>
  );
}

export default App;
