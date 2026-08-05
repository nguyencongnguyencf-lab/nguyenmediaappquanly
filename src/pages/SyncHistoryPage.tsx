import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { performFullSync, resolveConflictRecord } from '../services/syncEngine';
import { useNetworkStore } from '../store/useNetworkStore';
import { useUIStore } from '../store/useUIStore';
import {
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Database,
  History,
  Trash2,
  Check,
  Server,
  Smartphone,
} from 'lucide-react';

import type { SyncQueueItem } from '../types/inventory';

export const SyncHistoryPage: React.FC = () => {
  const { showToast } = useUIStore();
  const { isOnline, isSyncing, pendingCount, conflictCount, lastSyncTime } = useNetworkStore();

  const syncQueue = useLiveQuery(() => db.syncQueue.orderBy('timestamp').toArray(), []) || [];
  const syncLogs = useLiveQuery(() => db.syncLogs.reverse().toArray(), []) || [];
  const conflicts = useLiveQuery(() => db.conflicts.where('status').equals('unresolved').toArray(), []) || [];

  const products = useLiveQuery(() => db.products.toArray(), []) || [];
  const syncedCount = products.filter((p) => p.syncStatus === 'synced').length;

  const [activeTab, setActiveTab] = useState<'queue' | 'conflicts' | 'logs'>('queue');

  const handleForceSync = async () => {
    showToast('Đang thực hiện đồng bộ...', 'info');
    const result = await performFullSync();
    if (result.success) {
      showToast(result.message, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleResetQueue = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ hàng đợi sync chưa gửi?')) {
      await db.syncQueue.clear();
      await useNetworkStore.getState().refreshCounts();
      showToast('Đã xóa sạch hàng đợi đồng bộ.', 'info');
    }
  };

  const handleResolve = async (conflictId: string, choice: 'local' | 'remote') => {
    await resolveConflictRecord(conflictId, choice);
    showToast(`Đã chọn giữ phiên bản ${choice === 'local' ? 'Máy này (Local)' : 'Máy chủ (Remote)'}`, 'success');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <RefreshCw className="h-6 w-6 text-blue-500" />
            Lịch Sử & Quản Lý Đồng Bộ (Sync Engine)
          </h2>
          <p className="text-xs text-gray-500">
            Theo dõi Sync Queue, giải quyết xung đột dữ liệu và lịch sử truyền nhận.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetQueue}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <Trash2 className="h-4 w-4" />
            Reset Queue
          </button>
          <button
            onClick={handleForceSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
          </button>
        </div>
      </div>

      {/* 4 Summary Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Tổng bản ghi local</span>
            <Database className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{products.length}</p>
          <span className="text-[11px] text-gray-400">IndexedDB Storage</span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Đã đồng bộ</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-500">{syncedCount}</p>
          <span className="text-[11px] text-emerald-600">Trạng thái: Synced</span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Đang chờ Sync</span>
            <Clock className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-500">{pendingCount}</p>
          <span className="text-[11px] text-blue-600">Trong Sync Queue</span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Xung đột dữ liệu</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-500">{conflictCount}</p>
          <span className="text-[11px] text-amber-600">Cần giải quyết</span>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'queue'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400'
          }`}
        >
          <Clock className="h-4 w-4" />
          Hàng Đợi Sync ({syncQueue.length})
        </button>

        <button
          onClick={() => setActiveTab('conflicts')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'conflicts'
              ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Giải Quyết Xung Đột ({conflicts.length})
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'logs'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400'
          }`}
        >
          <History className="h-4 w-4" />
          Lịch Sử Đã Sync ({syncLogs.length})
        </button>
      </div>

      {/* Tab Content 1: Pending Sync Queue */}
      {activeTab === 'queue' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
            Danh Sách Các Thao Tác Chờ Đẩy Lên Máy Chủ (FIFO Queue)
          </h3>

          {syncQueue.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              ✅ Hàng đợi đồng bộ trống. Tất cả thay đổi local đã được đồng bộ 100%!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Bảng (Table)</th>
                    <th className="px-4 py-3">Hành động</th>
                    <th className="px-4 py-3">Record ID</th>
                    <th className="px-4 py-3">Thời gian lưu</th>
                    <th className="px-4 py-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {syncQueue.map((item: SyncQueueItem) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-600">{item.table}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${
                            item.action === 'create'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : item.action === 'update'
                              ? 'bg-blue-500/10 text-blue-600'
                              : 'bg-rose-500/10 text-rose-600'
                          }`}
                        >
                          {item.action.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.recordId}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(item.timestamp).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500">
                          <Clock className="h-3.5 w-3.5 animate-spin" />
                          Pending
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content 2: Manual Conflict Resolution UI */}
      {activeTab === 'conflicts' && (
        <div className="space-y-4">
          {conflicts.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-gray-900">
              🎉 Không có bản ghi nào bị tranh chấp / xung đột dữ liệu.
            </div>
          ) : (
            conflicts.map((cf) => (
              <div
                key={cf.id}
                className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-sm dark:bg-amber-950/10"
              >
                <div className="flex items-center justify-between pb-3 border-b border-amber-500/20">
                  <div className="flex items-center gap-2 text-amber-600 font-bold text-sm">
                    <AlertTriangle className="h-5 w-5" />
                    Xung đột tại bảng [{cf.table}] - Record ID: {cf.recordId}
                  </div>
                  <span className="text-xs text-gray-500">
                    Thời điểm phát hiện: {new Date(cf.timestamp).toLocaleString('vi-VN')}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                  {/* Local Data Box */}
                  <div className="rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-gray-900 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-600">
                      <Smartphone className="h-4 w-4" />
                      Dữ Liệu Local (Máy này)
                    </div>
                    <pre className="text-[11px] font-mono bg-gray-50 p-3 rounded-lg dark:bg-gray-800 overflow-x-auto text-gray-800 dark:text-gray-200">
                      {JSON.stringify(cf.localData, null, 2)}
                    </pre>
                    <button
                      onClick={() => handleResolve(cf.id, 'local')}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-xs font-bold text-white hover:bg-blue-500"
                    >
                      <Check className="h-4 w-4" />
                      Chọn Dữ Liệu Local
                    </button>
                  </div>

                  {/* Remote Data Box */}
                  <div className="rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-gray-900 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                      <Server className="h-4 w-4" />
                      Dữ Liệu Remote (Máy chủ Supabase)
                    </div>
                    <pre className="text-[11px] font-mono bg-gray-50 p-3 rounded-lg dark:bg-gray-800 overflow-x-auto text-gray-800 dark:text-gray-200">
                      {cf.remoteData ? JSON.stringify(cf.remoteData, null, 2) : 'Chưa có bản ghi remote'}
                    </pre>
                    <button
                      onClick={() => handleResolve(cf.id, 'remote')}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                    >
                      <Check className="h-4 w-4" />
                      Ghi Đè Bằng Remote
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content 3: Sync Timeline Logs */}
      {activeTab === 'logs' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
            Timeline Nhật Ký Đồng Bộ
          </h3>

          <div className="relative border-l border-gray-200 dark:border-gray-800 pl-6 space-y-6">
            {syncLogs.map((log) => (
              <div key={log.id} className="relative">
                <div className="absolute -left-[31px] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-emerald-600">
                      {new Date(log.timestamp).toLocaleString('vi-VN')}
                    </span>
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{log.details}</p>
                  <p className="text-xs text-gray-500">Số bản ghi xử lý: {log.recordsProcessed}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
