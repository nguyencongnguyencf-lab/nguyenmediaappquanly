import { create } from 'zustand';

export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

type SettingsSubTab = 'categories' | 'synchistory' | 'store' | 'sync' | 'backup' | 'telegram';

interface UIState {
  sidebarCollapsed: boolean;
  activeTab: string;
  settingsSubTab: SettingsSubTab;
  toasts: ToastNotification[];
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveTab: (tab: string, subTab?: SettingsSubTab) => void;
  setSettingsSubTab: (subTab: SettingsSubTab) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  activeTab: 'dashboard',
  settingsSubTab: 'categories',
  toasts: [],
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setActiveTab: (tab, subTab) =>
    set((state) => {
      if (tab === 'synchistory') {
        return { activeTab: 'settings', settingsSubTab: 'synchistory' };
      }
      return { activeTab: tab, settingsSubTab: subTab || state.settingsSubTab };
    }),
  setSettingsSubTab: (subTab) => set({ settingsSubTab: subTab }),
  showToast: (message, type = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 4);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

