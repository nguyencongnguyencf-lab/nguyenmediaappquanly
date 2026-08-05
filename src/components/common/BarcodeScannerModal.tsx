import React, { useState } from 'react';
import { Camera, X, Scan, Check } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScanSuccess(manualCode.trim());
      setManualCode('');
      onClose();
    }
  };

  const handleSimulateScan = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const sampleBarcodes = ['8938501234567', '8938501234568', '8938501234569', '8938501234574'];
      const randomCode = sampleBarcodes[Math.floor(Math.random() * sampleBarcodes.length)];
      setIsSimulating(false);
      onScanSuccess(randomCode);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5 text-emerald-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Quét mã vạch Barcode</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Viewfinder simulation */}
        <div className="my-6 relative flex flex-col items-center justify-center rounded-xl bg-gray-950 p-8 text-white overflow-hidden border-2 border-dashed border-emerald-500/50">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-transparent to-emerald-500/10 animate-pulse"></div>

          {/* Red scan line */}
          <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></div>

          <Camera className="h-12 w-12 text-emerald-400 mb-2 animate-bounce" />
          <p className="text-xs text-gray-400 text-center">
            {isSimulating ? 'Đang đọc camera mã vạch...' : 'Hướng camera vào mã vạch trên sản phẩm'}
          </p>

          <button
            onClick={handleSimulateScan}
            disabled={isSimulating}
            className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 shadow-md"
          >
            <Scan className="h-4 w-4" />
            {isSimulating ? 'Đang quét...' : 'Giả lập Quét Camera nhanh'}
          </button>
        </div>

        {/* Manual Input Form */}
        <form onSubmit={handleManualSubmit} className="space-y-3">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Hoặc nhập mã vạch bằng tay:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="VD: 8938501234567"
              className="flex-1 rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              <Check className="h-4 w-4" />
              Xác nhận
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
