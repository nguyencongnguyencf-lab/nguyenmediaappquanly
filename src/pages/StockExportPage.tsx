import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { InventoryTransaction, TransactionItem, DebtRecord } from '../types/inventory';
import { enqueueSyncItem } from '../services/syncEngine';
import { notifyStockExport, type LowStockItem } from '../services/telegramService';
import { useUIStore } from '../store/useUIStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { BarcodeScannerModal } from '../components/common/BarcodeScannerModal';
import {
  ArrowUpFromLine,
  Plus,
  Trash2,
  Scan,
  Printer,
  CheckCircle2,
  AlertTriangle,
  History,
  Search,
  FileText,
  Eye,
  Tag,
  Gift,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';

export const StockExportPage: React.FC = () => {
  const { showToast } = useUIStore();
  const { storeName, phone, address, invoiceHeader } = useSettingsStore();

  const allProducts = useLiveQuery(() => db.products.toArray(), []) || [];
  const products = allProducts.filter((p) => !p.isDeleted);
  const transactions =
    useLiveQuery(
      () => db.inventoryTransactions.where('type').equals('export').reverse().toArray(),
      []
    ) || [];

  const [customerName, setCustomerName] = useState('');
  const [customerTier, setCustomerTier] = useState<'retail' | 'wholesale' | 'vip'>('retail');
  const [selectedPromoId, setSelectedPromoId] = useState('');
  const [note, setNote] = useState('');
  const [paymentMode, setPaymentMode] = useState<'full' | 'debt' | 'partial'>('full');
  const [paidAmountInput, setPaidAmountInput] = useState<number>(0);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantityInput, setQuantityInput] = useState(1);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [printedInvoice, setPrintedInvoice] = useState<InventoryTransaction | null>(null);
  const [historySearch, setHistorySearch] = useState('');

  const customerTierPrices = useLiveQuery(() => db.customerTierPrices.toArray(), []) || [];
  const allPromotions = useLiveQuery(() => db.promotions.toArray(), []) || [];
  const promotions = allPromotions.filter((p) => p.isActive && !p.isDeleted);

  const filteredRecentTransactions = transactions.filter((t) => {
    if (!historySearch.trim()) return true;
    const query = historySearch.toLowerCase();
    return (
      t.code.toLowerCase().includes(query) ||
      (t.customerSupplierName && t.customerSupplierName.toLowerCase().includes(query))
    );
  });

  // Generate unique Slip Code: PX-YYYYMMDD-XXXX
  const generateSlipCode = () => {
    const d = new Date();
    const dateStr =
      d.getFullYear().toString() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `PX-${dateStr}-${randomSuffix}`;
  };

  // Add Item with Stock Limit Check
  const handleAddItem = (prodId?: string) => {
    const targetId = prodId || selectedProductId;
    const targetProd = products.find((p) => p.id === targetId);

    if (!targetProd) {
      showToast('Vui lòng chọn sản phẩm xuất kho!', 'warning');
      return;
    }

    const existingIndex = items.findIndex((i) => i.productId === targetProd.id);
    const currentQtyInCart = existingIndex >= 0 ? items[existingIndex].quantity : 0;
    const requestedQty = currentQtyInCart + quantityInput;

    // LOCAL STOCK VALIDATION!
    if (requestedQty > targetProd.stockQuantity) {
      showToast(
        `Cảnh báo! Không đủ tồn kho local. Tồn hiện tại: ${targetProd.stockQuantity} ${targetProd.unit}, Yêu cầu xuất: ${requestedQty}`,
        'error'
      );
      return;
    }

    // Calculate price based on Customer Tier
    const tier = customerTierPrices.find((t) => t.productId === targetProd.id);
    let unitPrice = targetProd.sellingPrice;
    if (customerTier === 'wholesale') {
      unitPrice = tier?.wholesalePrice || Math.round(targetProd.sellingPrice * 0.9);
    } else if (customerTier === 'vip') {
      unitPrice = tier?.vipPrice || Math.round(targetProd.sellingPrice * 0.85);
    } else if (tier) {
      unitPrice = tier.retailPrice;
    }

    if (existingIndex >= 0) {
      const updated = [...items];
      updated[existingIndex].quantity = requestedQty;
      updated[existingIndex].price = unitPrice;
      updated[existingIndex].subtotal = requestedQty * unitPrice;
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
          price: unitPrice,
          subtotal: quantityInput * unitPrice,
        },
      ]);
    }

    setSelectedProductId('');
    setQuantityInput(1);
  };

  // Barcode scan callback
  const handleScanSuccess = (barcode: string) => {
    const found = products.find((p) => p.barcode === barcode || p.sku === barcode);
    if (found) {
      handleAddItem(found.id);
      showToast(`Quét thành công sản phẩm: ${found.name}`, 'success');
    } else {
      showToast(`Không tìm thấy sản phẩm có mã: ${barcode}`, 'error');
    }
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  // Active promotions filtering by date
  const validPromotions = promotions.filter((p) => {
    const nowStr = new Date().toISOString();
    if (p.startDate && p.startDate > nowStr) return false;
    if (p.endDate && p.endDate < nowStr) return false;
    return true;
  });

  const activePromo = validPromotions.find((p) => p.id === selectedPromoId);

  let discountAmount = 0;
  let promoGiftMessage = '';

  if (activePromo && subtotalAmount > 0) {
    if (!activePromo.minOrderValue || subtotalAmount >= activePromo.minOrderValue) {
      if (activePromo.type === 'percentage') {
        if (activePromo.applyType === 'all') {
          discountAmount = Math.round((subtotalAmount * activePromo.discountValue) / 100);
        } else if (activePromo.applyType === 'category') {
          const eligibleSubtotal = items
            .filter((item) => {
              const p = products.find((prod) => prod.id === item.productId);
              return p?.categoryId === activePromo.targetId;
            })
            .reduce((sum, item) => sum + item.subtotal, 0);
          discountAmount = Math.round((eligibleSubtotal * activePromo.discountValue) / 100);
        } else if (activePromo.applyType === 'product') {
          const eligibleSubtotal = items
            .filter((item) => item.productId === activePromo.targetId)
            .reduce((sum, item) => sum + item.subtotal, 0);
          discountAmount = Math.round((eligibleSubtotal * activePromo.discountValue) / 100);
        }
      } else if (activePromo.type === 'fixed_amount') {
        discountAmount = Math.min(subtotalAmount, activePromo.discountValue);
      } else if (activePromo.type === 'buy_x_get_y') {
        const buyQty = activePromo.buyQuantity || 1;
        const totalEligibleQty = items.reduce((sum, item) => {
          if (activePromo.applyType === 'all') return sum + item.quantity;
          if (activePromo.applyType === 'product' && item.productId === activePromo.targetId) return sum + item.quantity;
          if (activePromo.applyType === 'category') {
            const p = products.find((prod) => prod.id === item.productId);
            return p?.categoryId === activePromo.targetId ? sum + item.quantity : sum;
          }
          return sum;
        }, 0);

        if (totalEligibleQty >= buyQty) {
          const multiplier = Math.floor(totalEligibleQty / buyQty);
          const freeQty = (activePromo.getQuantity || 1) * multiplier;
          promoGiftMessage = `Tặng ${freeQty} ${activePromo.giftProductName || 'quà đính kèm'}`;
        }
      }
    }
  }

  const totalAmount = Math.max(0, subtotalAmount - discountAmount);

  // Submit Export Slip & Subtract Stock
  const handleSaveExportSlip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      showToast('Vui lòng chọn sản phẩm vào đơn hàng!', 'warning');
      return;
    }

    // Double check stock limit before commit
    for (const item of items) {
      const prod = products.find((p) => p.id === item.productId);
      if (!prod || prod.stockQuantity < item.quantity) {
        showToast(`Không thể xuất kho! Sản phẩm ${item.productName} vượt quá tồn kho local.`, 'error');
        return;
      }
    }

    const code = generateSlipCode();
    const now = new Date().toISOString();
    const slipId = `tx-exp-${Date.now()}`;

    const newTransaction: InventoryTransaction = {
      id: slipId,
      type: 'export',
      code,
      customerSupplierName: customerName.trim() || 'Khách vãng lai',
      items,
      totalAmount,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
      promotionId: activePromo ? activePromo.id : undefined,
      promotionName: activePromo
        ? `${activePromo.name}${promoGiftMessage ? ` (${promoGiftMessage})` : ''}`
        : undefined,
      note: `${note || ''}${promoGiftMessage ? ` [Quà tặng: ${promoGiftMessage}]` : ''}`.trim(),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    try {
      // Calculate actual paid and remaining debt amount
      let actualPaid = totalAmount;
      let debtAmount = 0;

      if (paymentMode === 'debt') {
        actualPaid = 0;
        debtAmount = totalAmount;
      } else if (paymentMode === 'partial') {
        actualPaid = Math.min(totalAmount, Math.max(0, Number(paidAmountInput)));
        debtAmount = Math.max(0, totalAmount - actualPaid);
      }

      // 1. Add Inventory Transaction
      await db.inventoryTransactions.add(newTransaction);
      await enqueueSyncItem('inventoryTransactions', 'create', newTransaction.id, newTransaction);

      // 2. Automatically record Cashbook Income if money was paid
      if (actualPaid > 0) {
        const finTransaction = {
          id: `fin-exp-${Date.now()}`,
          code: `PT-EXP-${code}`,
          type: 'income' as const,
          category: 'sale' as const,
          categoryName: 'Bán hàng',
          amount: actualPaid,
          partyName: customerName.trim() || 'Khách vãng lai',
          paymentMethod: 'cash' as const,
          note: `Tự động nạp từ phiếu xuất kho ${code} (${paymentMode === 'partial' ? 'Thanh toán 1 phần' : 'Thanh toán đủ'}). ${activePromo ? `[KM: ${activePromo.name}] ` : ''}${note || ''}`.trim(),
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending' as const,
          isDeleted: false,
        };
        await db.financialTransactions.add(finTransaction);
        await enqueueSyncItem('financialTransactions', 'create', finTransaction.id, finTransaction);
      }

      // 3. Create or Update Debt Record if debt exists
      if (debtAmount > 0) {
        const targetPartyName = customerName.trim() || 'Khách nợ vãng lai';
        const existingDebt = await db.debts.where('partyName').equalsIgnoreCase(targetPartyName).first();

        if (existingDebt) {
          const updatedTotal = Number(existingDebt.totalDebt || 0) + debtAmount;
          const updatedPaid = Number(existingDebt.paidAmount || 0) + actualPaid;
          const updatedRemaining = Math.max(0, updatedTotal - updatedPaid);
          const updatedStatus = updatedRemaining === 0 ? 'paid' : (updatedPaid > 0 ? 'partial' : 'unpaid');
          const historyEntry = {
            id: `pmt-${Date.now()}`,
            amount: actualPaid,
            paymentMethod: 'cash' as const,
            note: `Ghi nhận nợ mới từ đơn xuất kho ${code}`,
            createdAt: now,
            receiptCode: code,
          };
          const updatedDebt: DebtRecord = {
            ...existingDebt,
            totalDebt: updatedTotal,
            paidAmount: updatedPaid,
            remainingDebt: updatedRemaining,
            status: updatedStatus,
            history: [...(existingDebt.history || []), historyEntry],
            updatedAt: now,
          };
          await db.debts.put(updatedDebt);
          await enqueueSyncItem('debts', 'update', updatedDebt.id, updatedDebt);
        } else {
          const newDebt: DebtRecord = {
            id: `debt-${Date.now()}`,
            partyName: targetPartyName,
            partyType: 'customer',
            totalDebt: totalAmount,
            paidAmount: actualPaid,
            remainingDebt: debtAmount,
            transactionCode: code,
            status: debtAmount === 0 ? 'paid' : (actualPaid > 0 ? 'partial' : 'unpaid'),
            history: actualPaid > 0 ? [{
              id: `pmt-${Date.now()}`,
              amount: actualPaid,
              paymentMethod: 'cash' as const,
              note: `Thanh toán 1 phần đơn xuất ${code}`,
              createdAt: now,
              receiptCode: code,
            }] : [],
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
          };
          await db.debts.add(newDebt);
          await enqueueSyncItem('debts', 'create', newDebt.id, newDebt);
        }
      }

      // 4. Subtract Stock in IndexedDB & check low stock threshold
      const lowStockProducts: LowStockItem[] = [];
      for (const item of items) {
        const prod = products.find((p) => p.id === item.productId)!;
        if (prod) {
          const newStock = prod.stockQuantity - item.quantity;
          await db.products.update(prod.id, {
            stockQuantity: newStock,
            syncStatus: 'pending',
            updatedAt: now,
          });
          await enqueueSyncItem('products', 'update', prod.id, { ...prod, stockQuantity: newStock });

          if (prod.minStockAlert > 0 && newStock <= prod.minStockAlert) {
            lowStockProducts.push({
              name: prod.name,
              sku: prod.sku,
              stockQuantity: newStock,
              minStockAlert: prod.minStockAlert,
              unit: prod.unit,
            });
          }
        }
      }

      // 5. Trigger Telegram Notification
      notifyStockExport(newTransaction, lowStockProducts).catch((err) =>
        console.error('Telegram export notification error:', err)
      );

      showToast(`Xuất kho / Bán hàng thành công! Đã tự động cập nhật Kho, Sổ Quỹ & Công Nợ.`, 'success');
      setPrintedInvoice(newTransaction);
      setItems([]);
      setCustomerName('');
      setNote('');
      setPaymentMode('full');
      setPaidAmountInput(0);
    } catch (err) {
      console.error('Error saving export slip:', err);
      showToast('Có lỗi xảy ra khi tạo phiếu xuất!', 'error');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  const handlePrintInvoice = () => {
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
            <ArrowUpFromLine className="h-6 w-6 text-purple-500" />
            Tạo Phiếu Xuất Kho / Bán Hàng (Offline)
          </h2>
          <p className="text-xs text-gray-500">
            Tự động trừ tồn kho local tức thì. In hóa đơn không cần kết nối mạng.
          </p>
        </div>

        <button
          onClick={() => setIsScannerOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500"
        >
          <Scan className="h-4 w-4" />
          Quét Mã Vạch
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Form */}
        <div className="space-y-4 lg:col-span-2">
          {/* Add Product Selector Box */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Chọn Sản Phẩm Xuất</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="flex-1 rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              >
                <option value="">-- Chọn sản phẩm bán / xuất kho --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.stockQuantity <= 0}>
                    {p.name} ({p.sku}) - {p.stockQuantity <= 0 ? '❌ HẾT HÀNG' : `Tồn: ${p.stockQuantity} ${p.unit}`} | Giá bán: {formatCurrency(p.sellingPrice)}
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
                  className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-500 transition"
                >
                  <Plus className="h-4 w-4" />
                  Thêm Đơn
                </button>
              </div>
            </div>
          </div>

          {/* Selected Items Table */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-purple-600" />
                Chi Tiết Đơn Hàng Xuất Kho ({items.length} mặt hàng)
              </h3>
              {items.length > 0 && (
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                  Tổng SL: {items.reduce((s, i) => s + i.quantity, 0)} món
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-10 text-center text-xs font-medium text-gray-400 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
                🛍️ Chưa có sản phẩm trong giỏ hàng bán. Chọn sản phẩm ở trên hoặc Quét mã vạch.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2.5">Sản phẩm</th>
                      <th className="px-3 py-2.5 text-center">Số lượng</th>
                      <th className="px-3 py-2.5 text-right">Đơn giá bán (VNĐ)</th>
                      <th className="px-3 py-2.5 text-right">Thành tiền</th>
                      <th className="px-3 py-2.5 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-3 py-2.5">
                          <div className="font-bold text-gray-900 dark:text-white">{item.productName}</div>
                          <div className="font-mono text-xs text-purple-600 dark:text-purple-400 font-semibold">{item.sku}</div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, Number(e.target.value));
                              const prod = products.find((p) => p.id === item.productId);
                              if (prod && val > prod.stockQuantity) {
                                showToast(`Vượt quá tồn kho local (${prod.stockQuantity})`, 'warning');
                                return;
                              }
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
                        <td className="px-3 py-2.5 text-right font-bold text-purple-600 dark:text-purple-400">
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

        {/* Right Panel */}
        <div className="space-y-4">
          <form
            onSubmit={handleSaveExportSlip}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4"
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-white border-b pb-2 border-gray-200 dark:border-gray-800">
              Thông Tin Khách Hàng / Hóa Đơn
            </h3>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Tên Khách Hàng / Đối Tác
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="VD: Anh Minh (Khách lẻ)"
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-purple-700 dark:text-purple-300 mb-1">
                Nhóm Khách Hàng (Tự Động Áp Bảng Giá)
              </label>
              <select
                value={customerTier}
                onChange={(e) => setCustomerTier(e.target.value as any)}
                className="w-full rounded-xl border border-purple-300 bg-purple-50 px-3.5 py-2 text-sm font-bold text-purple-900 dark:border-purple-800 dark:bg-purple-950 dark:text-white"
              >
                <option value="retail">🛒 Khách Bán Lẻ (Giá niêm yết chuẩn)</option>
                <option value="wholesale">📦 Khách Bán Buôn / Sỉ (Chiết khấu sỉ)</option>
                <option value="vip">⭐ Khách VIP (Chiết khấu VIP)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-amber-500" />
                Chương Trình Khuyến Mãi Áp Dụng
              </label>
              <select
                value={selectedPromoId}
                onChange={(e) => setSelectedPromoId(e.target.value)}
                className="w-full rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-sm font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
              >
                <option value="">-- Không áp dụng khuyến mãi --</option>
                {validPromotions.map((p) => (
                  <option key={p.id} value={p.id}>
                    🎁 {p.name} (
                    {p.type === 'percentage'
                      ? `Giảm ${p.discountValue}%`
                      : p.type === 'fixed_amount'
                      ? `Giảm ${formatCurrency(p.discountValue)}`
                      : p.type === 'buy_x_get_y'
                      ? `Mua ${p.buyQuantity} tặng ${p.getQuantity} ${p.giftProductName || 'quà'}`
                      : 'Combo'}
                    )
                  </option>
                ))}
              </select>
              {validPromotions.length === 0 && (
                <p className="text-[11px] text-gray-400 italic mt-1">Không có khuyến mãi nào đang chạy</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">
                Hình Thức Thanh Toán & Công Nợ
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as any)}
                className="w-full rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-2 text-sm font-bold text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
              >
                <option value="full">💵 Thanh toán đủ (100% Tiền mặt / CK)</option>
                <option value="debt">📝 Ghi nợ 100% (Cho khách nợ toàn bộ)</option>
                <option value="partial">⚖️ Thanh toán 1 phần (Cộng nợ số còn lại)</option>
              </select>
            </div>

            {paymentMode === 'partial' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Số Tiền Khách Trả Trước (VNĐ)
                </label>
                <input
                  type="number"
                  min={0}
                  max={totalAmount}
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(Number(e.target.value))}
                  placeholder="Nhập số tiền trả trước..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm font-bold text-emerald-700 dark:border-gray-700 dark:bg-gray-800 dark:text-emerald-400"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Ghi Chú</label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú hóa đơn..."
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800 space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Số loại hàng:</span>
                <span className="font-bold text-gray-900 dark:text-white">{items.length} mặt hàng</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Tổng tiền hàng gốc:</span>
                <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(subtotalAmount)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <span>Khuyến mãi ({activePromo?.name}):</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}

              {promoGiftMessage && (
                <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 p-2 rounded-lg border border-amber-200 dark:border-amber-900">
                  <Gift className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Quà tặng kèm: {promoGiftMessage}</span>
                </div>
              )}

              <div className="flex justify-between text-base font-bold border-t pt-2 border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-white">TỔNG KHÁCH THANH TOÁN:</span>
                <span className="text-purple-600 dark:text-purple-400">{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={items.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-sm font-bold text-white shadow-lg hover:bg-purple-500 disabled:opacity-50"
            >
              <CheckCircle2 className="h-5 w-5" />
              Tạo Hóa Đơn & Trừ Tồn Kho
            </button>
          </form>

          {/* Rich History Widget: Đơn Xuất Kho Gần Đây */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <History className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                Đơn Xuất Kho Gần Đây
              </h3>
              <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                {transactions.length} đơn
              </span>
            </div>

            {/* Quick Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Tìm theo mã phiếu hoặc tên khách..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-8 pr-3 py-1.5 text-xs text-gray-900 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* Transaction List */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {filteredRecentTransactions.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400 italic">
                  {historySearch ? 'Không tìm thấy đơn xuất phù hợp!' : 'Chưa có đơn xuất kho nào.'}
                </div>
              ) : (
                filteredRecentTransactions.slice(0, 10).map((t) => (
                  <div
                    key={t.id}
                    className="group flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 p-3 transition hover:border-purple-200 hover:bg-purple-50/40 dark:border-gray-800 dark:bg-gray-800/40 dark:hover:border-purple-800 dark:hover:bg-purple-950/30"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400">
                          {t.code}
                        </span>
                        <span className="rounded-md bg-gray-200 px-1.5 py-0.2 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {t.items?.length || 0} món
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-gray-900 dark:text-white">
                        {t.customerSupplierName || 'Khách vãng lai'}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(t.createdAt).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-xs font-black text-purple-700 dark:text-purple-300">
                        {formatCurrency(t.totalAmount)}
                      </span>
                      <button
                        onClick={() => setPrintedInvoice(t)}
                        className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-purple-700 shadow-xs border border-gray-200 hover:bg-purple-600 hover:text-white transition dark:bg-gray-800 dark:border-gray-700 dark:text-purple-300 dark:hover:bg-purple-600 dark:hover:text-white"
                        title="Xem & In lại hóa đơn"
                      >
                        <Printer className="h-3 w-3" />
                        In Hóa Đơn
                      </button>
                    </div>
                  </div>
                ))
              )}
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

      {/* Professional Invoice Modal for Offline Printing */}
      {printedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 my-6">
            
            {/* Printable Area Container */}
            <div className="printable-area bg-white text-gray-900 p-4 rounded-xl space-y-4">
              
              {/* Header Section */}
              <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 pb-3 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-slate-900 text-white font-black text-base flex items-center justify-center">
                      {storeName ? storeName.charAt(0) : 'N'}
                    </div>
                    <h2 className="text-lg font-black uppercase text-slate-900 tracking-wide">{storeName}</h2>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{address}</p>
                  <p className="text-xs text-slate-600">SĐT / Zalo: <span className="font-semibold">{phone}</span></p>
                </div>

                <div className="text-left sm:text-right w-full sm:w-auto">
                  <h1 className="text-lg font-black uppercase text-purple-700 tracking-wider">
                    {invoiceHeader || 'HÓA ĐƠN BÁN LẺ'}
                  </h1>
                  <p className="text-xs font-mono font-bold text-slate-700 mt-0.5">Mã phiếu: {printedInvoice.code}</p>
                  <p className="text-[11px] text-slate-500">
                    Thời gian: {new Date(printedInvoice.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              {/* Customer & Order Info Box */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500">Khách hàng / Đối tác:</span>
                  <p className="font-bold text-slate-900 text-xs mt-0.5">{printedInvoice.customerSupplierName || 'Khách vãng lai'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Hình thức thanh toán:</span>
                  <p className="font-semibold text-slate-900 text-xs mt-0.5">Tiền mặt / Chuyển khoản</p>
                </div>
                {printedInvoice.note && (
                  <div className="sm:col-span-2 border-t border-slate-200 pt-1.5 mt-0.5">
                    <span className="text-slate-500">Ghi chú đơn hàng:</span>
                    <p className="font-medium text-slate-800 italic">{printedInvoice.note}</p>
                  </div>
                )}
              </div>

              {/* Product Details Table */}
              <div className="overflow-hidden rounded-xl border border-slate-300">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase text-[11px]">
                      <th className="py-2 px-3 w-10 text-center">STT</th>
                      <th className="py-2 px-3">TÊN SẢN PHẨM</th>
                      <th className="py-2 px-3 w-16 text-center">ĐVT</th>
                      <th className="py-2 px-3 w-16 text-center">SL</th>
                      <th className="py-2 px-3 text-right">ĐƠN GIÁ</th>
                      <th className="py-2 px-3 text-right">THÀNH TIỀN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {printedInvoice.items.map((item, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="py-2 px-3 text-center font-medium text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {item.productName}
                          <div className="text-[10px] font-mono text-slate-400 font-normal">{item.sku}</div>
                        </td>
                        <td className="py-2 px-3 text-center">{item.unit || 'Cái'}</td>
                        <td className="py-2 px-3 text-center font-bold">{item.quantity}</td>
                        <td className="py-2 px-3 text-right">{formatCurrency(item.price)}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-900">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Section */}
              <div className="flex flex-col sm:flex-row justify-between items-end gap-3 pt-1">
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  <p>• Giá đã bao gồm thuế GTGT (nếu có)</p>
                  <p>• Vui lòng kiểm tra kỹ hàng hóa trước khi thanh toán</p>
                </div>

                <div className="w-full sm:w-72 space-y-1 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex justify-between">
                    <span>Cộng tiền hàng:</span>
                    <span className="font-semibold">
                      {formatCurrency(printedInvoice.items.reduce((s, i) => s + i.subtotal, 0))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Chiết khấu / Giảm giá:</span>
                    <span className="font-semibold text-emerald-700">
                      {printedInvoice.discountAmount ? `-${formatCurrency(printedInvoice.discountAmount)}` : '0 đ'}
                    </span>
                  </div>
                  {printedInvoice.promotionName && (
                    <div className="text-[10px] font-bold text-amber-700 italic text-right pt-0.5">
                      ({printedInvoice.promotionName})
                    </div>
                  )}
                  <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-black text-purple-700">
                    <span>TỔNG THANH TOÁN:</span>
                    <span>{formatCurrency(printedInvoice.totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Signatures Area */}
              <div className="grid grid-cols-2 text-center text-xs pt-4 pb-1">
                <div>
                  <p className="font-bold text-slate-900 uppercase">KHÁCH HÀNG</p>
                  <p className="text-[10px] text-slate-400 italic">(Ký và nhận đủ hàng)</p>
                  <div className="h-10"></div>
                </div>
                <div>
                  <p className="font-bold text-slate-900 uppercase">NGƯỜI LẬP HÓA ĐƠN</p>
                  <p className="text-[10px] text-slate-400 italic">(Ký, ghi rõ họ tên)</p>
                  <div className="h-10"></div>
                </div>
              </div>

              <div className="text-center border-t border-dashed border-slate-300 pt-2">
                <p className="text-[11px] font-medium text-slate-600 italic">
                  ✨ Cảm ơn Quý khách đã tin tưởng và mua sắm tại {storeName}! ✨
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800 no-print">
              <button
                onClick={() => setPrintedInvoice(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
              >
                Đóng
              </button>
              <button
                onClick={handlePrintInvoice}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-purple-500 transition"
              >
                <Printer className="h-4 w-4" />
                In Hóa Đơn Chuyên Nghiệp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
