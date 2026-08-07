import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { exportElementToPDF } from '../services/pdfService';
import { exportProfitLossToExcel } from '../services/excelService';
import { useUIStore } from '../store/useUIStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useNetworkStore } from '../store/useNetworkStore';
import {
  BarChart3,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  CircleDollarSign,
  UserCheck,
  Building,
  ArrowRight,
  PieChart as PieIcon,
  Layers,
  FileSpreadsheet,
  Printer,
  Calculator,
  ShieldCheck,
  Globe,
  Laptop,
  CheckCircle2,
  AlertCircle,
  FileText,
  Filter,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#8b5cf6', '#06b6d4', '#64748b'];

type ReportTab = 'pnl' | 'inventory' | 'cashflow' | 'debts';
type TimeRangeType = 'today' | '7days' | 'month' | 'last_month' | 'quarter' | 'year' | 'custom' | 'all';

export const ReportsPage: React.FC = () => {
  const { showToast, setActiveTab } = useUIStore();
  const { storeName, phone, address, supabaseUrl } = useSettingsStore();
  const { isOnline } = useNetworkStore();

  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('pnl');
  const [timeRange, setTimeRange] = useState<TimeRangeType>('month');

  // Custom date picker states
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // IndexedDB Live Queries
  const inventoryTransactions = useLiveQuery(() => db.inventoryTransactions.toArray(), []) || [];
  const financialTransactions = useLiveQuery(() => db.financialTransactions.toArray(), []) || [];
  const debts = useLiveQuery(() => db.debts.toArray(), []) || [];
  const products = useLiveQuery(() => db.products.toArray(), []) || [];

  const activeFinances = financialTransactions.filter((f) => !f.isDeleted);
  const activeDebts = debts.filter((d) => !d.isDeleted);
  const activeInventoryTx = inventoryTransactions.filter((t) => !t.isDeleted);

  // Helper date filter function
  const filterByDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();

    if (timeRange === 'today') {
      return d.toDateString() === now.toDateString();
    } else if (timeRange === '7days') {
      const past7 = new Date();
      past7.setDate(now.getDate() - 7);
      return d >= past7;
    } else if (timeRange === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } else if (timeRange === 'last_month') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
    } else if (timeRange === 'quarter') {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const dQuarter = Math.floor(d.getMonth() / 3);
      return currentQuarter === dQuarter && d.getFullYear() === now.getFullYear();
    } else if (timeRange === 'year') {
      return d.getFullYear() === now.getFullYear();
    } else if (timeRange === 'custom') {
      if (customStartDate && d < new Date(customStartDate)) return false;
      if (customEndDate) {
        const endD = new Date(customEndDate);
        endD.setHours(23, 59, 59, 999);
        if (d > endD) return false;
      }
      return true;
    }
    return true;
  };

  const filteredInventory = activeInventoryTx.filter((t) => filterByDate(t.createdAt));
  const filteredFinances = activeFinances.filter((f) => filterByDate(f.createdAt));

  // Map products by ID & SKU for accurate COGS (Giá vốn hàng bán)
  const productImportPriceMap = new Map<string, number>();
  products.forEach((p) => {
    productImportPriceMap.set(p.id, p.importPrice || 0);
    if (p.sku) productImportPriceMap.set(p.sku, p.importPrice || 0);
  });

  // Calculate Precise Profit & Loss Components
  let grossSalesRevenue = 0;
  let totalSalesDiscounts = 0;
  let calculatedCOGS = 0;

  filteredInventory
    .filter((t) => t.type === 'export')
    .forEach((t) => {
      totalSalesDiscounts += t.discountAmount || 0;
      t.items.forEach((item) => {
        const itemSubtotal = item.subtotal || item.quantity * item.price;
        grossSalesRevenue += itemSubtotal;

        // COGS calculation per item
        const importPrice =
          productImportPriceMap.get(item.productId) ??
          productImportPriceMap.get(item.sku) ??
          item.price * 0.7; // Fallback to 70% if product record removed

        calculatedCOGS += item.quantity * importPrice;
      });
    });

  // Direct cashbook incomes (non-inventory slip income)
  const directCashbookSales = filteredFinances
    .filter((f) => f.type === 'income' && f.category === 'sale' && !f.code.startsWith('PT-EXP-'))
    .reduce((sum, f) => sum + (f.amount || 0), 0);

  const totalGrossSales = grossSalesRevenue + directCashbookSales;
  const netRevenue = totalGrossSales - totalSalesDiscounts;
  const grossProfit = netRevenue - calculatedCOGS;
  const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  // OPEX (Operating Expenses - Rent, Salary, Operations, Marketing, etc.)
  const opexTransactions = filteredFinances.filter(
    (f) => f.type === 'expense' && !f.code.startsWith('PC-IMP-') && f.category !== 'other'
  );
  const totalOPEX = opexTransactions.reduce((sum, f) => sum + (f.amount || 0), 0);

  const opexCategoryMap: Record<string, number> = {};
  opexTransactions.forEach((f) => {
    const catName = f.categoryName || f.category || 'Chi phí khác';
    opexCategoryMap[catName] = (opexCategoryMap[catName] || 0) + f.amount;
  });

  const opexBreakdown = Object.keys(opexCategoryMap).map((catName) => ({
    categoryName: catName,
    amount: opexCategoryMap[catName],
  }));

  const netOperatingProfit = grossProfit - totalOPEX;

  const otherIncome = filteredFinances
    .filter((f) => f.type === 'income' && f.category === 'other')
    .reduce((sum, f) => sum + (f.amount || 0), 0);

  const otherExpenses = filteredFinances
    .filter((f) => f.type === 'expense' && f.category === 'other')
    .reduce((sum, f) => sum + (f.amount || 0), 0);

  const netProfit = netOperatingProfit + otherIncome - otherExpenses;
  const netMarginPct = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  // Debts Summary
  const totalCustomerDebt = activeDebts
    .filter((d) => d.partyType === 'customer' && d.status !== 'paid')
    .reduce((sum, d) => sum + (d.remainingDebt || 0), 0);

  const totalSupplierDebt = activeDebts
    .filter((d) => d.partyType === 'supplier' && d.status !== 'paid')
    .reduce((sum, d) => sum + (d.remainingDebt || 0), 0);

  // Time range display label
  const getTimeRangeText = () => {
    if (timeRange === 'today') return 'Hôm nay';
    if (timeRange === '7days') return '7 ngày gần nhất';
    if (timeRange === 'month') return 'Tháng này';
    if (timeRange === 'last_month') return 'Tháng trước';
    if (timeRange === 'quarter') return 'Quý này';
    if (timeRange === 'year') return 'Năm nay';
    if (timeRange === 'custom')
      return `Từ ${customStartDate || 'đầu'} đến ${customEndDate || 'nay'}`;
    return 'Tất cả thời gian';
  };

  // Recharts P&L Comparison Data
  const pnlChartData = [
    {
      name: 'Doanh Thu Thuần',
      'Số Tiền': netRevenue,
      fill: '#10b981',
    },
    {
      name: 'Giá Vốn COGS',
      'Số Tiền': calculatedCOGS,
      fill: '#f43f5e',
    },
    {
      name: 'Lợi Nhuận Gộp',
      'Số Tiền': grossProfit > 0 ? grossProfit : 0,
      fill: '#3b82f6',
    },
    {
      name: 'Chi Phí Vận Hành',
      'Số Tiền': totalOPEX,
      fill: '#f59e0b',
    },
    {
      name: 'Lợi Nhuận Ròng',
      'Số Tiền': netProfit > 0 ? netProfit : 0,
      fill: '#8b5cf6',
    },
  ];

  // OPEX Pie Chart Data
  const opexPieData = opexBreakdown.map((item) => ({
    name: item.categoryName,
    value: item.amount,
  }));

  // Top Selling Products Map
  const productSalesMap: Record<string, number> = {};
  filteredInventory
    .filter((t) => t.type === 'export')
    .forEach((t) => {
      t.items.forEach((item) => {
        productSalesMap[item.productName] = (productSalesMap[item.productName] || 0) + item.quantity;
      });
    });

  const topProductsData = Object.keys(productSalesMap)
    .map((name) => ({ name, quantity: productSalesMap[name] }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const handleExportPDF = async () => {
    showToast('Đang khởi tạo tài liệu PDF Báo Cáo Lãi Lỗ...', 'info');
    await exportElementToPDF('report-container', `Bao_Cao_Lai_Lo_${timeRange}`);
    showToast('Đã xuất báo cáo PDF thành công!', 'success');
  };

  const handleExportExcel = () => {
    exportProfitLossToExcel({
      storeName: storeName || 'Nguyễn Vi Shop',
      timeRangeText: getTimeRangeText(),
      grossSales: totalGrossSales,
      salesDiscounts: totalSalesDiscounts,
      netRevenue,
      cogs: calculatedCOGS,
      grossProfit,
      grossMargin: grossMarginPct,
      operatingExpenses: totalOPEX,
      operatingExpensesBreakdown: opexBreakdown,
      netOperatingProfit,
      otherIncome,
      otherExpenses,
      netProfit,
      netMargin: netMarginPct,
    });
    showToast('Đã xuất báo cáo Kết quả Kinh doanh (.xlsx) thành công!', 'success');
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Top Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                Báo Cáo Kết Quả Kinh Doanh (Lãi / Lỗ)
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                <span>Hệ thống Kế toán Quản trị Tự động</span>
                <span>•</span>
                {supabaseUrl ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[11px] font-bold border border-emerald-200 dark:border-emerald-800">
                    <Globe className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                    Đồng bộ Cloud Realtime (Web, Vercel & EXE)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold border border-amber-200 dark:border-amber-800">
                    <Laptop className="w-3.5 h-3.5 text-amber-500" />
                    Chế độ Chạy Offline-First
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setActiveTab('financials')}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 transition"
            title="Sổ quỹ thu chi & Quản lý nợ"
          >
            <Wallet className="h-4 w-4" />
            Sổ Quỹ & Công Nợ
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm transition"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Xuất Excel (.xlsx)
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 shadow-sm transition"
          >
            <Printer className="h-4 w-4" />
            Xuất PDF / In
          </button>
        </div>
      </div>

      {/* Time Filters Toolbar */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300">
            <Filter className="h-4 w-4 text-emerald-500" />
            <span>Khoảng thời gian báo cáo:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'today', label: 'Hôm nay' },
              { id: '7days', label: '7 ngày qua' },
              { id: 'month', label: 'Tháng này' },
              { id: 'last_month', label: 'Tháng trước' },
              { id: 'quarter', label: 'Quý này' },
              { id: 'year', label: 'Năm nay' },
              { id: 'all', label: 'Tất cả' },
              { id: 'custom', label: 'Tùy chọn ngày' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTimeRange(item.id as TimeRangeType)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  timeRange === item.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {timeRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
            <div className="flex items-center gap-2">
              <label className="font-medium text-gray-600 dark:text-gray-400">Từ ngày:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-sans dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="font-medium text-gray-600 dark:text-gray-400">Đến ngày:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-sans dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>

      {/* Sub-Tabs for Reports */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveReportTab('pnl')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeReportTab === 'pnl'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Calculator className="h-4 w-4" />
          1. Báo Cáo Kết Quả Kinh Doanh (Lãi / Lỗ Ròng)
        </button>

        <button
          onClick={() => setActiveReportTab('inventory')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeReportTab === 'inventory'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Package className="h-4 w-4" />
          2. Thống Kê Kho & Bán Hàng
        </button>

        <button
          onClick={() => setActiveReportTab('cashflow')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeReportTab === 'cashflow'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Wallet className="h-4 w-4 text-blue-500" />
          3. Sổ Quỹ & Dòng Tiền Thực Thu / Chi
        </button>

        <button
          onClick={() => setActiveReportTab('debts')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeReportTab === 'debts'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Building className="h-4 w-4 text-purple-500" />
          4. Tổng Quan Công Nợ
        </button>
      </div>

      {/* Main Printable Container */}
      <div id="report-container" className="space-y-6 bg-transparent">
        {/* Print Header Visible ONLY in Print/PDF Mode */}
        <div className="hidden print:block mb-6 p-4 border-b-2 border-gray-900 text-black">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-extrabold uppercase tracking-wide">{storeName || 'CỬA HÀNG NGUYỄN VI SHOP'}</h1>
              <p className="text-xs mt-1">{address ? `Địa chỉ: ${address}` : ''} {phone ? `| ĐT: ${phone}` : ''}</p>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold">MẪU BÁO CÁO KẾT QUẢ KINH DOANH</p>
              <p className="text-gray-600">Thời gian: {getTimeRangeText()}</p>
              <p className="text-gray-500 text-[10px] mt-0.5">Ngày in: {new Date().toLocaleString('vi-VN')}</p>
            </div>
          </div>
        </div>

        {/* TAB 1: PROFIT & LOSS STATEMENT (Standard P&L) */}
        {activeReportTab === 'pnl' && (
          <div className="space-y-6">
            {/* Executive Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  <span>Doanh Thu Thuần (Net Sales)</span>
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="mt-2.5 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(netRevenue)}
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>Doanh thu gộp: {formatCurrency(totalGrossSales)}</span>
                  <span>Chiết khấu: -{formatCurrency(totalSalesDiscounts)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/20">
                <div className="flex items-center justify-between text-xs font-bold text-rose-700 dark:text-rose-400">
                  <span>Giá Vốn Hàng Bán (COGS)</span>
                  <TrendingUp className="h-5 w-5 text-rose-500" />
                </div>
                <p className="mt-2.5 text-2xl font-extrabold text-rose-600 dark:text-rose-400">
                  {formatCurrency(calculatedCOGS)}
                </p>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  Tính theo giá nhập sản phẩm đã bán thực tế
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/20">
                <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-400">
                  <span>Lợi Nhuận Gộp (Gross Profit)</span>
                  <CircleDollarSign className="h-5 w-5 text-blue-500" />
                </div>
                <p className="mt-2.5 text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                  {formatCurrency(grossProfit)}
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">Biên lợi nhuận gộp:</span>
                  <span className="font-bold text-blue-700 dark:text-blue-300">{grossMarginPct.toFixed(1)}%</span>
                </div>
              </div>

              <div
                className={`rounded-2xl border p-5 shadow-sm ${
                  netProfit >= 0
                    ? 'border-purple-200 bg-purple-50/40 dark:border-purple-900/60 dark:bg-purple-950/20'
                    : 'border-rose-300 bg-rose-100/60 dark:border-rose-900 dark:bg-rose-950/40'
                }`}
              >
                <div
                  className={`flex items-center justify-between text-xs font-bold ${
                    netProfit >= 0 ? 'text-purple-700 dark:text-purple-400' : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  <span>LỢI NHUẬN RÒNG (NET PROFIT)</span>
                  {netProfit >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-rose-600" />
                  )}
                </div>
                <p
                  className={`mt-2.5 text-2xl font-extrabold ${
                    netProfit >= 0 ? 'text-purple-700 dark:text-purple-300' : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  {formatCurrency(netProfit)}
                </p>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">Biên lợi nhuận ròng:</span>
                  <span
                    className={`font-bold ${
                      netProfit >= 0 ? 'text-purple-700 dark:text-purple-300' : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {netMarginPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Standard Financial Statement Table */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 mb-4 border-b border-gray-100 dark:border-gray-800 gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    Báo Cáo Kết Quả Hoạt Động Kinh Doanh (Chi Tiết Chỉ Tiêu)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Chuẩn Báo cáo Tài chính Quản trị Doanh nghiệp ({getTimeRangeText()})
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 font-bold text-gray-600 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3 w-16 text-center">Mã</th>
                      <th className="px-4 py-3">Chỉ tiêu Kết quả Kinh doanh</th>
                      <th className="px-4 py-3 text-right">Số tiền (VNĐ)</th>
                      <th className="px-4 py-3 text-right">Tỷ trọng (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {/* 01. Doanh thu gộp */}
                    <tr>
                      <td className="px-4 py-3 text-center font-mono text-gray-400">01</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                        1. Doanh thu bán hàng & cung cấp dịch vụ
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 dark:text-white">
                        {formatCurrency(totalGrossSales)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-400">--</td>
                    </tr>

                    {/* 02. Giảm trừ */}
                    <tr>
                      <td className="px-4 py-3 text-center font-mono text-gray-400">02</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 pl-8">
                        - Chiết khấu & Giảm giá khuyến mãi
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-rose-600">
                        -{formatCurrency(totalSalesDiscounts)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-400">
                        {totalGrossSales > 0 ? ((totalSalesDiscounts / totalGrossSales) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>

                    {/* 10. Doanh thu thuần */}
                    <tr className="bg-emerald-50/30 dark:bg-emerald-950/20 font-bold">
                      <td className="px-4 py-3 text-center font-mono text-emerald-600">10</td>
                      <td className="px-4 py-3 text-emerald-700 dark:text-emerald-300">
                        3. Doanh thu thuần về bán hàng & dịch vụ (10 = 01 - 02)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                        {formatCurrency(netRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">100.0%</td>
                    </tr>

                    {/* 11. Giá vốn */}
                    <tr>
                      <td className="px-4 py-3 text-center font-mono text-gray-400">11</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                        4. Giá vốn hàng bán (COGS)
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                        -{formatCurrency(calculatedCOGS)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-rose-500">
                        {netRevenue > 0 ? ((calculatedCOGS / netRevenue) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>

                    {/* 20. Lợi nhuận gộp */}
                    <tr className="bg-blue-50/30 dark:bg-blue-950/20 font-bold">
                      <td className="px-4 py-3 text-center font-mono text-blue-600">20</td>
                      <td className="px-4 py-3 text-blue-700 dark:text-blue-300">
                        5. Lợi nhuận gộp về bán hàng (20 = 10 - 11)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-blue-600 dark:text-blue-400 text-sm">
                        {formatCurrency(grossProfit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-blue-600">{grossMarginPct.toFixed(1)}%</td>
                    </tr>

                    {/* 25. Chi phí hoạt động */}
                    <tr>
                      <td className="px-4 py-3 text-center font-mono text-gray-400">25</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                        6. Tổng Chi Phí Hoạt Động Kinh Doanh (OPEX)
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-amber-600">
                        -{formatCurrency(totalOPEX)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-amber-500">
                        {netRevenue > 0 ? ((totalOPEX / netRevenue) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>

                    {/* OPEX Sub-categories */}
                    {opexBreakdown.map((exp, idx) => (
                      <tr key={idx} className="text-gray-500 dark:text-gray-400">
                        <td className="px-4 py-2 text-center font-mono text-xs">--</td>
                        <td className="px-4 py-2 pl-8">+ Chi phí: {exp.categoryName}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">-{formatCurrency(exp.amount)}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">
                          {totalOPEX > 0 ? ((exp.amount / totalOPEX) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}

                    {/* 30. Lợi nhuận thuần HĐKD */}
                    <tr className="bg-purple-50/30 dark:bg-purple-950/20 font-bold">
                      <td className="px-4 py-3 text-center font-mono text-purple-600">30</td>
                      <td className="px-4 py-3 text-purple-700 dark:text-purple-300">
                        7. Lợi nhuận thuần từ hoạt động kinh doanh (30 = 20 - 25)
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-purple-600 dark:text-purple-400 text-sm">
                        {formatCurrency(netOperatingProfit)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-purple-600">
                        {netRevenue > 0 ? ((netOperatingProfit / netRevenue) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>

                    {/* 31. Thu nhập khác */}
                    <tr>
                      <td className="px-4 py-3 text-center font-mono text-gray-400">31</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">8. Thu nhập khác</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">
                        +{formatCurrency(otherIncome)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-400">--</td>
                    </tr>

                    {/* 32. Chi phí khác */}
                    <tr>
                      <td className="px-4 py-3 text-center font-mono text-gray-400">32</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">9. Chi phí khác</td>
                      <td className="px-4 py-3 text-right font-mono text-rose-600">
                        -{formatCurrency(otherExpenses)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-400">--</td>
                    </tr>

                    {/* 50. TỔNG LỢI NHUẬN RÒNG */}
                    <tr
                      className={`font-black text-sm ${
                        netProfit >= 0
                          ? 'bg-purple-100/60 text-purple-900 dark:bg-purple-950/60 dark:text-purple-200'
                          : 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200'
                      }`}
                    >
                      <td className="px-4 py-4 text-center font-mono">50</td>
                      <td className="px-4 py-4 uppercase tracking-wide">
                        10. TỔNG LỢI NHUẬN RÒNG (50 = 30 + 31 - 32)
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-base">
                        {formatCurrency(netProfit)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm">{netMarginPct.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visual Charts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* PnL Structure Bar Chart */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-emerald-500" />
                  Cấu Trúc Tài Chính & Lợi Nhuận
                </h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pnlChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                      <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(val) => `${val / 1000000}M`} />
                      <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                      <Bar dataKey="Số Tiền" radius={[8, 8, 0, 0]}>
                        {pnlChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* OPEX Breakdown Pie Chart */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <PieIcon className="h-5 w-5 text-amber-500" />
                  Phân Loại Chi Phí Hoạt Động (OPEX)
                </h3>
                {opexPieData.length === 0 ? (
                  <div className="py-20 text-center text-sm text-gray-400">
                    🎉 Không phát sinh chi phí vận hành nào trong khoảng thời gian này.
                  </div>
                ) : (
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={opexPieData}
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          dataKey="value"
                          label={({ name, percent }: any) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                        >
                          {opexPieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Print Signatures Block - Visible ONLY when Printing/Exporting PDF */}
            <div className="hidden print:grid grid-cols-3 gap-8 pt-12 text-center text-xs text-black">
              <div>
                <p className="font-bold uppercase">NGƯỜI LẬP BẢNG BÁO CÁO</p>
                <p className="text-[10px] text-gray-500 italic mb-16">(Ký & ghi rõ họ tên)</p>
              </div>
              <div>
                <p className="font-bold uppercase">KẾ TOÁN TRƯỞNG</p>
                <p className="text-[10px] text-gray-500 italic mb-16">(Ký & ghi rõ họ tên)</p>
              </div>
              <div>
                <p className="font-bold uppercase">GIÁM ĐỐC / CHỦ CỬA HÀNG</p>
                <p className="text-[10px] text-gray-500 italic mb-16">(Ký, đóng dấu & ghi rõ họ tên)</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INVENTORY & SALES STATS */}
        {activeReportTab === 'inventory' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Doanh Thu Bán Hàng Xuất Kho</span>
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(grossSalesRevenue)}
                </p>
                <span className="text-[11px] text-gray-400">
                  {filteredInventory.filter((t) => t.type === 'export').length} phiếu xuất kho
                </span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Giá Vốn Hàng Đã Bán (COGS)</span>
                  <TrendingUp className="h-5 w-5 text-rose-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(calculatedCOGS)}
                </p>
                <span className="text-[11px] text-gray-400">Giá vốn thực tế nhập kho</span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Lợi Nhuận Gộp Kho</span>
                  <Package className="h-5 w-5 text-blue-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(grossProfit)}
                </p>
                <span className="text-[11px] text-gray-400">Doanh thu thuần - COGS</span>
              </div>
            </div>

            {/* Top Selling Products List */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">
                Top 5 Sản Phẩm Xuất Bán Chạy Nhất ({getTimeRangeText()})
              </h3>
              {topProductsData.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  Chưa có dữ liệu bán hàng trong khoảng thời gian này.
                </div>
              ) : (
                <div className="space-y-3">
                  {topProductsData.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-gray-50 p-3.5 dark:bg-gray-800"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 font-bold text-xs text-white">
                          #{idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {item.quantity} sản phẩm
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CASHFLOW & FINANCIAL CASHBOOK */}
        {activeReportTab === 'cashflow' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Tổng Thu Thực Sổ Quỹ</span>
                  <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(filteredFinances.filter((f) => f.type === 'income').reduce((s, f) => s + f.amount, 0))}
                </p>
                <span className="text-[11px] text-gray-400">Tất cả phiếu thu thực tế</span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Tổng Chi Thực Sổ Quỹ</span>
                  <ArrowDownLeft className="h-5 w-5 text-rose-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(filteredFinances.filter((f) => f.type === 'expense').reduce((s, f) => s + f.amount, 0))}
                </p>
                <span className="text-[11px] text-gray-400">Tất cả phiếu chi thực tế</span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Dòng Tiền Thuần (Net Cashflow)</span>
                  <CircleDollarSign className="h-5 w-5 text-blue-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(
                    filteredFinances.filter((f) => f.type === 'income').reduce((s, f) => s + f.amount, 0) -
                      filteredFinances.filter((f) => f.type === 'expense').reduce((s, f) => s + f.amount, 0)
                  )}
                </p>
                <span className="text-[11px] text-gray-400">Chênh lệch Dòng tiền Thực Thu - Thực Chi</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DEBT MANAGEMENT REPORTS */}
        {activeReportTab === 'debts' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-400">
                  <span className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5" />
                    Tổng Nợ Phải Thu (Khách Hàng Nợ Cửa Hàng)
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-blue-700 dark:text-blue-300">
                  {formatCurrency(totalCustomerDebt)}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Khoản tiền chưa thu đủ từ các đơn hàng.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-400">
                  <span className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Tổng Nợ Phải Trả (Nợ Nhà Cung Cấp)
                  </span>
                </div>
                <p className="text-3xl font-extrabold text-amber-700 dark:text-amber-300">
                  {formatCurrency(totalSupplierDebt)}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Khoản tiền chưa thanh toán đủ cho đơn mua nhập hàng.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Danh Sách Công Nợ Đang Theo Dõi ({activeDebts.length})
                </h3>
                <button
                  onClick={() => setActiveTab('financials')}
                  className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm"
                >
                  Quản Lý Sổ Nợ <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {activeDebts.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">
                  🎉 Không có khoản công nợ nào đang tồn tại.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-3">Đối tượng</th>
                        <th className="px-4 py-3">Phân loại</th>
                        <th className="px-4 py-3">Tổng nợ ban đầu</th>
                        <th className="px-4 py-3">Đã trả</th>
                        <th className="px-4 py-3">Còn nợ</th>
                        <th className="px-4 py-3 text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {activeDebts.map((d) => (
                        <tr key={d.id}>
                          <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{d.partyName}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded px-2 py-0.5 font-semibold text-[10px] ${
                                d.partyType === 'customer'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {d.partyType === 'customer' ? 'Khách nợ' : 'Nợ NCC'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono">{formatCurrency(d.totalDebt)}</td>
                          <td className="px-4 py-3 font-mono text-emerald-600">{formatCurrency(d.paidAmount)}</td>
                          <td className="px-4 py-3 font-mono font-bold text-rose-600">{formatCurrency(d.remainingDebt)}</td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                d.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                  : d.status === 'partial'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {d.status === 'paid' ? 'Đã trả đủ' : d.status === 'partial' ? 'Trả 1 phần' : 'Chưa trả'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
