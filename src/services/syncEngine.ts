import { db } from '../db/db';
import { getSupabaseClient } from './supabaseClient';
import { useNetworkStore } from '../store/useNetworkStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useUIStore } from '../store/useUIStore';
import type { SyncQueueItem, ConflictRecord } from '../types/inventory';

export async function clearAllRemoteSupabaseData(): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, message: 'Chưa cấu hình kết nối Supabase URL và Anon Key.' };
  }

  const tables = ['products', 'categories', 'inventoryTransactions', 'financialTransactions', 'debts'];
  const errors: string[] = [];

  for (const table of tables) {
    try {
      const result = await fetchWithTimeout<{ error: any }>(
        supabase.from(table).delete().neq('id', '_wipe_all_sentinel_id_'),
        8000
      );
      if (result.error) {
        console.error(`Lỗi khi xóa bảng ${table} trên Supabase:`, result.error);
        errors.push(`${table}: ${result.error.message || 'Lỗi không xác định'}`);
      }
    } catch (err: any) {
      console.error(`Lỗi ngoại lệ khi xóa bảng ${table} trên Supabase:`, err);
      errors.push(`${table}: ${err.message || 'Lỗi kết nối'}`);
    }
  }

  const nowIso = new Date().toISOString();
  try {
    await fetchWithTimeout(
      supabase.from('system_settings').upsert({
        key: 'last_reset_at',
        value: nowIso,
        updatedAt: nowIso,
      }),
      6000
    );
  } catch (err) {
    console.warn('Không thể ghi nhận timestamp last_reset_at lên Supabase:', err);
  }

  if (errors.length > 0) {
    return { success: false, message: `Lỗi khi xóa một số bảng trên Supabase: ${errors.join(', ')}` };
  }

  return { success: true, message: 'Đã xóa hoàn toàn tất cả dữ liệu trên Supabase về số 0!' };
}

export async function broadcastSystemWipe(timestamp: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    const channel = supabase.channel('system_global_events');
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'SYSTEM_WIPE',
      payload: { timestamp },
    });
  } catch (err) {
    console.warn('Không thể gửi tín hiệu broadcast SYSTEM_WIPE:', err);
  }
}

export function setupRealtimeSyncListener(): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  try {
    const channel = supabase.channel('system_global_realtime_sync');

    channel
      .on('broadcast', { event: 'SYSTEM_WIPE' }, async (payload) => {
        console.warn('⚡ Đã nhận tín hiệu Realtime SYSTEM_WIPE từ Supabase!', payload);
        await db.clearAllData();
        if (payload?.payload?.timestamp) {
          useSettingsStore.getState().updateSettings({ lastResetAt: payload.payload.timestamp });
        }
        await useNetworkStore.getState().refreshCounts();
        useUIStore.getState().showToast('⚡ [Realtime] Tất cả dữ liệu hệ thống đã được xóa về 0 từ máy chủ!', 'warning');
      })
      .on('postgres_changes', { event: '*', schema: 'public' }, async (payload: any) => {
        const { table, eventType, new: newRow, old: oldRow } = payload;
        console.log(`⚡ [Realtime Multi-Device Sync] Event ${eventType} on table ${table}:`, payload);
        const validTables = ['products', 'categories', 'inventoryTransactions', 'financialTransactions', 'debts'];
        if (table && validTables.includes(table) && (db as any)[table]) {
          if (eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
              await (db as any)[table].delete(oldRow.id);
            }
          } else if (newRow && newRow.id) {
            await (db as any)[table].put({ ...newRow, syncStatus: 'synced' });
          }
          await useNetworkStore.getState().refreshCounts();
        }
      })
      .subscribe((status) => {
        console.log('⚡ Status kết nối Realtime Supabase:', status);
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // ignore cleanup warning
      }
    };
  } catch (err) {
    console.warn('Lỗi kết nối Realtime subscription:', err);
    return () => {};
  }
}

