import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { InventoryTransaction, TransactionItem } from '../types/inventory';
import { enqueueSyncItem } from '../services/syncEngine';
import { notifyStockImport } from '../services/telegramService';
import { useUIStore } from '../store/useUIStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { BarcodeScannerModal } from '../components/common/BarcodeScannerModal';
import {
  ArrowDownToLine,
  Plus,
  Trash2,
  Scan,
  Printer,
  CheckCircle2,
  Package,
} from 'lucide-react';

export const StockImportPage: React.FC = () => {
  const { showToast } = useUIStore();
  const allProducts = useLiveQuery(() => db.products.toArray(), []) || [];
  const products = allProducts.filter((p) => !p.isDeleted);
  const transactions =
    useLiveQuery(
      () => db.inventoryTransactions.where('type').equals('import').reverse().toArray(),
      []
    ) || [];

  const [supplierName, setSupplierName] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantityInput, setQuantityInput] = useState(1);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [printedSlip, setPrintedSlip] = useState<InventoryTransaction | null>(null);

  // Generate unique Slip Code: PN-YYYYMMDD-XXXX
  const generateSlipCode = () => {
    const d = new Date();
    const dateStr = d.getFullYear().toString() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `PN-${dateStr}-${randomSuffix}`;
  };

  // Add Item to Slip
  const handleAddItem = (prodId?: string) => {
    const targetId = prodId || selectedProductId;
    const targetProd = products.find((p) => p.id === targetId);

    if (!targetProd) {
      showToast('Vui lòng chọn sản phẩm cần nhập!', 'warning');
      return;
    }

    const existingIndex = items.findIndex((i) => i.productId === targetProd.id);
    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity += quantityInput;
      updated[existingIndex].subtotal = updated[existingIndex].quantity * updated[existingIndex].price;
      setItems(updated);
    } else {
      setItems((prev) => [
        ...prev,
        {
          productId: targetProd.id,
          productName: targetProd.name,
          sku: targetProd.sku,
          unit: targetProd.unit,
          quantity: quantityInput,
          price: targetProd.importPrice,
          subtotal: quantityInput * targetProd.importPrice,
        },
      ]);
    }

    setSelectedProductId('');
    setQuantityInput(1);
  };

  // Barcode scanned -> auto add item
  const handleScanSuccess = (barcode: string) => {
    const found = products.find((p) => p.barcode === barcode || p.sku === barcode);
    if (found) {
      handleAddItem(found.id);
      showToast(`Đã tìm thấy sản phẩm: ${found.name}`, 'success');
    } else {
      showToast(`Không tìm thấy sản phẩm có mã: ${barcode}`, 'error');
    }
  };

  // Remove Item
  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate total
  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  // Submit Import Slip
  const handleSaveImportSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      showToast('Vui lòng thêm ít nhất 1 sản phẩm vào phiếu nhập!', 'warning');
      return;
    }

    const code = generateSlipCode();
    const now = new Date().toISOString();
    const slipId = `tx-imp-${Date.now()}`;

    const newTransaction: InventoryTransaction = {
      id: slipId,
      type: 'import',
      code,
      customerSupplierName: supplierName.trim() || 'Nhà cung cấp chưa xác định',
      items,
      totalAmount,
      note,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    try {
      // 1. Save Transaction to IndexedDB
      await db.inventoryTransactions.add(newTransaction);
      await enqueueSyncItem('inventoryTransactions', 'create', newTransaction.id, newTransaction);

      // 2. Automatically record a Cashbook Expense in Financial Transactions
      const finTransaction = {
        id: `fin-imp-${Date.now()}`,
        code: `PC-IMP-${code}`,
        type: 'expense' as const,
        category: 'purchase' as const,
        categoryName: 'Nhập hàng',
        amount: totalAmount,
        partyName: supplierName.trim() || 'Nhà cung cấp chưa xác định',
        paymentMethod: 'cash' as const,
        note: `Tự động nạp từ phiếu nhập kho ${code}. ${note || ''}`.trim(),
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending' as const,
        isDeleted: false,
      };
      await db.financialTransactions.add(finTransaction);
      await enqueueSyncItem('financialTransactions', 'create', finTransaction.id, finTransaction);

      // 3. Immediately update local inventory stock for each product
      for (const item of items) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod) {
          const newStock = prod.stockQuantity + item.quantity;
          await db.products.update(prod.id, {
            stockQuantity: newStock,
            syncStatus: 'pending',
            updatedAt: now,
          });
          await enqueueSyncItem('products', 'update', prod.id, { ...prod, stockQuantity: newStock });
        }
      }

      // 4. Trigger Telegram Notification
      notifyStockImport(newTransaction).catch((err) => console.error('Telegram import notification error:', err));

      showToast(`Tạo phiếu nhập ${code} thành công! Kho & Sổ Quỹ đã được cập nhật.`, 'success');
      setPrintedSlip(newTransaction);
      setItems([]);
      setSupplierName('');
      setNote('');
    } catch (err) {
      console.error('Error saving import slip:', err);
      showToast('Lỗi khi tạo phiếu nhập kho!', 'error');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const { storeName, phone, address } = useSettingsStore();

  const handlePrintSlip = () => {
    const originalTitle = document.title;
    document.title = '';
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ArrowDownToLine className="h-6 w-6 text-emerald-500" />
            Tạo Phiếu Nhập Kho (Offline-First)
          </h2>
          <p className="text-xs text-gray-500">
            Tồn kho local được cộng tức thì vào IndexedDB ngay cả khi không có mạng.
          </p>
        </div>

        <button
          onClick={() => setIsScannerOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          <Scan className="h-4 w-4" />
          Quét Mã Vạch
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Form: Select & Add Items */}
        <div className="space-y-4 lg:col-span-2">
          {/* Add Product Selector Box */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Chọn Sản Phẩm Nhập</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="">-- Chọn sản phẩm từ danh mục local --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) - Tồn: {p.stockQuantity} {p.unit} | Giá nhập gốc: {formatCurrency(p.importPrice)}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(Number(e.target.value))}
                  placeholder="SL"
                  className="w-20 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-center font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <button
                  onClick={() => handleAddItem()}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition"
                >
                  <Plus className="h-4 w-4" />
                  Thêm Vào Đơn
                </button>
              </div>
            </div>
          </div>

          {/* Selected Items Table */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-600" />
                Danh Sách Hàng Nhập ({items.length} mặt hàng)
              </h3>
              {items.length > 0 && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Tổng SL: {items.reduce((s, i) => s + i.quantity, 0)} món
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-10 text-center text-xs font-medium text-gray-400 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
                🛒 Chưa có sản phẩm nào trong phiếu nhập. Chọn sản phẩm ở trên hoặc Quét mã vạch.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2.5">Sản phẩm</th>
                      <th className="px-3 py-2.5 text-center">Số lượng</th>
                      <th className="px-3 py-2.5 text-right">Đơn giá nhập (VNĐ)</th>
                      <th className="px-3 py-2.5 text-right">Thành tiền</th>
                      <th className="px-3 py-2.5 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-gray-900 dark:text-white">{item.productName}</div>
                          <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{item.sku}</div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              const updated = [...items];
                              updated[idx].quantity = val;
                              updated[idx].subtotal = val * updated[idx].price;
                              setItems(updated);
                            }}
                            className="w-16 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-center text-xs font-bold dark:border-gray-700 dark:bg-gray-800"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium">
                          <input
                            type="number"
                            min={0}
                            value={item.price}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value));
                              const updated = [...items];
                              updated[idx].price = val;
                              updated[idx].subtotal = updated[idx].quantity * val;
                              setItems(updated);
                            }}
                            className="w-28 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1 text-right text-xs font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(item.subtotal)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            className="rounded-lg p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Supplier Info & Total Summary */}
        <div className="space-y-4">
          <form
            onSubmit={handleSaveImportSlip}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4"
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-white border-b pb-2 border-gray-200 dark:border-gray-800">
              Thông Tin Phiếu Nhập
            </h3>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Tên Nhà Cung Cấp
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="VD: Công ty TNHH Thiết bị ĐT"
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Ghi Chú</label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nhập ghi chú cho phiếu nhập..."
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800 space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Số loại hàng:</span>
                <span className="font-bold text-gray-900 dark:text-white">{items.length} mặt hàng</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span className="text-gray-900 dark:text-white">TỔNG TIỀN:</span>
                <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={items.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 disabled:opacity-50"
            >
              <CheckCircle2 className="h-5 w-5" />
              Lưu Phiếu & Cập Nhật Tồn Kho
            </button>
          </form>

          {/* History of Import Slips */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Lịch Sử Phiếu Nhập Gần Đây
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {transactions.slice(0, 5).map((t) => (
                <div
                  key={t.id}
                  onClick={() => setPrintedSlip(t)}
                  className="flex items-center justify-between rounded-xl border border-gray-100 p-2.5 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <div>
                    <div className="font-mono text-xs font-bold text-emerald-600">{t.code}</div>
                    <div className="text-[11px] text-gray-400">
                      {new Date(t.createdAt).toLocaleDateString('vi-VN')} • {t.customerSupplierName}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    {formatCurrency(t.totalAmount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Professional Import Slip Modal for Offline Printing */}
      {printedSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 my-6">
            
            {/* Printable Area Container */}
            <div className="printable-area bg-white text-gray-900 p-4 rounded-xl space-y-6">
              
              {/* Header Section */}
              <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-4 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-xl bg-slate-900 text-white font-black text-lg flex items-center justify-center">
                      {storeName ? storeName.charAt(0) : 'N'}
                    </div>
                    <h2 className="text-xl font-black uppercase text-slate-900 tracking-wide">{storeName}</h2>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{address}</p>
                  <p className="text-xs text-slate-600">SĐT / Zalo: <span className="font-semibold">{phone}</span></p>
                </div>

                <div className="text-left sm:text-right w-full sm:w-auto">
                  <h1 className="text-xl font-black uppercase text-emerald-700 tracking-wider">
                    PHIẾU NHẬP KHO
                  </h1>
                  <p className="text-xs font-mono font-bold text-slate-700 mt-1">Mã phiếu: {printedSlip.code}</p>
                  <p className="text-[11px] text-slate-500">
                    Thời gian: {new Date(printedSlip.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              {/* Supplier Info Box */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-500">Nhà cung cấp / Đối tác:</span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{printedSlip.customerSupplierName || 'Nhà cung cấp'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Loại giao dịch:</span>
                  <p className="font-semibold text-emerald-700 mt-0.5">Nhập bổ sung tồn kho local</p>
                </div>
                {printedSlip.note && (
                  <div className="sm:col-span-2 border-t border-slate-200 pt-2 mt-1">
                    <span className="text-slate-500">Ghi chú phiếu nhập:</span>
                    <p className="font-medium text-slate-800 italic">{printedSlip.note}</p>
                  </div>
                )}
              </div>

              {/* Product Details Table */}
              <div className="overflow-hidden rounded-xl border border-slate-300">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase text-[11px]">
                      <th className="py-2.5 px-3 w-10 text-center">STT</th>
                      <th className="py-2.5 px-3">TÊN SẢN PHẨM</th>
                      <th className="py-2.5 px-3 w-16 text-center">ĐVT</th>
                      <th className="py-2.5 px-3 w-16 text-center">SL</th>
                      <th className="py-2.5 px-3 text-right">ĐƠN GIÁ NHẬP</th>
                      <th className="py-2.5 px-3 text-right">THÀNH TIỀN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {printedSlip.items.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="py-2.5 px-3 text-center font-medium text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {item.productName}
                          <div className="text-[10px] font-mono text-slate-400 font-normal">{item.sku}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center">{item.unit || 'Cái'}</td>
                        <td className="py-2.5 px-3 text-center font-bold">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-right">{formatCurrency(item.price)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Section */}
              <div className="flex flex-col sm:flex-row justify-between items-end gap-4 pt-2">
                <div className="text-xs text-slate-500 space-y-1">
                  <p>• Phiếu nhập có hiệu lực lưu trữ local IndexedDB lập tức</p>
                  <p>• Vui lòng người nhận kiểm đếm kỹ số lượng khi nhập kho</p>
                </div>

                <div className="w-full sm:w-64 space-y-1.5 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="flex justify-between">
                    <span>Cộng tiền hàng nhập:</span>
                    <span className="font-semibold">{formatCurrency(printedSlip.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 pt-2 text-sm font-black text-emerald-700">
                    <span>TỔNG GIÁ TRỊ NHẬP:</span>
                    <span>{formatCurrency(printedSlip.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures Area */}
              <div className="grid grid-cols-2 text-center text-xs pt-8 pb-4">
                <div>
                  <p className="font-bold text-slate-900 uppercase">NGƯỜI GIAO HÀNG</p>
                  <p className="text-[10px] text-slate-400 italic">(Ký, ghi rõ họ tên)</p>
                  <div className="h-16"></div>
                </div>
                <div>
                  <p className="font-bold text-slate-900 uppercase">THỦ KHO NHẬP</p>
                  <p className="text-[10px] text-slate-400 italic">(Ký, ghi rõ họ tên)</p>
                  <div className="h-16"></div>
                </div>
              </div>

              <div className="text-center border-t border-dashed border-slate-300 pt-3">
                <p className="text-[11px] font-medium text-slate-600 italic">
                  ✨ Phiếu nhập kho lưu trữ hệ thống {storeName} ✨
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800 no-print">
              <button
                onClick={() => setPrintedSlip(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
              >
                Đóng
              </button>
              <button
                onClick={handlePrintSlip}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 transition"
              >
                <Printer className="h-4 w-4" />
                In Phiếu Nhập Chuyên Nghiệp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
