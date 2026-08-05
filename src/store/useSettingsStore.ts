import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoreSettings } from '../types/inventory';

interface SettingsState extends StoreSettings {
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  resetSettings: () => void;
}

const defaultSettings: StoreSettings = {
  storeName: 'Kho Hàng Minh Trí (Demo)',
  phone: '0988 123 456',
  address: '123 Đường Nguyễn Trãi, Quận 1, TP. Hồ Chí Minh',
  invoiceHeader: 'HÓA ĐƠN GIAO HÀNG / BÁN LẺ',
  defaultMinStock: 5,
  supabaseUrl: 'https://wcmzdmmbthyzhtbgxlxo.supabase.co',
  supabaseAnonKey: 'sb_publishable_C3drsw7pOu7rtRgtbp_c5w_cHhhvS0d',
  autoSyncInterval: 30, // 30 seconds default
  wifiOnlySync: false,
  theme: 'dark',
  telegramEnabled: true,
  telegramBotToken: '8936192297:AAHd37OR6Pm_oDkqNmqBPYrtZs6LQLJvx-g',
  telegramChatId: '8093505246',
  notifyStockImport: true,
  notifyStockExport: true,
  notifyLowStock: true,
  notifyFinancial: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: 'kho_offline_settings_v1',
    }
  )
);
