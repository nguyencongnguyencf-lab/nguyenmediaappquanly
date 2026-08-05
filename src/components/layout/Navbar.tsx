import React from 'react';
import { Wifi, WifiOff, RefreshCw, Moon, Sun, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useNetworkStore } from '../../store/useNetworkStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useUIStore';
import { performFullSync } from '../../services/syncEngine';

export const Navbar: React.FC = () => {
  const { isOnline, isSyncing, pendingCount, conflictCount, lastSyncTime } = useNetworkStore();
  const { storeName, theme, updateSettings } = useSettingsStore();
  const { showToast } = useUIStore();

  const handleSyncClick = async () => {
    showToast('Đang khởi chạy đồng bộ...', 'info');
    const result = await performFullSync();
    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: nextTheme });
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const formatLastSync = (timeStr: string | null) => {
    if (!timeStr) return 'Chưa đồng bộ';
    const date = new Date(timeStr);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur-md dark:border-gray-800 dark:bg-gray-900/90 sm:px-6 no-print">
      {/* Brand & Store Name */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 font-bold text-white shadow-md shadow-emerald-500/20">
          <span className="text-xl">K</span>
        </div>
        <div>
          <h1 className="text-base font-bold leading-tight text-gray-900 dark:text-white sm:text-lg">
            KhoOffline
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px] sm:max-w-xs">
            {storeName}
          </p>
        </div>
      </div>

      {/* Center Status Indicators */}
      <div className="hidden md:flex items-center gap-4">
        {/* Network status */}
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border ${
            isOnline
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                isOnline ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            ></span>
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isOnline ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            ></span>
          </span>
          {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700">
          {conflictCount > 0 ? (
            <span className="flex items-center gap-1.5 text-amber-500 font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" />
              {conflictCount} Xung đột
            </span>
          ) : pendingCount > 0 ? (
            <span className="flex items-center gap-1.5 text-blue-500 font-semibold">
              <Clock className="h-3.5 w-3.5 animate-spin" />
              {pendingCount} Chờ sync
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-500 font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Đã đồng bộ
            </span>
          )}
          <span className="text-gray-400 dark:text-gray-500">|</span>
          <span className="text-gray-500 dark:text-gray-400">
            {formatLastSync(lastSyncTime)}
          </span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Sync Now Button */}
        <button
          onClick={handleSyncClick}
          disabled={isSyncing}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
          title="Đồng bộ dữ liệu ngay lập tức"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {isSyncing ? 'Đang sync...' : 'Đồng bộ ngay'}
          </span>
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 transition hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-700" />
          )}
        </button>
      </div>
    </header>
  );
};
