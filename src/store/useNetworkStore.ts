import { create } from 'zustand';
import { db } from '../db/db';

interface NetworkState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  lastSyncTime: string | null;
  setOnlineStatus: (status: boolean) => void;
  setIsSyncing: (syncing: boolean) => void;
  setLastSyncTime: (time: string) => void;
  refreshCounts: () => Promise<void>;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingCount: 0,
  conflictCount: 0,
  lastSyncTime: localStorage.getItem('last_sync_time') || null,

  setOnlineStatus: (status) => set({ isOnline: status }),
  setIsSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSyncTime: (time) => {
    localStorage.setItem('last_sync_time', time);
    set({ lastSyncTime: time });
  },

  refreshCounts: async () => {
    try {
      const pending = await db.syncQueue.count();
      const conflicts = await db.conflicts.where('status').equals('unresolved').count();
      set({ pendingCount: pending, conflictCount: conflicts });
    } catch (err) {
      console.error('Error refreshing network counts:', err);
    }
  },
}));
