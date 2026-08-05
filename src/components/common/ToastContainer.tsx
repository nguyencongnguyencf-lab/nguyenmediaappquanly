import React from 'react';
import { useUIStore } from '../../store/useUIStore';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-full sm:bottom-6 sm:right-6">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className={`flex items-center justify-between gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-md transition-all animate-bounce-short ${
              isSuccess
                ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100 dark:bg-emerald-950/90'
                : isError
                ? 'border-rose-500/30 bg-rose-950/90 text-rose-100 dark:bg-rose-950/90'
                : isWarning
                ? 'border-amber-500/30 bg-amber-950/90 text-amber-100 dark:bg-amber-950/90'
                : 'border-blue-500/30 bg-slate-900/90 text-slate-100 dark:bg-slate-900/90'
            }`}
          >
            <div className="flex items-center gap-3 text-sm font-medium">
              {isSuccess && <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />}
              {isError && <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0" />}
              {isWarning && <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />}
              {!isSuccess && !isError && !isWarning && <Info className="h-5 w-5 text-blue-400 flex-shrink-0" />}
              <span>{toast.message}</span>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="rounded-lg p-1 hover:bg-white/10 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
