import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  PromotionProgram,
  PromotionType,
  CustomerTierPrice,
  PriceHistoryRecord,
  Product,
} from '../types/inventory';
import { useUIStore } from '../store/useUIStore';
import {
  Tag,
  Percent,
  Gift,
  Zap,
  Calendar,
  Users,
  History,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Search,
  DollarSign,
  AlertCircle,
  Sparkles,
  Sliders,
  Filter,
  ArrowUpRight,
  TrendingUp,
  X,
  Edit3,
  Layers,
  Check,
} from 'lucide-react';

export const PromotionsAndPricingPage: React.FC = () => {
  const { showToast } = useUIStore();

  const [activeSubTab, setActiveSubTab] = useState<'promotions' | 'tiers' | 'history'>('tiers');

  // IndexedDB Live Queries
  const allProducts = useLiveQuery(() => db.products.toArray(), []) || [];
  const products = allProducts.filter((p) => !p.isDeleted);
  const allCategories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const categories = allCategories.filter((c) => !c.isDeleted);
  const allPromotions = useLiveQuery(() => db.promotions.reverse().toArray(), []) || [];
  const promotions = allPromotions.filter((p) => !p.isDeleted);
  const customerTierPrices = useLiveQuery(() => db.customerTierPrices.toArray(), []) || [];
  const priceHistories = useLiveQuery(() => db.priceHistory.reverse().toArray(), []) || [];

  // Form State: Promotion Program
  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState<PromotionType>('percentage');
  const [discountValue, setDiscountValue] = useState(10);
  const [buyQuantity, setBuyQuantity] = useState(2);
  const [getQuantity, setGetQuantity] = useState(1);
  const [giftProductName, setGiftProductName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().substring(0, 10));
  const [endDate, setEndDate] = useState(new Date(Date.now() + 86400000 * 30).toISOString().substring(0, 10));
  const [applyType, setApplyType] = useState<'all' | 'category' | 'product'>('all');
  const [targetId, setTargetId] = useState('');

  // Tier Prices Filtering & Search
  const [tierSearchTerm, setTierSearchTerm] = useState('');
  const [tierCategoryFilter, setTierCategoryFilter] = useState('all');

  // Single Product Tier Price Modal Edit State
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [selectedProductForTier, setSelectedProductForTier] = useState<Product | null>(null);
  const [retailPrice, setRetailPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState(0);
  const [vipPrice, setVipPrice] = useState(0);
  const [priceChangeReason, setPriceChangeReason] = useState('');

  // Batch Auto Rule Modal State
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [wholesaleDiscountPct, setWholesaleDiscountPct] = useState(10);
  const [vipDiscountPct, setVipDiscountPct] = useState(15);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  };

  // Helper: Get Promotion Status
  const getPromoStatus = (promo: PromotionProgram) => {
    if (!promo.isActive) return { label: 'Đang tạm dừng', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
    const now = new Date().getTime();
    const start = new Date(promo.startDate).getTime();
    const end = new Date(promo.endDate + 'T23:59:59').getTime();

    if (now < start) {
      return { label: 'Chưa bắt đầu', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold' };
    } else if (now > end) {
      return { label: 'Đã hết hạn', color: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' };
    } else {
      return { label: 'Đang diễn ra', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold' };
    }
  };

  // Handle Add Promotion
  const handleAddPromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoName.trim()) {
      showToast('Vui lòng nhập Tên chương trình khuyến mãi!', 'warning');
      return;
    }

    let targetName = 'Toàn bộ cửa hàng';
    if (applyType === 'category') {
      const cat = categories.find((c) => c.id === targetId);
      targetName = cat ? `Danh mục: ${cat.name}` : 'Danh mục đã chọn';
    } else if (applyType === 'product') {
      const prod = products.find((p) => p.id === targetId);
      targetName = prod ? `Sản phẩm: ${prod.name}` : 'Sản phẩm đã chọn';
    }

    const newPromo: PromotionProgram = {
      id: `promo-${Date.now()}`,
      name: promoName.trim(),
      type: promoType,
      discountValue: Number(discountValue),
      buyQuantity: promoType === 'buy_x_get_y' ? Number(buyQuantity) : undefined,
      getQuantity: promoType === 'buy_x_get_y' ? Number(getQuantity) : undefined,
      giftProductName: promoType === 'buy_x_get_y' ? giftProductName.trim() : undefined,
      startDate,
      endDate,
      applyType,
      targetId: applyType !== 'all' ? targetId : undefined,
      targetName,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
    };

    try {
      await db.promotions.add(newPromo);
      showToast(`Tạo chương trình "${promoName}" thành công!`, 'success');
      setPromoName('');
      setDiscountValue(10);
    } catch (err) {
      console.error('Error adding promotion:', err);
      showToast('Lỗi khi tạo khuyến mãi!', 'error');
    }
  };

  const handleTogglePromoStatus = async (id: string, currentStatus: boolean) => {
    await db.promotions.update(id, {
      isActive: !currentStatus,
      updatedAt: new Date().toISOString(),
    });
    showToast(currentStatus ? 'Đã tạm dừng khuyến mãi' : 'Đã kích hoạt khuyến mãi', 'info');
  };

  const handleDeletePromo = async (id: string, name: string) => {
    if (window.confirm(`Xóa chương trình khuyến mãi "${name}"?`)) {
      await db.promotions.delete(id);
      showToast(`Đã xóa khuyến mãi "${name}"`, 'info');
    }
  };

  // Open Modal to Edit Tier Price for a Specific Product
  const handleOpenTierModal = (prod: Product) => {
    setSelectedProductForTier(prod);
    const existingTier = customerTierPrices.find((t) => t.productId === prod.id);

    if (existingTier) {
      setRetailPrice(existingTier.retailPrice);
      setWholesalePrice(existingTier.wholesalePrice);
      setVipPrice(existingTier.vipPrice);
    } else {
      setRetailPrice(prod.sellingPrice || 0);
      setWholesalePrice(Math.round((prod.sellingPrice || 0) * 0.9));
      setVipPrice(Math.round((prod.sellingPrice || 0) * 0.85));
    }
    setPriceChangeReason('');
    setIsTierModalOpen(true);
  };

  // Save Customer Tier Prices for Single Product
  const handleSaveSingleTierPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForTier) return;

    const prod = selectedProductForTier;
    const oldPrice = prod.sellingPrice || 0;
    const newRetail = Number(retailPrice) || 0;
    const now = new Date().toISOString();

    const existingTier = customerTierPrices.find((t) => t.productId === prod.id);
    const tierData: CustomerTierPrice = {
      id: existingTier ? existingTier.id : `tier-${Date.now()}`,
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      retailPrice: newRetail,
      wholesalePrice: Number(wholesalePrice) || 0,
      vipPrice: Number(vipPrice) || 0,
      updatedAt: now,
    };

    await db.customerTierPrices.put(tierData);

    if (oldPrice !== newRetail) {
      await db.products.update(prod.id, {
        sellingPrice: newRetail,
        updatedAt: now,
      });
    }

    await db.priceHistory.add({
      id: `ph-${Date.now()}`,
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      oldPrice,
      newPrice: newRetail,
      changedByName: 'Quản trị viên',
      reason: priceChangeReason.trim() || 'Điều chỉnh bảng giá đa tầng',
      createdAt: now,
    });

    showToast(`Đã cập nhật bảng giá đa tầng cho "${prod.name}"!`, 'success');
    setIsTierModalOpen(false);
  };

  // Batch Auto Apply Tier Prices to All Products
  const handleBatchApplyTierPrices = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let count = 0;
      const now = new Date().toISOString();
      for (const p of products) {
        const existing = customerTierPrices.find((t) => t.productId === p.id);
        const retail = p.sellingPrice || 0;
        const wholesale = Math.round(retail * (1 - wholesaleDiscountPct / 100));
        const vip = Math.round(retail * (1 - vipDiscountPct / 100));

        const tierData: CustomerTierPrice = {
          id: existing ? existing.id : `tier-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          retailPrice: retail,
          wholesalePrice: wholesale,
          vipPrice: vip,
          updatedAt: now,
        };

        await db.customerTierPrices.put(tierData);
        count++;
      }
      showToast(`Đã áp dụng tự động giá Sỉ (-${wholesaleDiscountPct}%) & VIP (-${vipDiscountPct}%) cho ${count} sản phẩm!`, 'success');
      setIsBatchModalOpen(false);
    } catch (err) {
      console.error('Batch apply error:', err);
      showToast('Lỗi khi tính bảng giá tự động!', 'error');
    }
  };

  // Filter products for Tiered Pricing Table
  const filteredProductsForTier = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(tierSearchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(tierSearchTerm.toLowerCase());
    const matchesCategory = tierCategoryFilter === 'all' || p.categoryId === tierCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
            <Tag className="h-7 w-7 text-purple-600 dark:text-purple-400" />
            Khuyến Mãi & Bảng Giá Đa Tầng
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Thiết lập bảng giá Lẻ / Sỉ / Khách VIP cho từng sản phẩm và quản lý các chương trình ưu đãi chiết khấu.
          </p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveSubTab('tiers')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'tiers'
              ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Users className="h-4 w-4" />
          Bảng Giá Đa Tầng Cho Tất Cả Sản Phẩm
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
            {products.length} SP
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('promotions')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'promotions'
              ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Zap className="h-4 w-4" />
          Chương Trình Khuyến Mãi ({promotions.length})
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'history'
              ? 'border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <History className="h-4 w-4" />
          Lịch Sử Thay Đổi Giá
        </button>
      </div>

      {/* TAB 1: BẢNG GIÁ ĐA TẦNG CHO TẤT CẢ SẢN PHẨM (RE-DESIGNED & PROFESSIONAL) */}
      {activeSubTab === 'tiers' && (
        <div className="space-y-6">
          {/* Header Summary & Batch Action Bar */}
          <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-transparent p-5 shadow-sm dark:border-purple-900/60 dark:bg-gray-900 space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  Bảng Giá Đa Tầng Theo Phân Hạng Khách Hàng
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Định giá 3 cấp độ: <strong>Giá Lẻ (Chuẩn)</strong>, <strong>Giá Bán Buôn / Sỉ</strong> và <strong>Giá Khách VIP</strong> cho toàn bộ danh mục sản phẩm.
                </p>
              </div>

              <button
                onClick={() => setIsBatchModalOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-500 transition"
              >
                <Sliders className="h-4 w-4" />
                ⚡ Áp Dụng Công Thức Giá Hàng Loạt
              </button>
            </div>

            {/* Metric Summary Badges */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t pt-4 border-purple-200/40 dark:border-gray-800">
              <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-xs dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300 font-bold">
                  1
                </div>
                <div>
                  <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase">Cấp 1: Giá Bán Lẻ</div>
                  <div className="text-xs font-extrabold text-gray-900 dark:text-white">Giá niêm yết chuẩn</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-xs dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300 font-bold">
                  2
                </div>
                <div>
                  <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase">Cấp 2: Giá Bán Sỉ</div>
                  <div className="text-xs font-extrabold text-gray-900 dark:text-white">Chiết khấu sỉ (~10%)</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-xs dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300 font-bold">
                  3
                </div>
                <div>
                  <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase">Cấp 3: Giá Khách VIP</div>
                  <div className="text-xs font-extrabold text-gray-900 dark:text-white">Đặc quyền VIP (~15%)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-center">
              <div className="sm:col-span-7 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={tierSearchTerm}
                  onChange={(e) => setTierSearchTerm(e.target.value)}
                  placeholder="Tìm kiếm sản phẩm theo Tên hoặc SKU..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 pl-10 pr-4 py-2 text-xs text-gray-900 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="sm:col-span-5 flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400 shrink-0" />
                <select
                  value={tierCategoryFilter}
                  onChange={(e) => setTierCategoryFilter(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="all">Tất cả danh mục sản phẩm</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Professional Tiered Pricing Table */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
            {filteredProductsForTier.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400 space-y-2">
                <Users className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600" />
                <p className="font-semibold">Không tìm thấy sản phẩm phù hợp.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 font-bold uppercase text-[11px] tracking-wider">
                      <th className="py-3.5 px-4">SẢN PHẨM & SKU</th>
                      <th className="py-3.5 px-4 text-right">GIÁ NHẬP (VỐN)</th>
                      <th className="py-3.5 px-4 text-right">1. GIÁ BÁN LẺ</th>
                      <th className="py-3.5 px-4 text-right text-blue-600 dark:text-blue-400">2. GIÁ BÁN SỈ</th>
                      <th className="py-3.5 px-4 text-right text-amber-600 dark:text-amber-400">3. GIÁ KHÁCH VIP</th>
                      <th className="py-3.5 px-4 text-center">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                    {filteredProductsForTier.map((p) => {
                      const tier = customerTierPrices.find((t) => t.productId === p.id);
                      const currentRetail = tier ? tier.retailPrice : p.sellingPrice || 0;
                      const currentWholesale = tier ? tier.wholesalePrice : Math.round(currentRetail * 0.9);
                      const currentVip = tier ? tier.vipPrice : Math.round(currentRetail * 0.85);

                      // Margins
                      const retailMarginPct = p.importPrice > 0 ? (((currentRetail - p.importPrice) / p.importPrice) * 100).toFixed(0) : null;
                      const wholesaleDiscountPct = currentRetail > 0 ? (((currentRetail - currentWholesale) / currentRetail) * 100).toFixed(0) : '10';
                      const vipDiscountPct = currentRetail > 0 ? (((currentRetail - currentVip) / currentRetail) * 100).toFixed(0) : '15';

                      return (
                        <tr key={p.id} className="hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition">
                          {/* Product & SKU */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold text-xs">
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-gray-900 dark:text-white text-xs leading-snug">
                                  {p.name}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="font-mono text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.5 rounded">
                                    SKU: {p.sku}
                                  </span>
                                  <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                                    {p.categoryName}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Import Cost */}
                          <td className="py-3.5 px-4 text-right font-mono font-medium text-gray-500">
                            {formatCurrency(p.importPrice)}
                          </td>

                          {/* Retail Price */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-mono font-extrabold text-gray-900 dark:text-white text-xs">
                              {formatCurrency(currentRetail)}
                            </div>
                            {retailMarginPct && (
                              <span className="inline-block mt-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400 px-1.5 py-0.2 rounded">
                                +{retailMarginPct}% lãi
                              </span>
                            )}
                          </td>

                          {/* Wholesale Price */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-mono font-extrabold text-blue-600 dark:text-blue-400 text-xs">
                              {formatCurrency(currentWholesale)}
                            </div>
                            <span className="inline-block mt-0.5 text-[9px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 px-1.5 py-0.2 rounded">
                               Giảm {wholesaleDiscountPct}%
                            </span>
                          </td>

                          {/* VIP Price */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="font-mono font-extrabold text-amber-600 dark:text-amber-400 text-xs">
                              {formatCurrency(currentVip)}
                            </div>
                            <span className="inline-block mt-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.2 rounded">
                              Giảm {vipDiscountPct}%
                            </span>
                          </td>

                          {/* Action */}
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleOpenTierModal(p)}
                              className="flex items-center justify-center gap-1 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-500 transition mx-auto"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Sửa Bảng Giá
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
      )}

      {/* TAB 2: PROMOTION PROGRAMS */}
      {activeSubTab === 'promotions' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Create Promotion Form */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <Plus className="h-4 w-4 text-purple-600" />
              Tạo Chương Trình Khuyến Mãi Mới
            </h3>

            <form onSubmit={handleAddPromotion} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Tên Chương Trình Khuyến Mãi *
                </label>
                <input
                  type="text"
                  required
                  value={promoName}
                  onChange={(e) => setPromoName(e.target.value)}
                  placeholder="VD: Mừng Khai Trương Giảm 20%"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Loại Hình Ưu Đãi *
                </label>
                <select
                  value={promoType}
                  onChange={(e) => setPromoType(e.target.value as PromotionType)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="percentage">Giảm theo Phần trăm (%)</option>
                  <option value="fixed_amount">Giảm Số tiền cố định (VNĐ)</option>
                  <option value="buy_x_get_y">Mua X Tặng Y (Quà tặng)</option>
                </select>
              </div>

              {promoType === 'percentage' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    % Chiết Khấu (1% - 100%) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-purple-600 dark:border-gray-700 dark:bg-gray-800 dark:text-purple-400"
                  />
                </div>
              )}

              {promoType === 'fixed_amount' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Số Tiền Trừ Trực Tiếp (VNĐ) *
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    required
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-purple-600 dark:border-gray-700 dark:bg-gray-800 dark:text-purple-400"
                  />
                </div>
              )}

              {promoType === 'buy_x_get_y' && (
                <div className="space-y-2.5 rounded-xl bg-purple-50/50 p-3 dark:bg-purple-950/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">Mua Số Lượng</label>
                      <input
                        type="number"
                        min="1"
                        value={buyQuantity}
                        onChange={(e) => setBuyQuantity(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">Tặng Số Lượng</label>
                      <input
                        type="number"
                        min="1"
                        value={getQuantity}
                        onChange={(e) => setGetQuantity(Number(e.target.value))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300">Tên Quà Tặng Kèm</label>
                    <input
                      type="text"
                      placeholder="VD: Cáp sạc Type-C"
                      value={giftProductName}
                      onChange={(e) => setGiftProductName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Từ Ngày</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Đến Ngày</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Phạm Vi Áp Dụng</label>
                <select
                  value={applyType}
                  onChange={(e) => setApplyType(e.target.value as any)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="all">Toàn bộ cửa hàng</option>
                  <option value="category">Theo Danh mục cụ thể</option>
                  <option value="product">Theo Sản phẩm cụ thể</option>
                </select>
              </div>

              {applyType === 'category' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Chọn Danh Mục</label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">-- Chọn danh mục --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {applyType === 'product' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Chọn Sản Phẩm</label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
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
              )}

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-500"
              >
                <Plus className="h-4 w-4" />
                Lưu Chương Trình Khuyến Mãi
              </button>
            </form>
          </div>

          {/* Promotion Program List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
                <Zap className="h-4 w-4 text-purple-600" />
                Danh Sách Khuyến Mãi Đang Theo Dõi ({promotions.length})
              </h3>

              {promotions.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400 italic">
                  Chưa có chương trình khuyến mãi nào được tạo.
                </div>
              ) : (
                <div className="space-y-3">
                  {promotions.map((p) => {
                    const status = getPromoStatus(p);
                    return (
                      <div
                        key={p.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${status.color}`}>
                              {status.label}
                            </span>
                            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded-md">
                              {p.targetName}
                            </span>
                          </div>

                          <h4 className="font-bold text-sm text-gray-900 dark:text-white">{p.name}</h4>

                          <div className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                            {p.type === 'percentage' && (
                              <span className="font-bold text-purple-600">Giảm {p.discountValue}% giá bán</span>
                            )}
                            {p.type === 'fixed_amount' && (
                              <span className="font-bold text-purple-600">Giảm trực tiếp {formatCurrency(p.discountValue)}</span>
                            )}
                            {p.type === 'buy_x_get_y' && (
                              <span className="font-bold text-purple-600">
                                Mua {p.buyQuantity} Tặng {p.getQuantity} {p.giftProductName ? `(${p.giftProductName})` : ''}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Áp dụng: {new Date(p.startDate).toLocaleDateString('vi-VN')} ➔ {new Date(p.endDate).toLocaleDateString('vi-VN')}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-0 pt-2 sm:pt-0 border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => handleTogglePromoStatus(p.id, p.isActive)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                              p.isActive
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {p.isActive ? 'Tạm Dừng' : 'Kích Hoạt'}
                          </button>

                          <button
                            onClick={() => handleDeletePromo(p.id, p.name)}
                            className="rounded-xl border border-gray-200 p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:border-gray-700 dark:hover:bg-rose-950"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {/* TAB 3: PRICE CHANGE HISTORY */}
      {activeSubTab === 'history' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
            <History className="h-4 w-4 text-purple-600" />
            Lịch Sử Điều Chỉnh Bảng Giá Sản Phẩm
          </h3>

          {priceHistories.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400 italic">
              Chưa có lịch sử thay đổi giá nào.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold uppercase text-[11px]">
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">TÊN SẢN PHẨM</th>
                    <th className="py-2.5 px-3 text-right">GIÁ CŨ</th>
                    <th className="py-2.5 px-3 text-right text-purple-600">GIÁ MỚI</th>
                    <th className="py-2.5 px-3">NGƯỜI THAY ĐỔI</th>
                    <th className="py-2.5 px-3">LÝ DO</th>
                    <th className="py-2.5 px-3">THỜI GIAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                  {priceHistories.map((h) => (
                    <tr key={h.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                      <td className="py-2.5 px-3 font-mono font-bold text-purple-600">{h.sku}</td>
                      <td className="py-2.5 px-3 font-semibold">{h.productName}</td>
                      <td className="py-2.5 px-3 text-right font-mono line-through text-gray-400">
                        {formatCurrency(h.oldPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-600">
                        {formatCurrency(h.newPrice)}
                      </td>
                      <td className="py-2.5 px-3 font-medium">{h.changedByName}</td>
                      <td className="py-2.5 px-3 text-gray-500 italic">{h.reason || 'N/A'}</td>
                      <td className="py-2.5 px-3 text-gray-400 font-mono text-[11px]">
                        {new Date(h.createdAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Single Product Tier Edit Modal */}
      {isTierModalOpen && selectedProductForTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold text-sm">
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Thiết Lập Bảng Giá Đa Tầng
                  </h3>
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-bold">
                    {selectedProductForTier.name} ({selectedProductForTier.sku})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTierModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cost Reference Badge */}
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800 flex items-center justify-between text-xs">
              <span className="text-gray-500 font-medium">Giá Nhập Gốc (Vốn):</span>
              <strong className="font-mono text-gray-900 dark:text-white">
                {formatCurrency(selectedProductForTier.importPrice)}
              </strong>
            </div>

            <form onSubmit={handleSaveSingleTierPrice} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    1. Giá Bán Lẻ (Niêm yết) *
                  </label>
                  {selectedProductForTier.importPrice > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600">
                      Lãi: +{(((retailPrice - selectedProductForTier.importPrice) / selectedProductForTier.importPrice) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    2. Giá Bán Buôn / Sỉ *
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setWholesalePrice(Math.round(retailPrice * 0.9))}
                      className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
                    >
                      -10% Lẻ
                    </button>
                    <button
                      type="button"
                      onClick={() => setWholesalePrice(Math.round(retailPrice * 0.85))}
                      className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
                    >
                      -15% Lẻ
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(Number(e.target.value))}
                  className="w-full rounded-xl border border-blue-300 bg-blue-50/50 px-3.5 py-2 text-xs font-bold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    3. Giá Khách VIP *
                  </label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setVipPrice(Math.round(retailPrice * 0.85))}
                      className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300"
                    >
                      -15% Lẻ
                    </button>
                    <button
                      type="button"
                      onClick={() => setVipPrice(Math.round(retailPrice * 0.8))}
                      className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300"
                    >
                      -20% Lẻ
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  required
                  min="0"
                  step="1000"
                  value={vipPrice}
                  onChange={(e) => setVipPrice(Number(e.target.value))}
                  className="w-full rounded-xl border border-amber-300 bg-amber-50/50 px-3.5 py-2 text-xs font-bold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Lý Do Thay Đổi Giá
                </label>
                <input
                  type="text"
                  value={priceChangeReason}
                  onChange={(e) => setPriceChangeReason(e.target.value)}
                  placeholder="VD: Cập nhật giá niêm yết mới..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTierModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-500"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Lưu Bảng Giá
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Auto Price Formula Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Sliders className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                Công Thức Giá Tự Động Hàng Loạt
              </h3>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Tính năng này sẽ tự động tính toán <strong>Giá Bán Sỉ</strong> và <strong>Giá Khách VIP</strong> cho toàn bộ <strong>{products.length} sản phẩm</strong> dựa trên % chiết khấu so với Giá Bán Lẻ.
            </p>

            <form onSubmit={handleBatchApplyTierPrices} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  % Chiết Khấu Cho Giá Bán Sỉ (Mặc định 10%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={wholesaleDiscountPct}
                    onChange={(e) => setWholesaleDiscountPct(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-400"
                  />
                  <span className="text-xs font-bold text-gray-500">%</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  % Chiết Khấu Cho Giá Khách VIP (Mặc định 15%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    required
                    value={vipDiscountPct}
                    onChange={(e) => setVipDiscountPct(Number(e.target.value))}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-amber-600 dark:border-gray-700 dark:bg-gray-800 dark:text-amber-400"
                  />
                  <span className="text-xs font-bold text-gray-500">%</span>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-500"
                >
                  <Sparkles className="h-4 w-4" />
                  Áp Dụng Cho Tất Cả {products.length} SP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
