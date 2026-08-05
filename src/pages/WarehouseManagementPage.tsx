import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  WarehouseLocation,
  ProductLot,
  StockAuditSheet,
  StockAuditItem,
} from '../types/inventory';
import { useUIStore } from '../store/useUIStore';
import { notifyLowStockAlert, type LowStockItem } from '../services/telegramService';
import {
  Layers,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Search,
  Clock,
  ClipboardList,
  ArrowUpDown,
  Box,
  Edit,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const WarehouseManagementPage: React.FC = () => {
  const { showToast } = useUIStore();

  const [activeSubTab, setActiveSubTab] = useState<'zones' | 'lots' | 'audits'>('zones');

  // IndexedDB Live Queries
  const allProducts = useLiveQuery(() => db.products.toArray(), []) || [];
  const products = allProducts.filter((p) => !p.isDeleted);
  const locations = useLiveQuery(() => db.locations.toArray(), []) || [];
  const productLots = useLiveQuery(() => db.productLots.toArray(), []) || [];
  const stockAudits = useLiveQuery(() => db.stockAudits.reverse().toArray(), []) || [];

  // State: Add Location Form
  const [locCode, setLocCode] = useState('');
  const [locName, setLocName] = useState('');
  const [locZone, setLocZone] = useState('Khu A');
  const [locCapacity, setLocCapacity] = useState(100);
  const [locDescription, setLocDescription] = useState('');

  // State: Add Product Lot Form
  const [lotProductId, setLotProductId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [lotQuantity, setLotQuantity] = useState(1);
  const [lotLocationId, setLotLocationId] = useState('');

  // State: Stock Audit Form
  const [auditNote, setAuditNote] = useState('');
  const [auditItems, setAuditItems] = useState<StockAuditItem[]>([]);
  const [auditSearch, setAuditSearch] = useState('');

  // Calculate Expiration Status helper
  const getExpirationStatus = (expDateStr: string) => {
    if (!expDateStr) return { label: 'Chưa có HSD', color: 'bg-gray-100 text-gray-600', code: 'none' };
    const exp = new Date(expDateStr).getTime();
    const now = new Date().getTime();
    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Đã quá hạn ${Math.abs(diffDays)} ngày`, color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-bold', code: 'expired' };
    } else if (diffDays <= 30) {
      return { label: `Còn ${diffDays} ngày (Sắp hết hạn)`, color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold', code: 'warning' };
    } else {
      return { label: `Còn ${diffDays} ngày (An toàn)`, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', code: 'safe' };
    }
  };

  // Handle Add Location
  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locCode.trim() || !locName.trim()) {
      showToast('Vui lòng nhập Mã vị trí và Tên kệ!', 'warning');
      return;
    }

    const newLoc: WarehouseLocation = {
      id: `loc-${Date.now()}`,
      code: locCode.trim().toUpperCase(),
      name: locName.trim(),
      zone: locZone.trim(),
      capacity: Number(locCapacity) || 100,
      description: locDescription.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.locations.add(newLoc);
    showToast(`Đã tạo vị trí ${newLoc.name} thành công!`, 'success');
    setLocCode('');
    setLocName('');
    setLocDescription('');
  };

  // Handle Delete Location
  const handleDeleteLocation = async (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa vị trí kệ "${name}"?`)) {
      await db.locations.delete(id);
      showToast(`Đã xóa vị trí ${name}`, 'info');
    }
  };

  // Handle Add Product Lot
  const handleAddLot = async (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find((p) => p.id === lotProductId);
    if (!product) {
      showToast('Vui lòng chọn Sản phẩm!', 'warning');
      return;
    }
    if (!lotNumber.trim() || !expirationDate) {
      showToast('Vui lòng nhập Số LOT và Ngày hết hạn (HSD)!', 'warning');
      return;
    }

    const selectedLoc = locations.find((l) => l.id === lotLocationId);

    const newLot: ProductLot = {
      id: `lot-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      lotNumber: lotNumber.trim().toUpperCase(),
      expirationDate,
      quantity: Number(lotQuantity) || 1,
      locationId: selectedLoc?.id,
      locationName: selectedLoc?.name || 'Chưa gán kệ',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.productLots.add(newLot);
    showToast(`Đã thêm Lô hàng ${newLot.lotNumber} thành công!`, 'success');
    setLotProductId('');
    setLotNumber('');
    setExpirationDate('');
    setLotQuantity(1);
  };

  // Handle Delete Lot
  const handleDeleteLot = async (id: string, lotNum: string) => {
    if (window.confirm(`Xóa lô hàng ${lotNum}?`)) {
      await db.productLots.delete(id);
      showToast(`Đã xóa lô hàng ${lotNum}`, 'info');
    }
  };

  // Start New Stock Audit
  const handleStartNewAudit = () => {
    const items: StockAuditItem[] = products.map((p) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      unit: p.unit || 'Cái',
      systemQuantity: p.stockQuantity || 0,
      actualQuantity: p.stockQuantity || 0,
      difference: 0,
    }));
    setAuditItems(items);
  };

  // Update Actual Quantity in Audit
  const handleActualQtyChange = (productId: string, actualQty: number) => {
    setAuditItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const qty = Math.max(0, actualQty);
          return {
            ...item,
            actualQuantity: qty,
            difference: qty - item.systemQuantity,
          };
        }
        return item;
      })
    );
  };

  // Save Audit Sheet & Adjust Inventory
  const handleApplyAuditAdjustment = async () => {
    if (auditItems.length === 0) {
      showToast('Chưa có danh sách kiểm kê!', 'warning');
      return;
    }

    const hasDifferences = auditItems.some((i) => i.difference !== 0);

    const auditCode = `KK-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const auditSheet: StockAuditSheet = {
      id: `audit-${Date.now()}`,
      code: auditCode,
      createdByName: 'Người quản lý kho',
      status: 'adjusted',
      note: auditNote || 'Kiểm kê định kỳ & Cân bằng tồn kho',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: auditItems,
    };

    // Save Audit Record
    await db.stockAudits.add(auditSheet);

    // Apply adjustments to db.products and track low stock items
    const lowStockItems: LowStockItem[] = [];
    for (const item of auditItems) {
      if (item.difference !== 0) {
        await db.products.update(item.productId, {
          stockQuantity: item.actualQuantity,
          updatedAt: new Date().toISOString(),
        });

        const prod = products.find((p) => p.id === item.productId);
        if (prod && prod.minStockAlert > 0 && item.actualQuantity <= prod.minStockAlert) {
          lowStockItems.push({
            name: prod.name,
            sku: prod.sku,
            stockQuantity: item.actualQuantity,
            minStockAlert: prod.minStockAlert,
            unit: prod.unit,
          });
        }
      }
    }

    if (lowStockItems.length > 0) {
      notifyLowStockAlert(lowStockItems).catch((err) =>
        console.error('Telegram low stock audit notification error:', err)
      );
    }

    showToast(`Đã duyệt phiếu kiểm kê ${auditCode} và cập nhật tồn kho mới!`, 'success');
    setAuditItems([]);
    setAuditNote('');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
            <Layers className="h-7 w-7 text-purple-600 dark:text-purple-400" />
            Quản Lý Kho & Vị Trí Hàng Hóa
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Phân khu vực kho, sơ đồ kệ trực quan, quản lý hạn sử dụng (FEFO/FIFO) và kiểm kê kho định kỳ.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex rounded-2xl bg-gray-100 p-1.5 dark:bg-gray-800/80 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('zones')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'zones'
              ? 'bg-white text-purple-700 shadow-md dark:bg-gray-900 dark:text-purple-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <MapPin className="h-4 w-4" />
          Sơ Đồ Kho & Vị Trí Kệ ({locations.length})
        </button>

        <button
          onClick={() => setActiveSubTab('lots')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'lots'
              ? 'bg-white text-purple-700 shadow-md dark:bg-gray-900 dark:text-purple-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <Calendar className="h-4 w-4" />
          Hạn Sử Dụng (HSD) & Lô Hàng ({productLots.length})
        </button>

        <button
          onClick={() => setActiveSubTab('audits')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'audits'
              ? 'bg-white text-purple-700 shadow-md dark:bg-gray-900 dark:text-purple-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Kiểm Kê Kho Định Kỳ ({stockAudits.length})
        </button>
      </div>

      {/* TAB 1: SƠ ĐỒ KHO & VỊ TRÍ KỆ */}
      {activeSubTab === 'zones' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Form Create Location */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <Plus className="h-4 w-4 text-purple-600" />
              Thêm Kệ / Vị Trí Kho Mới
            </h3>

            <form onSubmit={handleAddLocation} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Khu Vực Kho *
                </label>
                <input
                  type="text"
                  required
                  value={locZone}
                  onChange={(e) => setLocZone(e.target.value)}
                  placeholder="VD: Khu A, Khu B, Kho Tổng..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Mã Vị Trí (Kệ / Tầng) *
                </label>
                <input
                  type="text"
                  required
                  value={locCode}
                  onChange={(e) => setLocCode(e.target.value)}
                  placeholder="VD: KHO-A-K1"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-mono font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Tên Vị Trí Hiển Thị *
                </label>
                <input
                  type="text"
                  required
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  placeholder="VD: Kệ 1 - Tầng Trệt Khu A"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Sức Chứa Tối Đa (Sản phẩm)
                </label>
                <input
                  type="number"
                  value={locCapacity}
                  onChange={(e) => setLocCapacity(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Ghi Chú Vị Trí
                </label>
                <input
                  type="text"
                  value={locDescription}
                  onChange={(e) => setLocDescription(e.target.value)}
                  placeholder="VD: Dành cho hàng điện tử cao cấp..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-500"
              >
                <Plus className="h-4 w-4" />
                Tạo Vị Trí Kệ Mới
              </button>
            </form>
          </div>

          {/* Visual Warehouse Grid Map */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-purple-600" />
                  Sơ Đồ Kệ Kho Trực Quan
                </h3>
                <span className="text-xs text-gray-500 italic">Nhấp vào kệ để xem thông tin</span>
              </div>

              {locations.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400 italic">
                  Chưa có vị trí kệ nào. Hãy tạo vị trí kệ đầu tiên ở khung bên trái!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {locations.map((loc) => {
                    const assignedLots = productLots.filter((l) => l.locationId === loc.id);
                    const totalQty = assignedLots.reduce((acc, curr) => acc + curr.quantity, 0);
                    const percentFilled = Math.min(100, Math.round((totalQty / (loc.capacity || 100)) * 100));

                    return (
                      <div
                        key={loc.id}
                        className="group relative rounded-2xl border border-gray-200 bg-gray-50/50 p-4 transition hover:border-purple-300 hover:bg-purple-50/30 hover:shadow-md dark:border-gray-800 dark:bg-gray-800/40 dark:hover:border-purple-800 dark:hover:bg-purple-950/20 space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="inline-block rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              {loc.zone}
                            </span>
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white mt-1">
                              {loc.name}
                            </h4>
                            <p className="font-mono text-[11px] text-gray-500 font-medium">{loc.code}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteLocation(loc.id, loc.name)}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                            title="Xóa kệ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Capacity Progress Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-medium text-gray-500">
                            <span>Dung tích lưu trữ:</span>
                            <span className="font-bold text-gray-900 dark:text-white">
                              {totalQty} / {loc.capacity} món ({percentFilled}%)
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className={`h-full rounded-full transition-all ${
                                percentFilled > 90
                                  ? 'bg-rose-500'
                                  : percentFilled > 60
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${percentFilled}%` }}
                            />
                          </div>
                        </div>

                        {/* Assigned Products Count */}
                        <div className="pt-1 text-[11px] text-gray-600 dark:text-gray-300 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between">
                          <span>Số lô hàng gán kệ:</span>
                          <span className="font-bold text-purple-700 dark:text-purple-300">{assignedLots.length} lô</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HẠN SỬ DỤNG (HSD) & FEFO/FIFO */}
      {activeSubTab === 'lots' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Form Add Product Lot */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <Plus className="h-4 w-4 text-purple-600" />
              Khai Báo Lô Hàng & Hạn Sử Dụng (HSD)
            </h3>

            <form onSubmit={handleAddLot} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Chọn Sản Phẩm *
                </label>
                <select
                  required
                  value={lotProductId}
                  onChange={(e) => setLotProductId(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="">-- Chọn sản phẩm --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Mã Lô Hàng (LOT Number) *
                </label>
                <input
                  type="text"
                  required
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                  placeholder="VD: LOT-20260804-01"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-mono font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Hạn Sử Dụng (Expiration Date) *
                </label>
                <input
                  type="date"
                  required
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Số Lượng Lô *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={lotQuantity}
                    onChange={(e) => setLotQuantity(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Gán Vào Kệ Kho
                  </label>
                  <select
                    value={lotLocationId}
                    onChange={(e) => setLotLocationId(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">-- Chưa gán --</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-500"
              >
                <Plus className="h-4 w-4" />
                Lưu Lô Hàng Mới
              </button>
            </form>
          </div>

          {/* FEFO/FIFO Expiration Tracking Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-purple-600" />
                    Theo Dõi Hạn Sử Dụng FEFO (Hàng hết hạn trước, xuất trước)
                  </h3>
                </div>
              </div>

              {productLots.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400 italic">
                  Chưa có lô hàng nào. Hãy thêm lô hàng đầu tiên để theo dõi HSD!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold uppercase text-[11px]">
                        <th className="py-2.5 px-3">MÃ LOT</th>
                        <th className="py-2.5 px-3">TÊN SẢN PHẨM</th>
                        <th className="py-2.5 px-3 text-center">VỊ TRÍ KỆ</th>
                        <th className="py-2.5 px-3 text-center">SL LÔ</th>
                        <th className="py-2.5 px-3">HẠN SỬ DỤNG (HSD)</th>
                        <th className="py-2.5 px-3 text-center">TRẠNG THÁI</th>
                        <th className="py-2.5 px-3 text-right">THAO TÁC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                      {productLots
                        .slice()
                        .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime())
                        .map((lot) => {
                          const status = getExpirationStatus(lot.expirationDate);
                          return (
                            <tr key={lot.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                              <td className="py-2.5 px-3 font-mono font-bold text-purple-600 dark:text-purple-400">
                                {lot.lotNumber}
                              </td>
                              <td className="py-2.5 px-3 font-semibold">
                                {lot.productName}
                                <div className="text-[10px] font-mono text-gray-400">{lot.sku}</div>
                              </td>
                              <td className="py-2.5 px-3 text-center font-medium">
                                {lot.locationName || 'Chưa gán'}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold">{lot.quantity}</td>
                              <td className="py-2.5 px-3 font-mono font-bold">
                                {new Date(lot.expirationDate).toLocaleDateString('vi-VN')}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-block rounded-lg px-2.5 py-1 text-[10px] ${status.color}`}>
                                  {status.label}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  onClick={() => handleDeleteLot(lot.id, lot.lotNumber)}
                                  className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: KIỂM KÊ KHO & ĐIỀU CHỈNH TỒN KHO */}
      {activeSubTab === 'audits' && (
        <div className="space-y-6">
          {auditItems.length === 0 ? (
            /* Start Audit Entry Screen */
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                <ClipboardList className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Tạo Phiếu Kiểm Kê Kho Định Kỳ
                </h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                  Nhập số liệu thực tế tại kho, hệ thống sẽ tự động tính chênh lệch thừa/thiếu và điều chỉnh tồn kho chuẩn xác chỉ với 1 cú click!
                </p>
              </div>

              <button
                onClick={handleStartNewAudit}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-xs font-bold text-white shadow-lg hover:bg-purple-500"
              >
                <Plus className="h-4 w-4" />
                Bắt Đầu Kiểm Kê Toàn Bộ Sản Phẩm ({products.length} mặt hàng)
              </button>
            </div>
          ) : (
            /* Interactive Audit Entry & Comparison Sheet */
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-3 border-gray-100 dark:border-gray-800">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-purple-600" />
                    Bảng Kiểm Kê & So Sánh Số Liệu Tồn Kho
                  </h3>
                  <p className="text-xs text-gray-500">
                    Nhập số lượng thực tế kiểm kê vào cột "Tồn Thực Tế" bên dưới:
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setAuditItems([])}
                    className="rounded-xl border border-gray-300 px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                  >
                    Hủy Phiếu
                  </button>
                  <button
                    onClick={handleApplyAuditAdjustment}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Duyệt & Điều Chỉnh Tồn Kho
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold uppercase text-[11px]">
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">TÊN SẢN PHẨM</th>
                      <th className="py-2.5 px-3 text-center">ĐVT</th>
                      <th className="py-2.5 px-3 text-center">TỒN HỆ THỐNG</th>
                      <th className="py-2.5 px-3 text-center w-36">TỒN THỰC TẾ</th>
                      <th className="py-2.5 px-3 text-center">CHÊNH LỆCH (+/-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                    {auditItems.map((item) => (
                      <tr key={item.productId} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                        <td className="py-2.5 px-3 font-mono font-bold text-purple-600">{item.sku}</td>
                        <td className="py-2.5 px-3 font-semibold">{item.productName}</td>
                        <td className="py-2.5 px-3 text-center">{item.unit}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-gray-700 dark:text-gray-300">
                          {item.systemQuantity}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            value={item.actualQuantity}
                            onChange={(e) => handleActualQtyChange(item.productId, Number(e.target.value))}
                            className="w-24 rounded-lg border border-purple-300 bg-purple-50/50 px-2.5 py-1 text-center font-bold text-purple-900 focus:bg-white dark:border-purple-700 dark:bg-purple-950/50 dark:text-white"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.difference === 0 ? (
                            <span className="font-semibold text-gray-400">0 (Khớp)</span>
                          ) : item.difference > 0 ? (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              +{item.difference} (Thừa)
                            </span>
                          ) : (
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {item.difference} (Thiếu)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Audit History List */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Lịch Sử Các Phiếu Kiểm Kê Kho
            </h3>
            {stockAudits.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400 italic">
                Chưa có phiếu kiểm kê nào được hoàn tất.
              </div>
            ) : (
              <div className="space-y-2">
                {stockAudits.map((audit) => (
                  <div
                    key={audit.id}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/40"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400">
                          {audit.code}
                        </span>
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          Đã điều chỉnh tồn kho
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-gray-900 dark:text-white mt-0.5">
                        {audit.note}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {new Date(audit.createdAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                      {audit.items?.length || 0} mặt hàng
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