export async function wipeAllSystemDataViaRPC(): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  if (!supabase) {
    await db.clearAllData();
    useSettingsStore.getState().updateSettings({ lastResetAt: nowIso });
    await useNetworkStore.getState().refreshCounts();
    return {
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu local về 0 thành công (Chế độ chưa kết nối Supabase).',
    };
  }

  try {
    // 1. Call PostgreSQL RPC function truncate_all_business_data on Supabase (atomic TRUNCATE ... RESTART IDENTITY CASCADE)
    const result = await fetchWithTimeout<{ data: any; error: any }>(
      supabase.rpc('truncate_all_business_data'),
      10000
    );

    const { data, error } = result;

    if (error) {
      console.error('Lỗi khi gọi RPC truncate_all_business_data:', error);
      if (error.code === 'PGRST202' || error.message?.includes('function') || error.message?.includes('not found')) {
        console.warn('RPC truncate_all_business_data chưa tạo trên SQL Editor. Đang chạy cơ chế xóa từng bảng...');
        return await wipeAllSystemData();
      }
      return {
        success: false,
        message: `Lỗi kết nối RPC Supabase (${error.code || 'ERR'}): ${error.message || 'Lỗi hệ thống'}. Đã tự động ROLLBACK!`,
      };
    }

    if (data && data.success === false) {
      return {
        success: false,
        message: `Lỗi PostgreSQL trong RPC: ${data.message || 'Lỗi trong giao dịch'}. Đã tự động ROLLBACK!`,
      };
    }

    // 2. Clear local IndexedDB tables
    await db.clearAllData();

    // 3. Save lastResetAt timestamp to local settings store
    useSettingsStore.getState().updateSettings({ lastResetAt: nowIso });

    // 4. Reset network state counters & cache
    await useNetworkStore.getState().refreshCounts();

    // 5. Broadcast Realtime event to all active clients & exe instances
    await broadcastSystemWipe(nowIso);

    return {
      success: true,
      message: 'Đã xóa TOÀN BỘ dữ liệu trên Supabase (RESTART IDENTITY 1) & Local thành công và phát tín hiệu Realtime tới tất cả các máy!',
    };
  } catch (err: any) {
    console.error('Lỗi ngoại lệ khi gọi wipeAllSystemDataViaRPC:', err);
    return {
      success: false,
      message: `Lỗi kết nối máy chủ: ${err.message || 'Lỗi mạng'}. Đã tự động ROLLBACK toàn bộ!`,
    };
  }
}

export async function wipeAllSystemData(): Promise<{ success: boolean; message: string }> {
  const nowIso = new Date().toISOString();
  let supabaseMessage = '';

  const supabase = getSupabaseClient();
  if (supabase) {
    const remoteResult = await clearAllRemoteSupabaseData();
    supabaseMessage = remoteResult.message;
  }

  // 1. Clear local IndexedDB tables completely
  await db.clearAllData();

  // 2. Save lastResetAt timestamp to local settings store
  useSettingsStore.getState().updateSettings({ lastResetAt: nowIso });

  // 3. Reset network state counters
  await useNetworkStore.getState().refreshCounts();

  // 4. Broadcast Realtime event to all active clients & exe instances
  await broadcastSystemWipe(nowIso);

  return {
    success: true,
    message: supabase
      ? `Đã xóa sạch tất cả dữ liệu hệ thống (Local + Remote Supabase) về số 0! (${supabaseMessage})`
      : 'Đã xóa sạch tất cả dữ liệu Local về số 0!',
  };
}

