import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useUIStore } from '../store/useUIStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useNetworkStore } from '../store/useNetworkStore';
import {
  Package,
  Boxes,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  DollarSign,
  Wallet,
  CreditCard,
  Plus,
  ChevronRight,
  Sparkles,
  Clock,
  ShoppingBag,
  BarChart3,
  Layers,
  Store,
  ShieldCheck,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

export const DashboardPage: React.FC = () => {
  const { setActiveTab } = useUIStore();
  const { storeName } = useSettingsStore();
  const { isOnline, lastSyncTime, pendingCount, conflictCount } = useNetworkStore();

  // IndexedDB Live Queries
  const allProducts = useLiveQuery(() => db.products.toArray(), []) || [];
  const products = allProducts.filter((p) => !p.isDeleted);
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const transactions = useLiveQuery(() => db.inventoryTransactions.toArray(), []) || [];
  const finances = useLiveQuery(() => db.financialTransactions.toArray(), []) || [];
  const debts = useLiveQuery(() => db.debts.toArray(), []) || [];

  // Date Strings
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const formattedToday = now.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });

  // 1. KPI Calculations
  const totalProducts = products.length;
  const totalInventoryCapital = products.reduce((sum, p) => sum + p.stockQuantity * p.importPrice, 0);
  const totalInventoryRetail = products.reduce((sum, p) => sum + p.stockQuantity * p.sellingPrice, 0);
  const lowStockProducts = products.filter((p) => p.stockQuantity <= p.minStockAlert);

  // Sales Today
  const todayExportSlips = transactions.filter((t) => !t.isDeleted && t.type === 'export' && t.createdAt.startsWith(todayStr));
  const todaySalesRevenue = todayExportSlips.reduce((sum, t) => sum + t.totalAmount, 0);

  // Imports Today
  const todayImportSlips = transactions.filter((t) => !t.isDeleted && t.type === 'import' && t.createdAt.startsWith(todayStr));
  const todayImportCost = todayImportSlips.reduce((sum, t) => sum + t.totalAmount, 0);

  // Financial Balances
  const totalCustomerDebt = debts
    .filter((d) => !d.isDeleted && d.partyType === 'customer' && d.status !== 'paid')
    .reduce((sum, d) => sum + d.remainingDebt, 0);

  // 2. Category Distribution Data
  const categoryDataMap: Record<string, number> = {};
  products.forEach((p) => {
    categoryDataMap[p.categoryName || 'Khác'] = (categoryDataMap[p.categoryName || 'Khác'] || 0) + (p.stockQuantity * p.sellingPrice);
  });
  const pieChartData = Object.keys(categoryDataMap).map((cat) => ({
    name: cat,
    value: categoryDataMap[cat],
  }));

  // 3. 7-Day Trend Chart Data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const trendChartData = last7Days.map((dateStr) => {
    const dayTransactions = transactions.filter((t) => !t.isDeleted && t.createdAt.startsWith(dateStr));
    const importTotal = dayTransactions
      .filter((t) => t.type === 'import')
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const exportTotal = dayTransactions
      .filter((t) => t.type === 'export')
      .reduce((sum, t) => sum + t.totalAmount, 0);

    const displayDate = new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
    });

    return {
      date: displayDate,
      'Doanh Thu Bán Hàng': exportTotal,
      'Chi Phí Nhập Kho': importTotal,
    };
  });

  // Top 5 Products by Stock Value
  const topProducts = [...products]
    .sort((a, b) => b.stockQuantity * b.sellingPrice - a.stockQuantity * a.sellingPrice)
    .slice(0, 5);

  // Recent 5 Transactions
  const recentTransactions = [...transactions]
    .filter((t) => !t.isDeleted)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Banner & Quick Actions Hub */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-6 text-white shadow-xl dark:from-emerald-900 dark:via-teal-950 dark:to-slate-900">
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-white/10 blur-2xl pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-200 text-xs font-bold uppercase tracking-widest">
              <Store className="h-4 w-4" />
              <span>{storeName || 'Cửa Hàng Nguyễn Vi'}</span>
              <span>•</span>
              <span className="capitalize">{formattedToday}</span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2">
              Xin chào, Quản lý Kho! <Sparkles className="h-6 w-6 text-amber-300 animate-bounce" />
            </h1>
            
            <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-100">
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold backdrop-blur-xs">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                Offline-First: Ready
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold backdrop-blur-xs">
                <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`}></span>
                {isOnline ? 'Trực Tuyến (Online)' : 'Ngoại Tuyến (Offline)'}
              </span>
              {lastSyncTime && (
                <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold backdrop-blur-xs">
                  <Clock className="h-3.5 w-3.5" />
                  Sync: {new Date(lastSyncTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <button
              onClick={() => setActiveTab('export')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white text-emerald-800 px-4 py-3 text-xs font-bold shadow-lg hover:bg-emerald-50 transition transform hover:-translate-y-0.5"
            >
              <ArrowUpFromLine className="h-4 w-4 text-purple-600" />
              Bán Hàng
            </button>

            <button
              onClick={() => setActiveTab('import')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/20 text-white border border-white/30 px-4 py-3 text-xs font-bold backdrop-blur-xs hover:bg-white/30 transition transform hover:-translate-y-0.5"
            >
              <ArrowDownToLine className="h-4 w-4 text-emerald-300" />
              Nhập Kho
            </button>

            <button
              onClick={() => setActiveTab('financial')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/20 text-white border border-white/30 px-4 py-3 text-xs font-bold backdrop-blur-xs hover:bg-white/30 transition transform hover:-translate-y-0.5"
            >
              <Wallet className="h-4 w-4 text-amber-300" />
              Sổ Quỹ
            </button>

            <button
              onClick={() => setActiveTab('products')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white/20 text-white border border-white/30 px-4 py-3 text-xs font-bold backdrop-blur-xs hover:bg-white/30 transition transform hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4 text-cyan-300" />
              Thêm SP
            </button>
          </div>
        </div>
      </div>

      {/* 2. 6 Upgraded KPI Glass Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {/* KPI 1: Today Sales */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Doanh Thu Hôm Nay</span>
            <div className="rounded-xl bg-purple-500/10 p-2 text-purple-600 dark:text-purple-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-lg font-black text-purple-700 dark:text-purple-400 truncate">
            {formatCurrency(todaySalesRevenue)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
            <span>{todayExportSlips.length} đơn xuất</span>
            <span className="font-semibold text-emerald-600">+Bán hàng</span>
          </div>
        </div>

        {/* KPI 2: Total Products & Stock Value */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Tổng Vốn Hàng Tồn</span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-lg font-black text-emerald-600 dark:text-emerald-400 truncate">
            {formatCurrency(totalInventoryCapital)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
            <span>{totalProducts} loại SP</span>
            <span>Bán: {formatCurrency(totalInventoryRetail)}</span>
          </div>
        </div>

        {/* KPI 3: Low Stock Warning */}
        <div
          onClick={() => setActiveTab('products')}
          className="cursor-pointer rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm transition hover:border-amber-500/60 dark:border-amber-900/50 dark:bg-amber-950/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-400">Cảnh Báo Tồn Thấp</span>
            <div className="rounded-xl bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-amber-600 dark:text-amber-400">{lowStockProducts.length}</p>
          <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-500 font-semibold flex items-center gap-1">
            <span>Chạm ngưỡng tối thiểu</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>

        {/* KPI 4: Imports Today */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Chi Nhập Kho Hôm Nay</span>
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <ArrowDownToLine className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-lg font-black text-blue-600 dark:text-blue-400 truncate">
            {formatCurrency(todayImportCost)}
          </p>
          <div className="mt-1 text-[11px] text-gray-500">
            <span>{todayImportSlips.length} phiếu nhập hàng</span>
          </div>
        </div>

        {/* KPI 5: Customer Debt */}
        <div
          onClick={() => setActiveTab('financial')}
          className="cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-rose-500/50 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Nợ Phải Thu Khách</span>
            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-lg font-black text-rose-600 dark:text-rose-400 truncate">
            {formatCurrency(totalCustomerDebt)}
          </p>
          <div className="mt-1 text-[11px] text-gray-500 flex items-center justify-between">
            <span>Công nợ chưa thu</span>
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>

        {/* KPI 6: Sync Status */}
        <div
          onClick={() => setActiveTab('synchistory')}
          className="cursor-pointer rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-cyan-500/50 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Sync Hàng Đợi</span>
            <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-600 dark:text-cyan-400">
              <RefreshCw className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400">{pendingCount}</span>
            <span className="text-xs text-gray-500">Chờ sync</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            {conflictCount > 0 ? (
              <span className="font-bold text-rose-600">{conflictCount} xung đột</span>
            ) : (
              <span className="text-emerald-600 font-semibold">Đồng bộ sẵn sàng</span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 7-Day Area Trend Chart */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-500" />
                Phân Tích Dòng Tiền & Xu Hướng Nhập / Xuất 7 Ngày
              </h3>
              <p className="text-xs text-gray-500">So sánh tổng giá trị phiếu xuất bán hàng và phiếu nhập kho</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Thời gian thực
            </span>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendChartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorImports" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(val) => `${val / 1000000}M`} axisLine={false} />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(Number(value)), '']}
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '16px', color: '#fff' }}
                />
                <Legend />
                <Area type="monotone" dataKey="Doanh Thu Bán Hàng" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="Chi Phí Nhập Kho" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorImports)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Value Donut Chart */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
          <div className="border-b pb-3 border-gray-100 dark:border-gray-800">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-500" />
              Phân Bố Giá Trị Hàng
            </h3>
            <p className="text-xs text-gray-500">Tỷ trọng giá trị kho theo danh mục</p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {pieChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any) => formatCurrency(Number(val))}
                  contentStyle={{ backgroundColor: '#111827', borderRadius: '14px', color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {pieChartData.map((entry, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                  <span className="truncate max-w-[120px]">{entry.name}</span>
                </span>
                <span className="font-bold text-gray-900 dark:text-white">{formatCurrency(entry.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Top Products & Recent Transactions Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top 5 High-Value Products */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-500" />
              Top 5 Sản Phẩm Giá Trị Hàng Tồn Cao Nhất
            </h3>
            <button
              onClick={() => setActiveTab('products')}
              className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
            >
              Xem tất cả <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {topProducts.map((p, idx) => {
              const itemValue = p.stockQuantity * p.sellingPrice;
              const ratio = Math.min(100, Math.round((itemValue / (totalInventoryRetail || 1)) * 100));

              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-[10px] font-extrabold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        {idx + 1}
                      </span>
                      {p.name}
                    </span>
                    <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                      {formatCurrency(itemValue)} ({p.stockQuantity} {p.unit})
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-600"
                      style={{ width: `${Math.max(5, ratio)}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Transactions Feed */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
              Nhật Ký Đơn Nhập & Xuất Mới Nhất
            </h3>
            <button
              onClick={() => setActiveTab('export')}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              Lịch sử <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {recentTransactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400 italic">Chưa có giao dịch xuất/nhập kho nào.</div>
            ) : (
              recentTransactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold text-white shadow-xs ${
                        t.type === 'import' ? 'bg-blue-600' : 'bg-emerald-600'
                      }`}
                    >
                      {t.type === 'import' ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-900 dark:text-white">{t.code}</span>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            t.type === 'import'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {t.type === 'import' ? 'NHẬP KHO' : 'XUẤT BÁN'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {t.customerSupplierName || 'Chưa ghi tên'} • {new Date(t.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <span className={`font-mono text-xs font-bold ${t.type === 'import' ? 'text-blue-600' : 'text-emerald-600'}`}>
                    {formatCurrency(t.totalAmount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. Low Stock Alert Table */}
      <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm dark:border-amber-900/50 dark:bg-gray-900 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Sản Phẩm Cần Nhập Bổ Sung Gấp (Cảnh Báo Tồn Kho)
            </h3>
            <p className="text-xs text-gray-500">Các sản phẩm có số lượng tồn kho chạm hoặc dưới định mức báo động</p>
          </div>

          <button
            onClick={() => setActiveTab('import')}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Tạo Phiếu Nhập Hàng
          </button>
        </div>

        {lowStockProducts.length === 0 ? (
          <div className="py-8 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-2xl">
            🎉 Tất cả sản phẩm trong kho đều đang duy trì mức tồn kho an toàn!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold uppercase text-[11px]">
                  <th className="py-3 px-4">MÃ SKU</th>
                  <th className="py-3 px-4">TÊN SẢN PHẨM</th>
                  <th className="py-3 px-4">DANH MỤC</th>
                  <th className="py-3 px-4 text-center">TỒN HIỆN TẠI</th>
                  <th className="py-3 px-4 text-center">NGƯỠNG BÁO ĐỘNG</th>
                  <th className="py-3 px-4 text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                {lowStockProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-amber-50/30 dark:hover:bg-amber-950/20">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {p.sku}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{p.name}</td>
                    <td className="py-3 px-4 text-gray-500">{p.categoryName}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-extrabold text-rose-600 dark:text-rose-400">
                        {p.stockQuantity} {p.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-gray-500">
                      {p.minStockAlert} {p.unit}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setActiveTab('import')}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                      >
                        + Nhập thêm
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
  );
};
