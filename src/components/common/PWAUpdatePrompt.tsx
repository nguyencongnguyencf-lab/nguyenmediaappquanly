import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { updateSW } from '../../main';

export const PWAUpdatePrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Listen for custom service worker update events if registered
    const handleUpdate = () => setShowPrompt(true);
    window.addEventListener('swUpdated', handleUpdate);
    return () => window.removeEventListener('swUpdated', handleUpdate);
  }, []);

  if (!showPrompt) return null;

  const handleRefresh = async () => {
    try {
      if (typeof updateSW === 'function') {
        await updateSW(true);
      }
    } catch (e) {
      console.warn('Update SW error:', e);
    }
    window.location.reload();
  };

  return (
    <div className="fixed top-20 right-4 z-50 flex items-center justify-between gap-4 rounded-xl border border-emerald-500/40 bg-gray-900/95 p-4 text-white shadow-2xl backdrop-blur-md max-w-md w-full">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-5 w-5 text-emerald-400 animate-spin" />
        <div>
          <p className="text-sm font-semibold text-white">Có phiên bản cập nhật mới!</p>
          <p className="text-xs text-gray-400">Tải lại ứng dụng để áp dụng các cải tiến mới nhất.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleRefresh}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
        >
          Cập nhật
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="rounded-lg p-1 text-gray-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