export async function enqueueSyncItem(
  table: 'products' | 'categories' | 'inventoryTransactions' | 'financialTransactions' | 'debts',
  action: 'create' | 'update' | 'delete',
  recordId: string,
  data: any
) {
  const existing = await db.syncQueue.where('recordId').equals(recordId).first();
  const queueId = existing ? existing.id : `sq-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

  const item: SyncQueueItem = {
    id: queueId,
    table,
    action,
    recordId,
    data,
    timestamp: Date.now(),
    retryCount: existing ? existing.retryCount : 0,
    status: 'pending',
  };

  await db.syncQueue.put(item);

  // Update local record's syncStatus to pending
  if (action !== 'delete') {
    if (table === 'products') {
      await db.products.update(recordId, { syncStatus: 'pending', updatedAt: new Date().toISOString() });
    } else if (table === 'categories') {
      await db.categories.update(recordId, { syncStatus: 'pending', updatedAt: new Date().toISOString() });
    } else if (table === 'inventoryTransactions') {
      await db.inventoryTransactions.update(recordId, { syncStatus: 'pending', updatedAt: new Date().toISOString() });
    } else if (table === 'financialTransactions') {
      await db.financialTransactions.update(recordId, { syncStatus: 'pending', updatedAt: new Date().toISOString() });
    } else if (table === 'debts') {
      await db.debts.update(recordId, { syncStatus: 'pending', updatedAt: new Date().toISOString() });
    }
  }

  await useNetworkStore.getState().refreshCounts();

  // Trigger immediate sync in background if online
  if (navigator.onLine) {
    performFullSync().catch((err) => console.warn('Background sync error:', err));
  }
}

// Timeout helper to prevent Supabase network calls from hanging
function fetchWithTimeout<T>(builder: PromiseLike<T>, timeoutMs = 6000): Promise<T> {
  return Promise.race([
    Promise.resolve(builder),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Hết thời gian chờ kết nối máy chủ (Timeout 6s)')), timeoutMs)
    ),
  ]);
}

// Pull latest data from Supabase down into local IndexedDB
export async function pullFromSupabase(supabase: any): Promise<number> {
  let totalPulled = 0;
  const tables: Array<'categories' | 'products' | 'inventoryTransactions' | 'financialTransactions' | 'debts'> = [
    'categories',
    'products',
    'inventoryTransactions',
    'financialTransactions',
    'debts',
  ];

  for (const tableName of tables) {
    try {
      const result = await fetchWithTimeout<{ data: any[] | null; error: any }>(
        supabase.from(tableName).select('*'),
        8000
      );
      if (result.data && Array.isArray(result.data)) {
        const remoteData = result.data;
        const remoteIdMap = new Set(remoteData.map((item) => item.id));

        // 1. Put all remote records into local IndexedDB
        if (remoteData.length > 0) {
          await (db as any)[tableName].bulkPut(remoteData.map((r) => ({ ...r, syncStatus: 'synced' })));
          totalPulled += remoteData.length;
        }

        // 2. Clean up local records that were hard-deleted on Supabase (if synced and not pending in local queue)
        const localRecords = await (db as any)[tableName].toArray();
        const pendingQueue = await db.syncQueue.where('table').equals(tableName).toArray();
        const pendingIds = new Set(pendingQueue.map((q) => q.recordId));

        for (const localRec of localRecords) {
          if (localRec.id && !remoteIdMap.has(localRec.id) && !pendingIds.has(localRec.id)) {
            await (db as any)[tableName].delete(localRec.id);
          }
        }
      }
    } catch (err) {
      console.warn(`Pull warning for table ${tableName}:`, err);
    }
  }

  return totalPulled;
}

export async function performFullSync(): Promise<{ success: boolean; count: number; message: string }> {
  const networkState = useNetworkStore.getState();
  if (networkState.isSyncing) {
    return { success: false, count: 0, message: 'Đang trong quá trình đồng bộ.' };
  }

  networkState.setIsSyncing(true);

  try {
    const supabase = getSupabaseClient();

    // 1. If no Supabase configured (Local-First / Demo Mode)
    if (!supabase) {
      const queue = await db.syncQueue.toArray();
      let processedCount = 0;

      for (const item of queue) {
        if (item.action === 'delete') {
          if (item.table === 'products') await db.products.delete(item.recordId);
          if (item.table === 'categories') await db.categories.delete(item.recordId);
          if (item.table === 'inventoryTransactions') await db.inventoryTransactions.delete(item.recordId);
          if (item.table === 'financialTransactions') await db.financialTransactions.delete(item.recordId);
          if (item.table === 'debts') await db.debts.delete(item.recordId);
        } else {
          if (item.table === 'products') await db.products.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'categories') await db.categories.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'inventoryTransactions') await db.inventoryTransactions.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'financialTransactions') await db.financialTransactions.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'debts') await db.debts.update(item.recordId, { syncStatus: 'synced' });
        }
        processedCount++;
      }

      await db.syncQueue.clear();
      const syncTime = new Date().toISOString();
      networkState.setLastSyncTime(syncTime);
      await networkState.refreshCounts();
      networkState.setIsSyncing(false);

      return {
        success: true,
        count: processedCount,
        message: 'Tất cả dữ liệu local đã được cập nhật!',
      };
    }

    // 2. Remote Supabase Sync: Check Remote Reset Sentinel first!
    try {
      const resetRes = await fetchWithTimeout<{ data: any; error: any }>(
        supabase.from('system_settings').select('*').eq('key', 'last_reset_at').maybeSingle(),
        4000
      );

      if (resetRes.data && resetRes.data.value) {
        const remoteResetAt = resetRes.data.value;
        const localResetAt = useSettingsStore.getState().lastResetAt;

        if (!localResetAt || new Date(remoteResetAt).getTime() > new Date(localResetAt).getTime()) {
          console.warn('⚡ Remote system reset detected! Wiping local IndexedDB to match Supabase 0 state...');

          await db.clearAllData();
          useSettingsStore.getState().updateSettings({ lastResetAt: remoteResetAt });
          await networkState.refreshCounts();
          networkState.setIsSyncing(false);

          await db.syncLogs.add({
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            recordsProcessed: 0,
            status: 'success',
            details: 'Đã tự động xóa sạch dữ liệu local theo lệnh reset từ máy chủ/thiết bị khác.',
          });

          useUIStore.getState().showToast('⚡ Hệ thống đã nhận lệnh xóa tất cả dữ liệu từ thiết bị khác. Dữ liệu ứng dụng đã về 0!', 'warning');

          return {
            success: true,
            count: 0,
            message: 'Đã cập nhật xóa sạch dữ liệu về 0 theo máy chủ remote!',
          };
        }
      }
    } catch (err) {
      console.warn('Kiểm tra timestamp reset máy chủ:', err);
    }

    // 2. Remote Supabase Sync: PUSH local changes then PULL remote updates
    const queue = await db.syncQueue.toArray();
    queue.sort((a, b) => a.timestamp - b.timestamp);
    let processedCount = 0;

    // Phase 1: PUSH local queue items to Supabase
    for (const item of queue) {
      try {
        await db.syncQueue.update(item.id, { status: 'processing' });

        if (item.action === 'create' || item.action === 'update') {
          const payload = { ...item.data, syncStatus: 'synced', updatedAt: new Date().toISOString() };
          const result = await fetchWithTimeout(supabase.from(item.table).upsert(payload), 6000);
          if (result.error) throw result.error;

          if (item.table === 'products') await db.products.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'categories') await db.categories.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'inventoryTransactions') await db.inventoryTransactions.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'financialTransactions') await db.financialTransactions.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'debts') await db.debts.update(item.recordId, { syncStatus: 'synced' });

          await db.syncQueue.delete(item.id);
          processedCount++;
        } else if (item.action === 'delete') {
          const result = await fetchWithTimeout(supabase.from(item.table).delete().eq('id', item.recordId), 6000);
          if (result.error) throw result.error;

          if (item.table === 'products') await db.products.delete(item.recordId);
          if (item.table === 'categories') await db.categories.delete(item.recordId);
          if (item.table === 'inventoryTransactions') await db.inventoryTransactions.delete(item.recordId);
          if (item.table === 'financialTransactions') await db.financialTransactions.delete(item.recordId);
          if (item.table === 'debts') await db.debts.delete(item.recordId);

          await db.syncQueue.delete(item.id);
          processedCount++;
        }
      } catch (err: any) {
        console.warn(`Sync warning for ${item.id}:`, err);
        const retryCount = (item.retryCount || 0) + 1;

        if (retryCount >= 2) {
          await db.syncQueue.delete(item.id);
        } else {
          await db.syncQueue.update(item.id, {
            status: 'pending',
            retryCount,
            errorMessage: err?.message || 'Hết thời gian phản hồi',
          });
        }
      }
    }

    // Phase 2: PULL remote data from Supabase down into local IndexedDB
    const pulledCount = await pullFromSupabase(supabase);

    const syncTime = new Date().toISOString();
    networkState.setLastSyncTime(syncTime);

    await db.syncLogs.add({
      id: `log-${Date.now()}`,
      timestamp: syncTime,
      recordsProcessed: processedCount + pulledCount,
      status: 'success',
      details: `Đồng bộ 2 chiều thành công (Đẩy: ${processedCount}, Kéo về: ${pulledCount})`,
    });

    await networkState.refreshCounts();
    networkState.setIsSyncing(false);
    return {
      success: true,
      count: processedCount + pulledCount,
      message: `Đã đồng bộ 2 chiều thành công! (Đẩy: ${processedCount}, Tải về: ${pulledCount})`,
    };
  } catch (err: any) {
    console.error('Full sync error:', err);
    networkState.setIsSyncing(false);
    await networkState.refreshCounts();
    return { success: false, count: 0, message: `Lỗi đồng bộ: ${err?.message || 'Không thể kết nối'}` };
  } finally {
    networkState.setIsSyncing(false);
    await networkState.refreshCounts();
  }
}

export async function resolveConflictRecord(conflictId: string, choice: 'local' | 'remote') {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) return;

  if (choice === 'local') {
    // Keep local data & re-queue for sync
    await enqueueSyncItem(
      conflict.table as any,
      'update',
      conflict.recordId,
      conflict.localData
    );
    await db.conflicts.update(conflictId, { status: 'resolved_local' });
  } else {
    // Overwrite local data with remote data if available
    if (conflict.remoteData) {
      if (conflict.table === 'products') await db.products.put({ ...conflict.remoteData, syncStatus: 'synced' });
      if (conflict.table === 'categories') await db.categories.put({ ...conflict.remoteData, syncStatus: 'synced' });
    }
    await db.conflicts.update(conflictId, { status: 'resolved_remote' });
  }

  await useNetworkStore.getState().refreshCounts();
}
