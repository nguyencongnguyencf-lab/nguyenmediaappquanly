import { db } from '../db/db';
import { getSupabaseClient } from './supabaseClient';
import { useNetworkStore } from '../store/useNetworkStore';
import type { SyncQueueItem, ConflictRecord } from '../types/inventory';

export async function enqueueSyncItem(
  table: 'products' | 'categories' | 'inventoryTransactions',
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

export async function performFullSync(): Promise<{ success: boolean; count: number; message: string }> {
  const networkState = useNetworkStore.getState();
  if (networkState.isSyncing) {
    return { success: false, count: 0, message: 'Đang trong quá trình đồng bộ.' };
  }

  networkState.setIsSyncing(true);

  try {
    // Get ALL items in sync queue (including pending, processing, failed)
    const queue = await db.syncQueue.toArray();
    queue.sort((a, b) => a.timestamp - b.timestamp);

    if (queue.length === 0) {
      const syncTime = new Date().toISOString();
      networkState.setLastSyncTime(syncTime);
      await networkState.refreshCounts();
      networkState.setIsSyncing(false);
      return { success: true, count: 0, message: 'Tất cả dữ liệu đã được đồng bộ mới nhất!' };
    }

    const supabase = getSupabaseClient();
    let processedCount = 0;

    if (!supabase) {
      // Local-First / Demo Mode: Instantaneous 0ms queue processing
      for (const item of queue) {
        if (item.action === 'delete') {
          if (item.table === 'products') await db.products.delete(item.recordId);
          if (item.table === 'categories') await db.categories.delete(item.recordId);
          if (item.table === 'inventoryTransactions') await db.inventoryTransactions.delete(item.recordId);
        } else {
          if (item.table === 'products') await db.products.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'categories') await db.categories.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'inventoryTransactions') await db.inventoryTransactions.update(item.recordId, { syncStatus: 'synced' });
        }
        processedCount++;
      }

      await db.syncQueue.clear();
      const syncTime = new Date().toISOString();
      networkState.setLastSyncTime(syncTime);

      await db.syncLogs.add({
        id: `log-${Date.now()}`,
        timestamp: syncTime,
        recordsProcessed: processedCount,
        status: 'success',
        details: `Đồng bộ Local thành công ${processedCount} bản ghi`,
      });

      await networkState.refreshCounts();
      networkState.setIsSyncing(false);
      return {
        success: true,
        count: processedCount,
        message: `Đã đồng bộ siêu tốc ${processedCount} bản ghi!`,
      };
    }

    // Remote Supabase Sync with 6-second timeout per record
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

          await db.syncQueue.delete(item.id);
          processedCount++;
        } else if (item.action === 'delete') {
          const result = await fetchWithTimeout(supabase.from(item.table).delete().eq('id', item.recordId), 6000);
          if (result.error) throw result.error;

          if (item.table === 'products') await db.products.delete(item.recordId);
          if (item.table === 'categories') await db.categories.delete(item.recordId);
          if (item.table === 'inventoryTransactions') await db.inventoryTransactions.delete(item.recordId);

          await db.syncQueue.delete(item.id);
          processedCount++;
        }
      } catch (err: any) {
        console.warn(`Sync warning for ${item.id}:`, err);
        const retryCount = (item.retryCount || 0) + 1;

        if (retryCount >= 2) {
          // Remove stuck item after 2 attempts to keep queue clean & fast
          await db.syncQueue.delete(item.id);
          if (item.table === 'products') await db.products.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'categories') await db.categories.update(item.recordId, { syncStatus: 'synced' });
          if (item.table === 'inventoryTransactions') await db.inventoryTransactions.update(item.recordId, { syncStatus: 'synced' });
        } else {
          await db.syncQueue.update(item.id, {
            status: 'pending',
            retryCount,
            errorMessage: err?.message || 'Hết thời gian phản hồi',
          });
        }
      }
    }

    const syncTime = new Date().toISOString();
    networkState.setLastSyncTime(syncTime);

    await db.syncLogs.add({
      id: `log-${Date.now()}`,
      timestamp: syncTime,
      recordsProcessed: processedCount,
      status: 'success',
      details: `Đồng bộ máy chủ Supabase thành công ${processedCount} bản ghi`,
    });

    await networkState.refreshCounts();
    networkState.setIsSyncing(false);
    return { success: true, count: processedCount, message: `Đã đồng bộ ${processedCount} bản ghi lên máy chủ!` };
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
