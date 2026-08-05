import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { exportElementToPDF } from '../services/pdfService';
import { useUIStore } from '../store/useUIStore';
import {
  BarChart3,
  Download,
  Calendar,
  TrendingUp,
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
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#ec4899', '#f59e0b', '#8b5cf6', '#06b6d4'];

type ReportTab = 'inventory' | 'cashflow' | 'debts';

export const ReportsPage: React.FC = () => {
  const { showToast, setActiveTab } = useUIStore();
  const [activeReportTab, setActiveReportTab] = useState<ReportTab>('inventory');
  const [timeRange, setTimeRange] = useState<'today' | '7days' | 'month'>('7days');

  // IndexedDB Live Queries
  const inventoryTransactions = useLiveQuery(() => db.inventoryTransactions.toArray(), []) || [];
  const financialTransactions = useLiveQuery(() => db.financialTransactions.toArray(), []) || [];
  const debts = useLiveQuery(() => db.debts.toArray(), []) || [];
  const products = useLiveQuery(() => db.products.toArray(), []) || [];

  const activeFinances = financialTransactions.filter((f) => !f.isDeleted);
  const activeDebts = debts.filter((d) => !d.isDeleted);
  const activeInventoryTx = inventoryTransactions.filter((t) => !t.isDeleted);

  // Filter Inventory Transactions by date
  const filteredInventory = activeInventoryTx.filter((t) => {
    const tDate = new Date(t.createdAt);
    const now = new Date();
    if (timeRange === 'today') {
      return tDate.toDateString() === now.toDateString();
    } else if (timeRange === '7days') {
      const past7 = new Date();
      past7.setDate(now.getDate() - 7);
      return tDate >= past7;
    } else if (timeRange === 'month') {
      return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  // Filter Financial Cashbook Transactions by date
  const filteredFinances = activeFinances.filter((f) => {
    const fDate = new Date(f.createdAt);
    const now = new Date();
    if (timeRange === 'today') {
      return fDate.toDateString() === now.toDateString();
    } else if (timeRange === '7days') {
      const past7 = new Date();
      past7.setDate(now.getDate() - 7);
      return fDate >= past7;
    } else if (timeRange === 'month') {
      return fDate.getMonth() === now.getMonth() && fDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  // Unified Revenue & Expenses (Combining Export Sales & Import Purchases with Direct Cashbook Income & Expenses)
  const exportSalesTotal = filteredInventory
    .filter((t) => t.type === 'export')
    .reduce((sum, t) => sum + (t.totalAmount || 0), 0);

  const directIncomes = filteredFinances
    .filter((f) => f.type === 'income' && !f.code.startsWith('PT-EXP-'))
    .reduce((sum, f) => sum + (f.amount || 0), 0);

  const totalExportRevenue = exportSalesTotal + directIncomes;

  const importCostTotal = filteredInventory
    .filter((t) => t.type === 'import')
    .reduce((sum, t) => sum + (t.totalAmount || 0), 0);

  const directExpenses = filteredFinances
    .filter((f) => f.type === 'expense' && !f.code.startsWith('PC-IMP-'))
    .reduce((sum, f) => sum + (f.amount || 0), 0);

  const totalImportCost = importCostTotal + directExpenses;

  const estInventoryProfit = totalExportRevenue - totalImportCost;

  // Cashbook Totals (Linked & Synchronized)
  const cashIncomeTotal = totalExportRevenue;
  const cashExpenseTotal = totalImportCost;
  const netCashFlow = estInventoryProfit;

  // Debts Totals
  const totalCustomerDebt = activeDebts
    .filter((d) => d.partyType === 'customer' && d.status !== 'paid')
    .reduce((sum, d) => sum + (d.remainingDebt || 0), 0);

  const totalSupplierDebt = activeDebts
    .filter((d) => d.partyType === 'supplier' && d.status !== 'paid')
    .reduce((sum, d) => sum + (d.remainingDebt || 0), 0);

  // Bar Chart Data: Inventory Sales vs Costs
  const barChartData = [
    {
      name: 'Doanh Thu & Chi Phí',
      'Tổng Xuất Kho (Doanh Thu)': totalExportRevenue,
      'Tổng Nhập Kho (Chi Phí)': totalImportCost,
      'Lợi Nhuận Gộp': estInventoryProfit > 0 ? estInventoryProfit : 0,
    },
  ];

  // Cashflow Pie Chart Data
  const financeCategoryMap: Record<string, number> = {};
  filteredFinances.forEach((f) => {
    const key = `${f.type === 'income' ? 'Thu' : 'Chi'}: ${f.categoryName}`;
    financeCategoryMap[key] = (financeCategoryMap[key] || 0) + f.amount;
  });

  const cashflowPieData = Object.keys(financeCategoryMap).map((key) => ({
    name: key,
    value: financeCategoryMap[key],
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
    showToast('Đang tạo báo cáo PDF...', 'info');
    await exportElementToPDF('report-container', `Bao_Cao_Tong_Hop_${timeRange}`);
    showToast('Đã xuất báo cáo PDF thành công!', 'success');
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Top Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-500" />
            Báo Cáo & Thống Kê Tổng Hop
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Dữ liệu kết nối trực tiếp giữa **Quản Lý Kho Hàng** và **Quản Lý Tài Chính & Sổ Quỹ**.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Time Filter */}
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900 shadow-sm">
            <button
              onClick={() => setTimeRange('today')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                timeRange === 'today'
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setTimeRange('7days')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                timeRange === '7days'
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              7 ngày qua
            </button>
            <button
              onClick={() => setTimeRange('month')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                timeRange === 'month'
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              Tháng này
            </button>
          </div>

          <button
            onClick={() => setActiveTab('financials')}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
            title="Đến trang Quản lý tài chính & Sổ quỹ"
          >
            <Wallet className="h-4 w-4" />
            Đến Sổ Quỹ & Công Nợ
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-sm"
          >
            <Download className="h-4 w-4" />
            Xuất PDF
          </button>
        </div>
      </div>

      {/* Sub-Tabs for Reports */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveReportTab('inventory')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition whitespace-nowrap ${
            activeReportTab === 'inventory'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Package className="h-4 w-4" />
          Thống Kê Kho & Bán Hàng
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
          Sổ Quỹ & Dòng Tiền Thực Thu / Chi
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
          Tổng Quan Công Nợ Khách Hàng & NCC
        </button>
      </div>

      {/* Main Printable / Exportable Content Container */}
      <div id="report-container" className="space-y-6">
        {/* Tab 1: Inventory & Sales Statistics */}
        {activeReportTab === 'inventory' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Doanh Thu Xuất Kho</span>
                  <DollarSign className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totalExportRevenue)}
                </p>
                <span className="text-[11px] text-gray-400">Tổng tiền bán hàng ({filteredInventory.filter(t => t.type === 'export').length} phiếu)</span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Chi Phí Nhập Kho</span>
                  <TrendingUp className="h-5 w-5 text-rose-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(totalImportCost)}
                </p>
                <span className="text-[11px] text-gray-400">Tổng tiền mua hàng ({filteredInventory.filter(t => t.type === 'import').length} phiếu)</span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Ước Tính Lợi Nhuận Gộp</span>
                  <Package className="h-5 w-5 text-blue-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(estInventoryProfit)}
                </p>
                <span className="text-[11px] text-gray-400">Chênh lệch Xuất - Nhập</span>
              </div>
            </div>

            {/* Recharts Visuals */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Bar Chart: Revenue vs Cost */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">
                  So Sánh Doanh Thu Xuất Kho & Chi Phí Nhập Kho
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} tickFormatter={(val) => `${val / 1000000}M`} />
                      <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                      <Legend />
                      <Bar dataKey="Tổng Xuất Kho (Doanh Thu)" fill="#10b981" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="Tổng Nhập Kho (Chi Phí)" fill="#f43f5e" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="Lợi Nhuận Gộp" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Selling Products List */}
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">
                  Top 5 Sản Phẩm Xuất / Bán Chạy Nhất
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
                        className="flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-800"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500 font-bold text-xs text-white">
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
          </div>
        )}

        {/* Tab 2: Cashflow & Financial Cashbook */}
        {activeReportTab === 'cashflow' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Tổng Thu Sổ Quỹ</span>
                  <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(cashIncomeTotal)}
                </p>
                <span className="text-[11px] text-gray-400">Tất cả khoản thu trong sổ quỹ</span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Tổng Chi Sổ Quỹ</span>
                  <ArrowDownLeft className="h-5 w-5 text-rose-500" />
                </div>
                <p className="mt-3 text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(cashExpenseTotal)}
                </p>
                <span className="text-[11px] text-gray-400">Lương, vận hành & nhập hàng</span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Dòng Tiền Thuần (Net Cashflow)</span>
                  <CircleDollarSign className="h-5 w-5 text-blue-500" />
                </div>
                <p className={`mt-3 text-2xl font-bold ${netCashFlow >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600'}`}>
                  {formatCurrency(netCashFlow)}
                </p>
                <span className="text-[11px] text-gray-400">Chênh lệch Thu thực - Chi thực</span>
              </div>
            </div>

            {/* Financial Breakdown & Chart */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <PieIcon className="h-5 w-5 text-blue-500" />
                  Phân Loại Thu Chi Theo Nhóm Danh Mục
                </h3>

                {cashflowPieData.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">
                    Chưa có giao dịch thu chi nào trong khoảng thời gian này.
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={cashflowPieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }: any) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {cashflowPieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: any) => formatCurrency(Number(val))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    Giao Dịch Sổ Quỹ Mới Nhất ({filteredFinances.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('financials')}
                    className="text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400 flex items-center gap-1"
                  >
                    Quản lý Sổ Quỹ <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {filteredFinances.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">
                    Chưa có phiếu thu/chi nào trong sổ quỹ.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
                    {filteredFinances.slice(0, 6).map((item) => (
                      <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">{item.code} - {item.categoryName}</p>
                          <p className="text-gray-400">{item.partyName || 'N/A'} • {new Date(item.createdAt).toLocaleDateString('vi-VN')}</p>
                        </div>
                        <span className={`font-mono font-bold ${item.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Debt Management Reports */}
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
                  Khoản tiền khách hàng chưa thanh toán đủ.
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
                  Khoản tiền cửa hàng còn nợ nhà cung cấp.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Danh Sách Sổ Nợ Đang Theo Dõi ({activeDebts.length})
                </h3>
                <button
                  onClick={() => setActiveTab('financials')}
                  className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm"
                >
                  Quản Lý & Thu Nợ <ArrowRight className="h-3.5 w-3.5" />
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
                        <th className="px-4 py-3">Còn lại</th>
                        <th className="px-4 py-3 text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {activeDebts.map((d) => (
                        <tr key={d.id}>
                          <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{d.partyName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded px-2 py-0.5 font-semibold text-[10px] ${d.partyType === 'customer' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                              {d.partyType === 'customer' ? 'Khách nợ' : 'Nợ NCC'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono">{formatCurrency(d.totalDebt)}</td>
                          <td className="px-4 py-3 font-mono text-emerald-600">{formatCurrency(d.paidAmount)}</td>
                          <td className="px-4 py-3 font-mono font-bold text-rose-600">{formatCurrency(d.remainingDebt)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${d.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : d.status === 'partial' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'}`}>
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
