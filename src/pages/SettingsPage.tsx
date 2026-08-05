import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettingsStore } from '../store/useSettingsStore';
import { useUIStore } from '../store/useUIStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { db } from '../db/db';
import { CategoryManager } from '../components/settings/CategoryManager';
import { SyncHistoryPage } from './SyncHistoryPage';
import { sendTestNotification } from '../services/telegramService';
import {
  Settings,
  Store,
  Server,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  CheckCircle2,
  Wifi,
  AlertTriangle,
  ShieldAlert,
  RotateCcw,
  FolderTree,
  Database,
  History,
  Send,
  Bell,
  Eye,
  EyeOff,
  MessageSquare,
  HelpCircle,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const settings = useSettingsStore();
  const { showToast, settingsSubTab, setSettingsSubTab } = useUIStore();
  const { isOnline, pendingCount, conflictCount } = useNetworkStore();

  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const activeCategoriesCount = categories.filter((c) => !c.isDeleted).length;

  const [form, setForm] = useState({
    storeName: settings.storeName,
    phone: settings.phone,
    address: settings.address,
    invoiceHeader: settings.invoiceHeader,
    defaultMinStock: settings.defaultMinStock,
    supabaseUrl: settings.supabaseUrl,
    supabaseAnonKey: settings.supabaseAnonKey,
    autoSyncInterval: settings.autoSyncInterval,
    wifiOnlySync: settings.wifiOnlySync,
    telegramEnabled: settings.telegramEnabled ?? false,
    telegramBotToken: settings.telegramBotToken || '',
    telegramChatId: settings.telegramChatId || '',
    notifyStockImport: settings.notifyStockImport ?? true,
    notifyStockExport: settings.notifyStockExport ?? true,
    notifyLowStock: settings.notifyLowStock ?? true,
    notifyFinancial: settings.notifyFinancial ?? true,
  });

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);

  const handleFactoryResetAllData = async () => {
    try {
      await db.products.clear();
      await db.categories.clear();
      await db.inventoryTransactions.clear();
      await db.syncQueue.clear();
      await db.syncLogs.clear();
      await db.conflicts.clear();
      showToast('Đã xóa sạch toàn bộ dữ liệu hệ thống về số 0!', 'success');
      setIsResetModalOpen(false);
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (err) {
      console.error('Reset error:', err);
      showToast('Có lỗi xảy ra khi xóa dữ liệu!', 'error');
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    settings.updateSettings(form);
    showToast('Đã lưu cấu hình cài đặt thành công!', 'success');
  };

  const handleTestTelegram = async () => {
    if (!form.telegramBotToken.trim() || !form.telegramChatId.trim()) {
      showToast('Vui lòng nhập đầy đủ Bot Token và Chat ID trước khi kiểm tra!', 'warning');
      return;
    }

    setIsTestingTelegram(true);
    try {
      const res = await sendTestNotification(form.telegramBotToken, form.telegramChatId);
      if (res.success) {
        showToast('🎉 Gửi tin nhắn thử nghiệm Telegram thành công! Vui lòng kiểm tra ứng dụng Telegram.', 'success');
      } else {
        showToast(`❌ Lỗi gửi tin nhắn Telegram: ${res.message}`, 'error');
      }
    } catch (err: any) {
      showToast(`❌ Không thể gửi tin nhắn: ${err.message || 'Lỗi kết nối mạng'}`, 'error');
    } finally {
      setIsTestingTelegram(false);
    }
  };

  // Backup local database to JSON
  const handleExportBackup = async () => {
    try {
      const products = await db.products.toArray();
      const categories = await db.categories.toArray();
      const transactions = await db.inventoryTransactions.toArray();
      const queue = await db.syncQueue.toArray();

      const backupData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        products,
        categories,
        inventoryTransactions: transactions,
        syncQueue: queue,
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `kho_offline_backup_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('Đã sao lưu dữ liệu ra file JSON thành công!', 'success');
    } catch (err) {
      console.error('Backup error:', err);
      showToast('Lỗi khi sao lưu dữ liệu!', 'error');
    }
  };

  // Restore local database from JSON file
  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.products && json.categories) {
          await db.products.clear();
          await db.categories.clear();
          await db.inventoryTransactions.clear();

          await db.products.bulkAdd(json.products);
          await db.categories.bulkAdd(json.categories);
          if (json.inventoryTransactions) {
            await db.inventoryTransactions.bulkAdd(json.inventoryTransactions);
          }

          showToast('Đã khôi phục dữ liệu từ file backup thành công!', 'success');
          window.location.reload();
        } else {
          showToast('File backup JSON không đúng cấu trúc!', 'error');
        }
      } catch (err) {
        showToast('Lỗi khi đọc file backup!', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="h-6 w-6 text-gray-500" />
          Cài Đặt Hệ Thống & Quản Lý
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Quản lý danh mục sản phẩm, theo dõi lịch sử đồng bộ, cấu hình thông tin cửa hàng và máy chủ đồng bộ.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto gap-2">
        <button
          onClick={() => setSettingsSubTab('categories')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            settingsSubTab === 'categories'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <FolderTree className="h-4 w-4" />
          Danh Mục Sản Phẩm
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {activeCategoriesCount}
          </span>
        </button>

        <button
          onClick={() => setSettingsSubTab('synchistory')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            settingsSubTab === 'synchistory'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <RefreshCw className="h-4 w-4 text-blue-500" />
          Lịch Sử Đồng Bộ
          {conflictCount > 0 ? (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
              {conflictCount} Xung đột
            </span>
          ) : pendingCount > 0 ? (
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-extrabold text-white">
              {pendingCount} Chờ sync
            </span>
          ) : null}
        </button>

        <button
          onClick={() => setSettingsSubTab('store')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            settingsSubTab === 'store'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Store className="h-4 w-4" />
          Thông Tin Cửa Hàng
        </button>

        <button
          onClick={() => setSettingsSubTab('sync')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            settingsSubTab === 'sync'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Server className="h-4 w-4" />
          Đồng Bộ Remote & Server
        </button>

        <button
          onClick={() => setSettingsSubTab('telegram')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            settingsSubTab === 'telegram'
              ? 'border-blue-500 text-blue-500 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Send className="h-4 w-4 text-blue-500" />
          Thông Báo Telegram
          {form.telegramEnabled && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          )}
        </button>

        <button
          onClick={() => setSettingsSubTab('backup')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            settingsSubTab === 'backup'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Database className="h-4 w-4" />
          Sao Lưu & Reset Dữ Liệu
        </button>
      </div>

      {/* Tab Content 1: Category Management */}
      {settingsSubTab === 'categories' && <CategoryManager />}

      {/* Tab Content 2: Sync History */}
      {settingsSubTab === 'synchistory' && <SyncHistoryPage />}

      {/* Tab Content 3: Store Information */}
      {settingsSubTab === 'store' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-200 dark:border-gray-800">
              <Store className="h-5 w-5 text-emerald-500" />
              Thông Tin Cửa Hàng (Dùng cho in hóa đơn & phiếu kho)
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Tên Cửa Hàng / Kho *
                </label>
                <input
                  type="text"
                  required
                  value={form.storeName}
                  onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Số Điện Thoại
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Địa Chỉ Cửa Hàng
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Tiêu Đề Hóa Đơn Bán Hàng
                </label>
                <input
                  type="text"
                  value={form.invoiceHeader}
                  onChange={(e) => setForm({ ...form, invoiceHeader: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Ngưỡng Cảnh Báo Tồn Kho Mặc Định
                </label>
                <input
                  type="number"
                  value={form.defaultMinStock}
                  onChange={(e) => setForm({ ...form, defaultMinStock: Number(e.target.value) })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-500"
          >
            <CheckCircle2 className="h-5 w-5" />
            Lưu Cấu Hình Cửa Hàng
          </button>
        </form>
      )}

      {/* Tab Content 4: Sync & Server Connection */}
      {settingsSubTab === 'sync' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-200 dark:border-gray-800">
              <Server className="h-5 w-5 text-blue-500" />
              Cấu Hình Kết Nối Supabase (Đồng bộ 2 chiều Remote)
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  value={form.supabaseUrl}
                  onChange={(e) => setForm({ ...form, supabaseUrl: e.target.value })}
                  placeholder="https://xyz.supabase.co"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Supabase Anon Key
                </label>
                <input
                  type="password"
                  value={form.supabaseAnonKey}
                  onChange={(e) => setForm({ ...form, supabaseAnonKey: e.target.value })}
                  placeholder="eyJhbGciOi..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-200 dark:border-gray-800">
              <RefreshCw className="h-5 w-5 text-purple-500" />
              Cài Đặt Đồng Bộ Tự Động
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Tần Suất Tự Động Đồng Bộ (Auto-Sync Interval)
                </label>
                <select
                  value={form.autoSyncInterval}
                  onChange={(e) => setForm({ ...form, autoSyncInterval: Number(e.target.value) })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value={30}>Mỗi 30 giây (Khuyên dùng)</option>
                  <option value={60}>Mỗi 1 phút</option>
                  <option value={300}>Mỗi 5 phút</option>
                  <option value={0}>Thủ công (Chỉ sync khi bấm nút)</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <input
                  type="checkbox"
                  id="wifiOnly"
                  checked={form.wifiOnlySync}
                  onChange={(e) => setForm({ ...form, wifiOnlySync: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="wifiOnly" className="text-sm font-semibold text-gray-800 dark:text-gray-200 cursor-pointer flex items-center gap-1.5">
                  <Wifi className="h-4 w-4 text-emerald-500" />
                  Chỉ đồng bộ khi kết nối Wi-Fi (Tiết kiệm data di động)
                </label>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-500"
          >
            <CheckCircle2 className="h-5 w-5" />
            Lưu Cấu Hình Đồng Bộ
          </button>
        </form>
      )}

      {/* Tab Content 4: Telegram Bot Notifications */}
      {settingsSubTab === 'telegram' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm dark:border-blue-900/50 dark:bg-gray-900 space-y-5">
            <div className="flex items-center justify-between border-b pb-4 border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Cấu Hình Thông Báo Telegram Bot
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Tự động nhận tin nhắn cảnh báo tồn kho, nhập xuất kho & thu chi thời gian thực qua Telegram
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.telegramEnabled}
                  onChange={(e) => setForm({ ...form, telegramEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                <span className="ml-2.5 text-xs font-extrabold text-gray-800 dark:text-gray-200">
                  {form.telegramEnabled ? 'Đang bật' : 'Đang tắt'}
                </span>
              </label>
            </div>

            {/* Telegram Bot Token & Chat ID Inputs */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Telegram Bot Token *
                </label>
                <div className="relative">
                  <input
                    type={showBotToken ? 'text' : 'password'}
                    placeholder="Ví dụ: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    value={form.telegramBotToken}
                    onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 pr-10 pl-3.5 py-2.5 text-xs font-mono text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken(!showBotToken)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Token nhận từ @BotFather trên Telegram
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Telegram Chat ID / Group ID *
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: 123456789 hoặc -100987654321"
                  value={form.telegramChatId}
                  onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-xs font-mono text-gray-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  ID của tài khoản cá nhân hoặc nhóm Telegram nhận thông báo
                </p>
              </div>
            </div>

            {/* Notification Event Selectors */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <h4 className="text-xs font-extrabold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
                Chọn các loại sự kiện gửi thông báo:
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifyStockImport}
                    onChange={(e) => setForm({ ...form, notifyStockImport: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      📥 Đơn / Phiếu Nhập Kho
                    </span>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Gửi tin khi vừa tạo phiếu nhập hàng mới
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifyStockExport}
                    onChange={(e) => setForm({ ...form, notifyStockExport: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      📤 Đơn / Phiếu Xuất Kho (Bán Hàng)
                    </span>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Gửi tin khi xuất bán đơn hàng thành công
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifyLowStock}
                    onChange={(e) => setForm({ ...form, notifyLowStock: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      🚨 Cảnh Báo Tồn Kho Thấp
                    </span>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Cảnh báo lập tức khi hàng hóa tụt dưới định mức tối thiểu
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.notifyFinancial}
                    onChange={(e) => setForm({ ...form, notifyFinancial: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      💰 Phát Sinh Thu / Chi Sổ Quỹ
                    </span>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Thông báo khi ghi nhận phiếu thu, chi hoặc trả nợ
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Actions Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-500 transition"
              >
                <CheckCircle2 className="h-4 w-4" />
                Lưu Cấu Hình Telegram
              </button>

              <button
                type="button"
                disabled={isTestingTelegram}
                onClick={handleTestTelegram}
                className="flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 transition disabled:opacity-50"
              >
                {isTestingTelegram ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                    Đang gửi tin thử nghiệm...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Gửi Tin Nhắn Kiểm Tra
                  </>
                )}
              </button>
            </div>
          </div>

          {/* User Guide Box */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-5 dark:border-gray-800 dark:bg-gray-900/70 space-y-3">
            <h4 className="text-xs font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-blue-500" />
              Hướng Dẫn 3 Bước Tạo Telegram Bot & Lấy Chat ID:
            </h4>

            <div className="space-y-2.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              <div className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">1</span>
                <p>
                  <b>Tạo Bot:</b> Tìm kiếm <b>@BotFather</b> trên ứng dụng Telegram ➔ Gõ <code>/newbot</code> ➔ Đặt tên cho Bot ➔ Copy đoạn <b>HTTP API Token</b> dán vào ô bên trên.
                </p>
              </div>

              <div className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">2</span>
                <p>
                  <b>Lấy Chat ID:</b> Tìm kiếm <b>@userinfobot</b> ➔ Nhấn <b>Start</b> để xem ID cá nhân. <i>(Nếu muốn gửi vào nhóm: Thêm Bot vào nhóm Telegram của bạn ➔ Cấp quyền Admin/Gửi tin nhắn ➔ Lấy ID của nhóm).</i>
                </p>
              </div>

              <div className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">3</span>
                <p>
                  <b>Kiểm tra:</b> Mở đoạn chat với Bot của bạn vừa tạo trên Telegram ➔ Nhấn <b>Start</b> ➔ Rồi quay lại đây nhấn nút <b>"Gửi Tin Nhắn Kiểm Tra"</b> ở trên.
                </p>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Tab Content 5: Backup & Factory Reset */}
      {settingsSubTab === 'backup' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-200 dark:border-gray-800">
              <Download className="h-5 w-5 text-amber-500" />
              Sao Lưu & Khôi Phục Dữ Liệu Local
            </h3>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportBackup}
                className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-gray-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <Download className="h-4 w-4" />
                Xuất File Backup (JSON)
              </button>

              <label className="flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 cursor-pointer">
                <Upload className="h-4 w-4 text-blue-500" />
                Khôi Phục Từ File Backup JSON
                <input type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40 space-y-4">
            <div className="flex items-center justify-between border-b border-rose-200 pb-3 dark:border-rose-900">
              <h3 className="text-base font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                Vùng Nguy Hiểm: Xóa Sạch Tất Cả Dữ Liệu Trong Hệ Thống Về 0
              </h3>
              <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-white tracking-wider">
                Factory Reset
              </span>
            </div>

            <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
              Chức năng này sẽ **xóa vĩnh viễn toàn bộ dữ liệu** bao gồm: Tất cả Sản phẩm, Danh mục, Phiếu Nhập kho, Phiếu Xuất kho, Hàng đợi đồng bộ và Nhật ký trên hệ thống local. Hệ thống sẽ được reset trắng hoàn toàn về 0.
            </p>

            <button
              onClick={() => {
                setConfirmText('');
                setIsResetModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-rose-700 transition"
            >
              <Trash2 className="h-4 w-4" />
              Xóa Sạch Tất Cả Dữ Liệu (Về Số 0)
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Resetting All Data */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-rose-200 dark:border-rose-900 space-y-5">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-950">
                <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Xác Nhận Xóa Sạch Dữ Liệu Về 0
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Hành động này không thể hoàn tác!</p>
              </div>
            </div>

            <div className="rounded-xl bg-rose-50 p-3.5 text-xs text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 space-y-1.5">
              <p className="font-bold">• Tất cả Sản phẩm & Tồn kho sẽ bị xóa sạch</p>
              <p className="font-bold">• Tất cả Danh mục & Lịch sử Giao dịch sẽ về 0</p>
              <p className="font-bold">• Hàng đợi đồng bộ SyncQueue sẽ bị xóa trống</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                Nhập từ <span className="font-mono font-extrabold text-rose-600 dark:text-rose-400">XOADULIEU</span> bên dưới để xác nhận:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Gõ XOADULIEU..."
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm font-mono font-bold text-gray-900 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={confirmText.trim() !== 'XOADULIEU'}
                onClick={handleFactoryResetAllData}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="h-4 w-4" />
                Xác Nhận Xóa Tất Cả Về 0
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
