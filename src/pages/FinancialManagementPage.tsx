import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  FinancialTransaction,
  FinancialType,
  FinancialCategory,
  PaymentMethod,
  DebtRecord,
} from '../types/inventory';
import { useUIStore } from '../store/useUIStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { notifyFinancialTransaction } from '../services/telegramService';
import { enqueueSyncItem } from '../services/syncEngine';
import { exportElementToPDF } from '../services/pdfService';
import { numberToVietnameseWords } from '../services/numberToWords';
import { exportDebtsToExcel } from '../services/excelService';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  CircleDollarSign,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  FileText,
  CreditCard,
  Building,
  UserCheck,
  AlertCircle,
  PieChart,
  BarChart3,
  Printer,
  Download,
  Phone,
  MapPin,
  Calendar,
  History as HistoryIcon,
  FileSpreadsheet,
  User,
  ArrowRight,
  Percent,
  ShieldCheck,
  ExternalLink,
  Tag,
  Eye,
} from 'lucide-react';

export const FinancialManagementPage: React.FC = () => {
  const { showToast, setActiveTab } = useUIStore();
  const { storeName, phone, address } = useSettingsStore();

  const [activeSubTab, setActiveSubTab] = useState<'cashbook' | 'debts' | 'reports'>('cashbook');
  const [printedReceipt, setPrintedReceipt] = useState<FinancialTransaction | null>(null);

  // IndexedDB Live Queries
  const allFinances = useLiveQuery(() => db.financialTransactions.reverse().toArray(), []) || [];
  const finances = allFinances.filter((f) => !f.isDeleted);

  const allDebts = useLiveQuery(() => db.debts.reverse().toArray(), []) || [];
  const debts = allDebts.filter((d) => !d.isDeleted);

  const inventoryTransactions = useLiveQuery(() => db.inventoryTransactions.toArray(), []) || [];

  // State: Add Financial Transaction Form
  const [finType, setFinType] = useState<FinancialType>('income');
  const [finCategory, setFinCategory] = useState<FinancialCategory>('sale');
  const [finAmount, setFinAmount] = useState<number>(0);
  const [finPartyName, setFinPartyName] = useState('');
  const [finMethod, setFinMethod] = useState<PaymentMethod>('cash');
  const [finNote, setFinNote] = useState('');

  // State: Add Debt Form
  const [debtPartyName, setDebtPartyName] = useState('');
  const [debtPartyType, setDebtPartyType] = useState<'customer' | 'supplier'>('customer');
  const [debtPhone, setDebtPhone] = useState('');
  const [debtAddress, setDebtAddress] = useState('');
  const [debtAmount, setDebtAmount] = useState<number>(0);
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtTxCode, setDebtTxCode] = useState('');
  const [debtNote, setDebtNote] = useState('');

  // State: Debt Filters & Modals
  const [debtFilterTab, setDebtFilterTab] = useState<'all' | 'customer' | 'supplier' | 'unpaid' | 'paid'>('all');
  const [debtSearch, setDebtSearch] = useState('');
  const [debtSortBy, setDebtSortBy] = useState<'remaining_desc' | 'remaining_asc' | 'date_desc' | 'name_asc'>('remaining_desc');

  // Modals for Detail History & Printable Debt Statement
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [selectedDebtDetail, setSelectedDebtDetail] = useState<DebtRecord | null>(null);
  const [printedStatement, setPrintedStatement] = useState<DebtRecord | null>(null);
  const [repayAmount, setRepayAmount] = useState<number>(0);
  const [repayMethod, setRepayMethod] = useState<PaymentMethod>('cash');
  const [repayNote, setRepayNote] = useState('');

  // Helper Formatter
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  };

  // Unified Financial Statistics (Linked Inventory Sales/Imports + Direct Cashbook Entries)
  const exportSalesTotal = inventoryTransactions
    .filter((t) => !t.isDeleted && t.type === 'export')
    .reduce((sum, t) => sum + (t.totalAmount || 0), 0);

  const directIncomes = finances
    .filter((f) => f.type === 'income' && !f.code.startsWith('PT-EXP-'))
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const totalIncome = exportSalesTotal + directIncomes;

  const importCostTotal = inventoryTransactions
    .filter((t) => !t.isDeleted && t.type === 'import')
    .reduce((sum, t) => sum + (t.totalAmount || 0), 0);

  const directExpenses = finances
    .filter((f) => f.type === 'expense' && !f.code.startsWith('PC-IMP-'))
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const totalExpense = importCostTotal + directExpenses;

  const netBalance = totalIncome - totalExpense;

  // Calculated Statistics for Debt Tab
  const totalCustomerOriginalDebt = debts
    .filter((d) => d.partyType === 'customer')
    .reduce((sum, d) => sum + (d.totalDebt || 0), 0);

  const totalCustomerPaidDebt = debts
    .filter((d) => d.partyType === 'customer')
    .reduce((sum, d) => sum + (d.paidAmount || 0), 0);

  const totalCustomerRemainingDebt = debts
    .filter((d) => d.partyType === 'customer')
    .reduce((sum, d) => sum + (d.remainingDebt || 0), 0);

  const customerCollectionRate = totalCustomerOriginalDebt > 0
    ? Math.round((totalCustomerPaidDebt / totalCustomerOriginalDebt) * 100)
    : 100;

  const totalSupplierOriginalDebt = debts
    .filter((d) => d.partyType === 'supplier')
    .reduce((sum, d) => sum + (d.totalDebt || 0), 0);

  const totalSupplierPaidDebt = debts
    .filter((d) => d.partyType === 'supplier')
    .reduce((sum, d) => sum + (d.paidAmount || 0), 0);

  const totalSupplierRemainingDebt = debts
    .filter((d) => d.partyType === 'supplier')
    .reduce((sum, d) => sum + (d.remainingDebt || 0), 0);

  const netDebtBalance = totalCustomerRemainingDebt - totalSupplierRemainingDebt;

  // Auto-complete list of party names from sales, imports, and cashbook
  const partySuggestions = Array.from(
    new Set([
      ...inventoryTransactions.map((t) => t.customerSupplierName).filter(Boolean),
      ...finances.map((f) => f.partyName).filter(Boolean),
      ...debts.map((d) => d.partyName).filter(Boolean),
    ])
  ) as string[];

  // Filtered & Sorted Debt Records
  const filteredDebts = debts
    .filter((d) => {
      // Filter tab
      if (debtFilterTab === 'customer' && d.partyType !== 'customer') return false;
      if (debtFilterTab === 'supplier' && d.partyType !== 'supplier') return false;
      if (debtFilterTab === 'unpaid' && d.status === 'paid') return false;
      if (debtFilterTab === 'paid' && d.status !== 'paid') return false;

      // Search
      if (debtSearch.trim()) {
        const query = debtSearch.toLowerCase();
        const matchName = d.partyName.toLowerCase().includes(query);
        const matchPhone = d.phone && d.phone.toLowerCase().includes(query);
        const matchNote = d.note && d.note.toLowerCase().includes(query);
        const matchCode = d.transactionCode && d.transactionCode.toLowerCase().includes(query);
        if (!matchName && !matchPhone && !matchNote && !matchCode) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (debtSortBy === 'remaining_desc') return b.remainingDebt - a.remainingDebt;
      if (debtSortBy === 'remaining_asc') return a.remainingDebt - b.remainingDebt;
      if (debtSortBy === 'date_desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (debtSortBy === 'name_asc') return a.partyName.localeCompare(b.partyName);
      return 0;
    });

  // Handle Add Financial Transaction
  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finAmount || finAmount <= 0) {
      showToast('Vui lòng nhập Số tiền giao dịch hợp lệ!', 'warning');
      return;
    }

    const codePrefix = finType === 'income' ? 'PT' : 'PC';
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    const code = `${codePrefix}-${dateStr}-${rand}`;

    const catNameMap: Record<FinancialCategory, string> = {
      sale: 'Bán hàng',
      purchase: 'Nhập hàng',
      operation: 'Chi phí vận hành',
      salary: 'Lương nhân viên',
      other: 'Khác',
    };

    const newTransaction: FinancialTransaction = {
      id: `fin-${Date.now()}`,
      code,
      type: finType,
      category: finCategory,
      categoryName: catNameMap[finCategory] || 'Khác',
      amount: Number(finAmount),
      partyName: finPartyName.trim(),
      paymentMethod: finMethod,
      note: finNote.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
      isDeleted: false,
    };

    try {
      await db.financialTransactions.add(newTransaction);
      await enqueueSyncItem('financialTransactions', 'create', newTransaction.id, newTransaction);
      notifyFinancialTransaction(newTransaction).catch((err) =>
        console.error('Telegram financial notification error:', err)
      );
      setPrintedReceipt(newTransaction);
      showToast(`Đã thêm phiếu ${code} thành công!`, 'success');
      setFinAmount(0);
      setFinPartyName('');
      setFinNote('');
    } catch (err) {
      console.error('Error adding financial transaction:', err);
      showToast('Lỗi khi ghi nhận phiếu thu/chi!', 'error');
    }
  };

  // Handle Add Debt Record
  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtPartyName.trim() || !debtAmount || debtAmount <= 0) {
      showToast('Vui lòng điền tên đối tác và số tiền nợ hợp lệ!', 'warning');
      return;
    }

    const now = new Date().toISOString();
    const newDebt: DebtRecord = {
      id: `debt-${Date.now()}`,
      partyName: debtPartyName.trim(),
      partyType: debtPartyType,
      phone: debtPhone.trim() || undefined,
      address: debtAddress.trim() || undefined,
      totalDebt: Number(debtAmount),
      paidAmount: 0,
      remainingDebt: Number(debtAmount),
      dueDate: debtDueDate || undefined,
      transactionCode: debtTxCode.trim() || undefined,
      note: debtNote.trim() || undefined,
      status: 'unpaid',
      history: [],
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    try {
      await db.debts.add(newDebt);
      await enqueueSyncItem('debts', 'create', newDebt.id, newDebt);
      showToast(`Đã ghi nhận công nợ mới cho "${newDebt.partyName}"`, 'success');
      setDebtPartyName('');
      setDebtPhone('');
      setDebtAddress('');
      setDebtAmount(0);
      setDebtDueDate('');
      setDebtTxCode('');
      setDebtNote('');
    } catch (err) {
      console.error('Error adding debt:', err);
      showToast('Lỗi khi lưu công nợ!', 'error');
    }
  };

  // Handle Repay Debt
  const handleRepayDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt || !repayAmount || repayAmount <= 0) return;

    try {
      const now = new Date().toISOString();
      const newPaid = selectedDebt.paidAmount + Number(repayAmount);
      const newRemaining = Math.max(0, selectedDebt.totalDebt - newPaid);
      const newStatus = newRemaining === 0 ? 'paid' : 'partial';

      // 1. Generate Receipt Code in Cashbook (Sổ Quỹ)
      const codePrefix = selectedDebt.partyType === 'customer' ? 'PT' : 'PC';
      const code = `${codePrefix}-TN-${Date.now().toString().slice(-5)}`;

      const newHistoryEntry = {
        id: `pmt-${Date.now()}`,
        amount: Number(repayAmount),
        paymentMethod: repayMethod,
        note: repayNote.trim() || `Thanh toán công nợ`,
        createdAt: now,
        receiptCode: code,
      };

      const updatedHistory = [...(selectedDebt.history || []), newHistoryEntry];

      const updatedDebt: DebtRecord = {
        ...selectedDebt,
        paidAmount: newPaid,
        remainingDebt: newRemaining,
        status: newStatus,
        history: updatedHistory,
        updatedAt: now,
      };

      // Update debt record in Dexie
      await db.debts.update(selectedDebt.id, {
        paidAmount: newPaid,
        remainingDebt: newRemaining,
        status: newStatus,
        history: updatedHistory,
        updatedAt: now,
      });
      await enqueueSyncItem('debts', 'update', selectedDebt.id, updatedDebt);

      // 2. Automatically record entry in Cashbook Sổ Quỹ
      const finRecord: FinancialTransaction = {
        id: `fin-debt-${Date.now()}`,
        code,
        type: selectedDebt.partyType === 'customer' ? 'income' : 'expense',
        category: selectedDebt.partyType === 'customer' ? 'sale' : 'purchase',
        categoryName: selectedDebt.partyType === 'customer' ? 'Thu nợ khách hàng' : 'Trả nợ NCC',
        amount: Number(repayAmount),
        partyName: selectedDebt.partyName,
        paymentMethod: repayMethod,
        note: repayNote.trim() || `Thanh toán nợ cho đối tác ${selectedDebt.partyName}`,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
        isDeleted: false,
      };

      await db.financialTransactions.add(finRecord);
      await enqueueSyncItem('financialTransactions', 'create', finRecord.id, finRecord);
      notifyFinancialTransaction(finRecord).catch((err) =>
        console.error('Telegram debt payment notification error:', err)
      );

      showToast(`Đã ghi nhận thanh toán ${formatCurrency(repayAmount)} & tạo phiếu ${code}!`, 'success');

      setPrintedReceipt(finRecord);
      setSelectedDebt(null);
      setRepayAmount(0);
      setRepayNote('');
    } catch (err) {
      console.error('Repay debt error:', err);
      showToast('Lỗi khi cập nhật thanh toán nợ!', 'error');
    }
  };

  // Handle Delete Debt Record
  const handleDeleteDebt = async (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc muốn xóa hồ sơ công nợ của "${name}"?`)) {
      try {
        await db.debts.delete(id);
        await enqueueSyncItem('debts', 'delete', id, null);
        showToast(`Đã xóa công nợ của "${name}"`, 'info');
      } catch (err) {
        showToast('Lỗi khi xóa công nợ!', 'error');
      }
    }
  };

  // Delete Transaction
  const handleDeleteTransaction = async (id: string, code: string) => {
    if (window.confirm(`Xóa phiếu ${code}?`)) {
      await db.financialTransactions.delete(id);
      showToast(`Đã xóa phiếu ${code}`, 'info');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2 tracking-tight">
            <Wallet className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            Quản Lý Tài Chính & Sổ Quỹ
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Sổ quỹ thu chi hàng ngày, quản lý công nợ Phải Thu / Phải Trả và báo cáo KQKD ròng.
          </p>
        </div>

        <button
          onClick={() => setActiveTab('reports')}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition"
        >
          <BarChart3 className="h-4 w-4" />
          Báo Cáo & Thống Kê Tổng Hợp
        </button>
      </div>

      {/* Realtime Financial Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300">
            <span>TỔNG THU</span>
            <ArrowUpRight className="h-4 w-4" />
          </div>
          <div className="text-xl font-black text-emerald-900 dark:text-emerald-100">
            {formatCurrency(totalIncome)}
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Doanh thu & Thu tiền khác</div>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-rose-700 dark:text-rose-300">
            <span>TỔNG CHI</span>
            <ArrowDownLeft className="h-4 w-4" />
          </div>
          <div className="text-xl font-black text-rose-900 dark:text-rose-100">
            {formatCurrency(totalExpense)}
          </div>
          <div className="text-[10px] text-rose-600 dark:text-rose-400">Chi nhập hàng & Vận hành</div>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-300">
            <span>TỒN QUỸ RÒNG</span>
            <CircleDollarSign className="h-4 w-4" />
          </div>
          <div className={`text-xl font-black ${netBalance >= 0 ? 'text-blue-900 dark:text-blue-100' : 'text-rose-600'}`}>
            {formatCurrency(netBalance)}
          </div>
          <div className="text-[10px] text-blue-600 dark:text-blue-400">Tiền mặt & Ngân hàng</div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-amber-700 dark:text-amber-300">
            <span>CÔNG NỢ PHẢI THU</span>
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="text-xl font-black text-amber-900 dark:text-amber-100">
            {formatCurrency(totalCustomerRemainingDebt)}
          </div>
          <div className="text-[10px] text-amber-600 dark:text-amber-400">Khách hàng chưa thanh toán</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex rounded-2xl bg-gray-100 p-1.5 dark:bg-gray-800/80 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('cashbook')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'cashbook'
              ? 'bg-white text-emerald-700 shadow-md dark:bg-gray-900 dark:text-emerald-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <Wallet className="h-4 w-4" />
          Sổ Quỹ Thu / Chi Hàng Ngày ({finances.length})
        </button>

        <button
          onClick={() => setActiveSubTab('debts')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'debts'
              ? 'bg-white text-emerald-700 shadow-md dark:bg-gray-900 dark:text-emerald-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          Quản Lý Công Nợ ({debts.length})
        </button>

        <button
          onClick={() => setActiveSubTab('reports')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold transition whitespace-nowrap ${
            activeSubTab === 'reports'
              ? 'bg-white text-emerald-700 shadow-md dark:bg-gray-900 dark:text-emerald-300'
              : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <PieChart className="h-4 w-4" />
          Báo Cáo Lãi Lỗ & Dòng Tiền
        </button>
      </div>

      {/* TAB 1: SỔ QUỸ THU / CHI */}
      {activeSubTab === 'cashbook' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Form Create Transaction */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <Plus className="h-4 w-4 text-emerald-600" />
              Lập Phiếu Thu / Phiếu Chi Mới
            </h3>

            <form onSubmit={handleAddTransaction} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Loại Giao Dịch *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFinType('income')}
                    className={`rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      finType === 'income'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    PHIẾU THU
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinType('expense')}
                    className={`rounded-xl py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      finType === 'expense'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <ArrowDownLeft className="h-4 w-4" />
                    PHIẾU CHI
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Phân Loại Thu Chi *
                </label>
                <select
                  value={finCategory}
                  onChange={(e) => setFinCategory(e.target.value as FinancialCategory)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white font-medium"
                >
                  <option value="sale">Bán hàng / Thu tiền khách</option>
                  <option value="purchase">Nhập hàng / Trả nợ NCC</option>
                  <option value="operation">Chi phí vận hành (Điện, nước, mặt bằng)</option>
                  <option value="salary">Chi trả Lương nhân viên</option>
                  <option value="other">Thu / Chi khác</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Số Tiền (VNĐ) *
                </label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={finAmount || ''}
                  onChange={(e) => setFinAmount(Number(e.target.value))}
                  placeholder="VD: 500000"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:border-gray-700 dark:bg-gray-800 dark:text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Phương Thức Thanh Toán *
                </label>
                <select
                  value={finMethod}
                  onChange={(e) => setFinMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="cash">💵 Tiền Mặt</option>
                  <option value="bank_transfer">💳 Chuyển Khoản Ngân Hàng</option>
                  <option value="other">Khác</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Tên Người Giao Dịch / Đối Tác
                </label>
                <input
                  type="text"
                  value={finPartyName}
                  onChange={(e) => setFinPartyName(e.target.value)}
                  placeholder="VD: Anh Minh, Cty Điện Lực..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Ghi Chú Diễn Giải
                </label>
                <input
                  type="text"
                  value={finNote}
                  onChange={(e) => setFinNote(e.target.value)}
                  placeholder="Ghi chú thêm..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold text-white shadow-md ${
                  finType === 'income' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                <Plus className="h-4 w-4" />
                {finType === 'income' ? 'Tạo Phiếu Thu' : 'Tạo Phiếu Chi'}
              </button>
            </form>
          </div>

          {/* Cash Book Log Table */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
                <FileText className="h-4 w-4 text-emerald-600" />
                Nhật Ký Sổ Quỹ Thu Chi
              </h3>

              {finances.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400 italic">
                  Chưa có phiếu thu/chi nào được ghi nhận.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold uppercase text-[11px]">
                        <th className="py-2.5 px-3">MÃ PHIẾU</th>
                        <th className="py-2.5 px-3">LOẠI THU/CHI</th>
                        <th className="py-2.5 px-3">ĐỐI TÁC</th>
                        <th className="py-2.5 px-3 text-center">PTTT</th>
                        <th className="py-2.5 px-3 text-right">SỐ TIỀN</th>
                        <th className="py-2.5 px-3 text-right">THAO TÁC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                      {finances.map((f) => (
                        <tr key={f.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                          <td className="py-2.5 px-3 font-mono font-bold text-purple-600">{f.code}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                f.type === 'income'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {f.type === 'income' ? 'THU' : 'CHI'} - {f.categoryName}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold">{f.partyName || 'Cửa hàng'}</td>
                          <td className="py-2.5 px-3 text-center font-medium">
                            {f.paymentMethod === 'cash' ? 'Tiền mặt' : 'Ngân hàng'}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold text-sm ${
                              f.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {f.type === 'income' ? '+' : '-'}{formatCurrency(f.amount)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setPrintedReceipt(f)}
                                className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900 transition"
                                title="Xem & In phiếu thu/chi"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                In Phiếu
                              </button>
                              <button
                                onClick={() => handleDeleteTransaction(f.id, f.code)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 transition"
                                title="Xóa phiếu"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: QUẢN LÝ CÔNG NỢ */}
      {activeSubTab === 'debts' && (
        <div className="space-y-6">
          {/* Top KPI Cards for Debt Management */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Phải Thu */}
            <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/40 p-5 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  📈 Nợ Phải Thu (Khách Nợ)
                </span>
                <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-amber-700 dark:text-amber-400">
                {formatCurrency(totalCustomerRemainingDebt)}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-amber-600/80 dark:text-amber-400/70">
                <span>Tổng nợ gốc: {formatCurrency(totalCustomerOriginalDebt)}</span>
                <span className="font-bold">{customerCollectionRate}% đã thu</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900/50">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, customerCollectionRate))}%` }}
                />
              </div>
            </div>

            {/* KPI 2: Phải Trả */}
            <div className="relative overflow-hidden rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50 to-indigo-50/40 p-5 shadow-sm dark:border-purple-900/40 dark:from-purple-950/30 dark:to-indigo-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                  📉 Nợ Phải Trả (Nợ NCC)
                </span>
                <div className="rounded-xl bg-purple-500/10 p-2 text-purple-600 dark:text-purple-400">
                  <TrendingDown className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-purple-700 dark:text-purple-400">
                {formatCurrency(totalSupplierRemainingDebt)}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-purple-600/80 dark:text-purple-400/70">
                <span>Gốc: {formatCurrency(totalSupplierOriginalDebt)}</span>
                <span>Đã trả: {formatCurrency(totalSupplierPaidDebt)}</span>
              </div>
            </div>

            {/* KPI 3: Net Balance */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/40 p-5 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-teal-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                  ⚖️ Cân Bằng Công Nợ Ròng
                </span>
                <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>
              <div className={`mt-3 text-2xl font-black ${netDebtBalance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                {formatCurrency(netDebtBalance)}
              </div>
              <div className="mt-2 text-[11px] text-emerald-600/80 dark:text-emerald-400/70">
                {netDebtBalance >= 0 ? 'Phần chênh lệch Phải Thu > Phải Trả' : 'Đang nợ nhà cung cấp nhiều hơn thu khách'}
              </div>
            </div>

            {/* KPI 4: Total Active Debtors */}
            <div className="relative overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-cyan-50/40 p-5 shadow-sm dark:border-blue-900/40 dark:from-blue-950/30 dark:to-cyan-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                  📊 Hồ Sơ Đang Theo Dõi
                </span>
                <div className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                  <UserCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-blue-700 dark:text-blue-400">
                {debts.filter((d) => d.remainingDebt > 0).length} <span className="text-xs font-semibold text-gray-500">đối tác</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-blue-600/80 dark:text-blue-400/70">
                <span>Tổng hồ sơ: {debts.length}</span>
                <span>Hoàn tất: {debts.filter((d) => d.status === 'paid').length}</span>
              </div>
            </div>
          </div>

          {/* Action Toolbar & Filters */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={debtSearch}
                onChange={(e) => setDebtSearch(e.target.value)}
                placeholder="Tìm theo tên đối tác, SĐT, địa chỉ, mã đơn..."
                className="w-full rounded-xl border border-gray-300 bg-gray-50 pl-10 pr-4 py-2 text-xs font-medium text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setDebtFilterTab('all')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  debtFilterTab === 'all'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                Tất Cả ({debts.length})
              </button>

              <button
                onClick={() => setDebtFilterTab('customer')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  debtFilterTab === 'customer'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                Khách Nợ (Phải Thu)
              </button>

              <button
                onClick={() => setDebtFilterTab('supplier')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  debtFilterTab === 'supplier'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-purple-50 text-purple-800 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300'
                }`}
              >
                Nợ NCC (Phải Trả)
              </button>

              <button
                onClick={() => setDebtFilterTab('unpaid')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  debtFilterTab === 'unpaid'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300'
                }`}
              >
                Còn Nợ ({debts.filter((d) => d.remainingDebt > 0).length})
              </button>

              <button
                onClick={() => setDebtFilterTab('paid')}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  debtFilterTab === 'paid'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                Đã Hoàn Tất
              </button>
            </div>

            {/* Sort & Export Actions */}
            <div className="flex items-center gap-2">
              <select
                value={debtSortBy}
                onChange={(e) => setDebtSortBy(e.target.value as any)}
                className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="remaining_desc">Nợ nhiều nhất</option>
                <option value="remaining_asc">Nợ ít nhất</option>
                <option value="date_desc">Mới nhất</option>
                <option value="name_asc">Tên A-Z</option>
              </select>

              <button
                onClick={() => exportDebtsToExcel(filteredDebts)}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                title="Xuất file Excel danh sách công nợ"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden sm:inline">Xuất Excel</span>
              </button>

              <button
                onClick={() => setActiveSubTab('reports')}
                className="flex items-center gap-1.5 rounded-xl bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300"
                title="Đến trang báo cáo phân tích công nợ"
              >
                <PieChart className="h-4 w-4" />
                <span className="hidden sm:inline">Báo Cáo</span>
              </button>
            </div>
          </div>

          {/* Form & Main Content Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Form Create Debt */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
                <Plus className="h-4 w-4 text-purple-600" />
                Ghi Nhận Khoản Nợ Mới
              </h3>

              <form onSubmit={handleAddDebt} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Loại Đối Tác & Công Nợ *
                  </label>
                  <select
                    value={debtPartyType}
                    onChange={(e) => setDebtPartyType(e.target.value as any)}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="customer">📈 Phải Thu (Khách Hàng Nợ Cửa Hàng)</option>
                    <option value="supplier">📉 Phải Trả (Cửa Hàng Nợ Nhà Cung Cấp)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Tên Khách Hàng / Nhà Cung Cấp *
                  </label>
                  <input
                    type="text"
                    required
                    list="party-suggestions"
                    value={debtPartyName}
                    onChange={(e) => setDebtPartyName(e.target.value)}
                    placeholder="VD: Anh Minh, Cty Dược Phẩm..."
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <datalist id="party-suggestions">
                    {partySuggestions.map((name, i) => (
                      <option key={i} value={name} />
                    ))}
                  </datalist>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Số Điện Thoại
                    </label>
                    <input
                      type="text"
                      value={debtPhone}
                      onChange={(e) => setDebtPhone(e.target.value)}
                      placeholder="0987..."
                      className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Mã Đơn / Phiếu
                    </label>
                    <input
                      type="text"
                      value={debtTxCode}
                      onChange={(e) => setDebtTxCode(e.target.value)}
                      placeholder="PX-2026..."
                      className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Số Tiền Nợ (VNĐ) *
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    required
                    value={debtAmount || ''}
                    onChange={(e) => setDebtAmount(Number(e.target.value))}
                    placeholder="VD: 1500000"
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-amber-700 dark:border-gray-700 dark:bg-gray-800 dark:text-amber-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Địa Chỉ
                    </label>
                    <input
                      type="text"
                      value={debtAddress}
                      onChange={(e) => setDebtAddress(e.target.value)}
                      placeholder="Quận/TP..."
                      className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Hạn Thanh Toán
                    </label>
                    <input
                      type="date"
                      value={debtDueDate}
                      onChange={(e) => setDebtDueDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Ghi Chú Công Nợ
                  </label>
                  <input
                    type="text"
                    value={debtNote}
                    onChange={(e) => setDebtNote(e.target.value)}
                    placeholder="Lý do ghi nợ, thỏa thuận..."
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-500 transition"
                >
                  <Plus className="h-4 w-4" />
                  Lưu Khoản Nợ Mới
                </button>
              </form>
            </div>

            {/* Debt List Table */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
                <div className="flex justify-between items-center border-b pb-3 border-gray-100 dark:border-gray-800">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-purple-600" />
                    Sổ Công Nợ Chi Tiết ({filteredDebts.length})
                  </h3>
                  <span className="text-[11px] font-medium text-gray-400">
                    Tự động đồng bộ với Sổ Quỹ Thu Chi & Báo Cáo
                  </span>
                </div>

                {filteredDebts.length === 0 ? (
                  <div className="py-16 text-center text-xs text-gray-400 italic space-y-2">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                      <CreditCard className="h-6 w-6 text-gray-400" />
                    </div>
                    <p>Không tìm thấy khoản công nợ nào phù hợp.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold uppercase text-[11px]">
                          <th className="py-3 px-3.5">ĐỐI TÁC</th>
                          <th className="py-3 px-3.5">LOẠI NỢ</th>
                          <th className="py-3 px-3.5 text-right">NỢ GỐC</th>
                          <th className="py-3 px-3.5 text-right">ĐÃ TRẢ</th>
                          <th className="py-3 px-3.5 text-right text-rose-600">CÒN NỢ</th>
                          <th className="py-3 px-3.5 text-center">TRẠNG THÁI</th>
                          <th className="py-3 px-3.5 text-right">THAO TÁC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                        {filteredDebts.map((d) => {
                          const percentPaid = d.totalDebt > 0 ? Math.round((d.paidAmount / d.totalDebt) * 100) : 100;
                          return (
                            <tr key={d.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition">
                              <td className="py-3 px-3.5">
                                <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-extrabold ${
                                    d.partyType === 'customer' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  }`}>
                                    {d.partyName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div>{d.partyName}</div>
                                    {d.phone && <div className="text-[10px] font-normal text-gray-400 flex items-center gap-1"><Phone className="h-3 w-3" />{d.phone}</div>}
                                    {d.transactionCode && <div className="text-[10px] font-mono text-purple-600 dark:text-purple-400">Đơn: {d.transactionCode}</div>}
                                  </div>
                                </div>
                              </td>

                              <td className="py-3 px-3.5">
                                <span
                                  className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                    d.partyType === 'customer'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                      : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  }`}
                                >
                                  {d.partyType === 'customer' ? 'Phải Thu (Khách nợ)' : 'Phải Trả (Nợ NCC)'}
                                </span>
                              </td>

                              <td className="py-3 px-3.5 text-right font-medium">{formatCurrency(d.totalDebt)}</td>
                              <td className="py-3 px-3.5 text-right font-medium text-emerald-600">{formatCurrency(d.paidAmount)}</td>
                              <td className="py-3 px-3.5 text-right font-black text-rose-600 text-sm">{formatCurrency(d.remainingDebt)}</td>

                              <td className="py-3 px-3.5 text-center">
                                <div className="space-y-1">
                                  <span
                                    className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                      d.status === 'paid'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                        : d.status === 'partial'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                    }`}
                                  >
                                    {d.status === 'paid' ? 'Đã Hoàn Tất' : d.status === 'partial' ? `Trả ${percentPaid}%` : 'Chưa Trả'}
                                  </span>
                                  {d.dueDate && (
                                    <div className="text-[10px] text-gray-400 flex items-center justify-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      Hạn: {new Date(d.dueDate).toLocaleDateString('vi-VN')}
                                    </div>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3.5 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {d.remainingDebt > 0 && (
                                    <button
                                      onClick={() => {
                                        setSelectedDebt(d);
                                        setRepayAmount(d.remainingDebt);
                                      }}
                                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                                      title="Thanh toán nợ"
                                    >
                                      Thanh Toán
                                    </button>
                                  )}

                                  <button
                                    onClick={() => setPrintedStatement(d)}
                                    className="rounded-lg bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 transition"
                                    title="In Giấy Báo Nợ / Biên Nhận Đối Soát"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </button>

                                  <button
                                    onClick={() => setSelectedDebtDetail(d)}
                                    className="rounded-lg bg-purple-50 p-1.5 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 transition"
                                    title="Xem Lịch Sử Trả Nợ Từng Đợt"
                                  >
                                    <HistoryIcon className="h-3.5 w-3.5" />
                                  </button>

                                  <button
                                    onClick={() => handleDeleteDebt(d.id, d.partyName)}
                                    className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 transition"
                                    title="Xóa công nợ"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
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
        </div>
      )}

      {/* TAB 3: BÁO CÁO LÃI LỖ & DÒNG TIỀN */}
      {activeSubTab === 'reports' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-6">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
            <PieChart className="h-4 w-4 text-emerald-600" />
            Báo Cáo Kết Quả Kinh Doanh Lãi Lỗ (P&L Statement)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800 space-y-2">
              <div className="text-xs font-bold text-gray-500 uppercase">1. TỔNG DOANH THU</div>
              <div className="text-2xl font-black text-emerald-600">{formatCurrency(totalIncome)}</div>
              <div className="text-[11px] text-gray-400">Ghi nhận từ phiếu thu bán hàng</div>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800 space-y-2">
              <div className="text-xs font-bold text-gray-500 uppercase">2. TỔNG CHI PHÍ</div>
              <div className="text-2xl font-black text-rose-600">{formatCurrency(totalExpense)}</div>
              <div className="text-[11px] text-gray-400">Chi phí nhập hàng & vận hành</div>
            </div>

            <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 space-y-2">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase">3. LỢI NHUẬN RÒNG</div>
              <div className={`text-2xl font-black ${netBalance >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'}`}>
                {formatCurrency(netBalance)}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400">Lãi ròng thực tế tồn quỹ</div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Repay Debt */}
      {selectedDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900 space-y-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-white border-b pb-2 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-600" />
              Thanh Toán Công Nợ: {selectedDebt.partyName}
            </h3>

            <form onSubmit={handleRepayDebt} className="space-y-3.5">
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tổng nợ gốc:</span>
                  <span className="font-bold">{formatCurrency(selectedDebt.totalDebt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Đã thanh toán:</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(selectedDebt.paidAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 border-gray-200 dark:border-gray-700">
                  <span className="font-bold text-gray-700 dark:text-gray-300">Còn nợ lại:</span>
                  <span className="font-black text-rose-600">{formatCurrency(selectedDebt.remainingDebt)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Số Tiền Thanh Toán Lần Này (VNĐ) *
                </label>
                <input
                  type="number"
                  min="1000"
                  max={selectedDebt.remainingDebt}
                  step="1000"
                  required
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:border-gray-700 dark:bg-gray-800 dark:text-emerald-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Phương Thức Thanh Toán *
                </label>
                <select
                  value={repayMethod}
                  onChange={(e) => setRepayMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="cash">💵 Tiền Mặt (Nhập vào Sổ Quỹ Tiền Mặt)</option>
                  <option value="bank_transfer">💳 Chuyển Khoản Ngân Hàng</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Ghi Chú Đợt Trả
                </label>
                <input
                  type="text"
                  value={repayNote}
                  onChange={(e) => setRepayNote(e.target.value)}
                  placeholder="VD: Trả đợt 1, thanh toán qua CK..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDebt(null)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 dark:border-gray-700 dark:text-gray-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition"
                >
                  Xác Nhận Thanh Toán & Tạo Phiếu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal View Debt Payment History Timeline */}
      {selectedDebtDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 space-y-5 border border-gray-200 dark:border-gray-800 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b pb-3 border-gray-200 dark:border-gray-800">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                  <HistoryIcon className="h-5 w-5 text-purple-600" />
                  Lịch Sử Giao Dịch & Trả Nợ: {selectedDebtDetail.partyName}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedDebtDetail.partyType === 'customer' ? 'Khách hàng nợ cửa hàng' : 'Cửa hàng nợ nhà cung cấp'}
                </p>
              </div>
              <button
                onClick={() => setSelectedDebtDetail(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-xl bg-gray-50 p-3.5 dark:bg-gray-800 text-xs text-center">
              <div>
                <div className="text-gray-400 font-bold uppercase text-[10px]">TỔNG NỢ GỐC</div>
                <div className="font-bold text-gray-900 dark:text-white text-sm">{formatCurrency(selectedDebtDetail.totalDebt)}</div>
              </div>
              <div>
                <div className="text-gray-400 font-bold uppercase text-[10px]">ĐÃ THANH TOÁN</div>
                <div className="font-bold text-emerald-600 text-sm">{formatCurrency(selectedDebtDetail.paidAmount)}</div>
              </div>
              <div>
                <div className="text-gray-400 font-bold uppercase text-[10px]">CÒN NỢ LẠI</div>
                <div className="font-black text-rose-600 text-sm">{formatCurrency(selectedDebtDetail.remainingDebt)}</div>
              </div>
            </div>

            {/* History List */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                Nhật Ký Các Đợt Thanh Toán ({selectedDebtDetail.history?.length || 0})
              </h4>

              {!selectedDebtDetail.history || selectedDebtDetail.history.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400 italic">
                  Chưa có đợt thanh toán nào được ghi nhận.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedDebtDetail.history.map((h, index) => (
                    <div
                      key={h.id || index}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800/60 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <span className="font-mono text-purple-600 dark:text-purple-400">{h.receiptCode || `Đợt ${index + 1}`}</span>
                          <span className="text-[10px] rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
                            {h.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500">{h.note}</div>
                        <div className="text-[10px] text-gray-400">{new Date(h.createdAt).toLocaleString('vi-VN')}</div>
                      </div>
                      <div className="font-black text-emerald-600 text-sm">
                        +{formatCurrency(h.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t pt-3 border-gray-200 dark:border-gray-800">
              <button
                onClick={() => {
                  setPrintedStatement(selectedDebtDetail);
                  setSelectedDebtDetail(null);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Printer className="h-4 w-4" />
                In Giấy Báo Nợ
              </button>
              <button
                onClick={() => setSelectedDebtDetail(null)}
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-500"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Debt Settlement Statement Modal */}
      {printedStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-6">
            <div
              id="debt-statement-print-area"
              className="bg-white p-8 rounded-xl text-slate-900 font-sans space-y-6 border border-slate-200 shadow-xs"
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                <div>
                  <h3 className="text-base font-extrabold uppercase text-slate-900 tracking-wide">{storeName}</h3>
                  <p className="text-xs text-slate-600 mt-0.5">Địa chỉ: {address}</p>
                  <p className="text-xs text-slate-600">Hotline: {phone}</p>
                </div>
                <div className="text-right font-mono text-xs">
                  <p className="font-extrabold text-slate-800">GIẤY BÁO NỢ & ĐỐI SOÁT</p>
                  <p className="text-slate-500 mt-0.5">{new Date().toLocaleDateString('vi-VN')}</p>
                </div>
              </div>

              {/* Document Title */}
              <div className="text-center space-y-1">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-wide">
                  BIÊN BẢN XÁC NHẬN CÔNG NỢ
                </h2>
                <p className="text-xs text-slate-500 italic">
                  (Dùng cho việc đối soát và thanh toán công nợ khách hàng / nhà cung cấp)
                </p>
              </div>

              {/* Partner Details */}
              <div className="rounded-lg bg-slate-50 p-4 text-xs space-y-2 border border-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-500 font-semibold">Tên Đối Tác:</span>{' '}
                    <span className="font-bold text-slate-900 text-sm">{printedStatement.partyName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-semibold">Loại Đối Tác:</span>{' '}
                    <span className="font-bold text-slate-800">
                      {printedStatement.partyType === 'customer' ? 'Khách Hàng' : 'Nhà Cung Cấp'}
                    </span>
                  </div>
                </div>
                {printedStatement.phone && (
                  <div>
                    <span className="text-slate-500 font-semibold">Số Điện Thoại:</span>{' '}
                    <span className="font-mono">{printedStatement.phone}</span>
                  </div>
                )}
                {printedStatement.address && (
                  <div>
                    <span className="text-slate-500 font-semibold">Địa Chỉ:</span>{' '}
                    <span>{printedStatement.address}</span>
                  </div>
                )}
                {printedStatement.transactionCode && (
                  <div>
                    <span className="text-slate-500 font-semibold">Mã Đơn / Phiếu Liên Quan:</span>{' '}
                    <span className="font-mono font-bold text-purple-700">{printedStatement.transactionCode}</span>
                  </div>
                )}
              </div>

              {/* Debt Summary Table */}
              <table className="w-full text-left text-xs border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[11px]">
                    <th className="py-2.5 px-3 border border-slate-300">Nội Dung Công Nợ</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">Tổng Nợ Gốc</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">Đã Thanh Toán</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right text-rose-600">Còn Nợ Lại</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-3 px-3 border border-slate-300">
                      <div className="font-bold text-slate-900">
                        {printedStatement.partyType === 'customer' ? 'Khoản nợ phải thu từ khách hàng' : 'Khoản nợ phải trả cho nhà cung cấp'}
                      </div>
                      <div className="text-[11px] text-slate-500">{printedStatement.note || 'Ghi nhận công nợ hệ thống'}</div>
                    </td>
                    <td className="py-3 px-3 border border-slate-300 text-right font-medium">{formatCurrency(printedStatement.totalDebt)}</td>
                    <td className="py-3 px-3 border border-slate-300 text-right font-medium text-emerald-700">{formatCurrency(printedStatement.paidAmount)}</td>
                    <td className="py-3 px-3 border border-slate-300 text-right font-black text-rose-600 text-sm">{formatCurrency(printedStatement.remainingDebt)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Number to Words */}
              <div className="text-xs text-slate-700 italic border-l-4 border-slate-400 pl-3 py-1">
                Số tiền bằng chữ (Còn nợ): <span className="font-bold text-slate-900">{numberToVietnameseWords(printedStatement.remainingDebt)}</span>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 text-center text-xs text-slate-800 pt-6">
                <div className="space-y-1">
                  <p className="font-extrabold uppercase">ĐẠI DIỆN ĐỐI TÁC</p>
                  <p className="text-[11px] text-slate-500 italic">(Ký & ghi rõ họ tên)</p>
                </div>
                <div className="space-y-1">
                  <p className="font-extrabold uppercase">NGƯỜI LẬP SỔ</p>
                  <p className="text-[11px] text-slate-500 italic">(Ký & ghi rõ họ tên)</p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={() => setPrintedStatement(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Đóng Window
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportElementToPDF('debt-statement-print-area', `Giay_Bao_No_${printedStatement.partyName}`)}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-600 px-4 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition"
                >
                  <Download className="h-4 w-4" />
                  Xuất PDF
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-500 transition"
                >
                  <Printer className="h-4 w-4" />
                  In Giấy Báo Nợ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Phiếu Thu / Phiếu Chi Modal */}
      {printedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-6">
            {/* Printable Frame Area */}
            <div
              id="cashbook-receipt-print-area"
              className="bg-white p-8 rounded-xl text-slate-900 font-sans space-y-6 border border-slate-200 shadow-xs"
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                <div>
                  <h3 className="text-base font-extrabold uppercase text-slate-900 tracking-wide">{storeName}</h3>
                  <p className="text-xs text-slate-600 mt-0.5">Địa chỉ: {address}</p>
                  <p className="text-xs text-slate-600">Hotline: {phone}</p>
                </div>
                <div className="text-right font-mono text-xs">
                  <p className="font-extrabold text-slate-800">
                    Mẫu số: {printedReceipt.type === 'income' ? '01-TT' : '02-TT'}
                  </p>
                  <p className="text-slate-500">Mã phiếu: {printedReceipt.code}</p>
                </div>
              </div>

              {/* Receipt Title */}
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-black uppercase tracking-wider text-slate-900">
                  {printedReceipt.type === 'income' ? 'PHIẾU THU' : 'PHIẾU CHI'}
                </h2>
                <p className="text-xs text-slate-500 italic">
                  Ngày {new Date(printedReceipt.createdAt).getDate()} tháng {new Date(printedReceipt.createdAt).getMonth() + 1} năm {new Date(printedReceipt.createdAt).getFullYear()}
                </p>
              </div>

              {/* Details Grid */}
              <div className="space-y-2.5 text-xs text-slate-800 leading-relaxed">
                <div className="flex">
                  <span className="w-36 font-semibold shrink-0">Họ tên người {printedReceipt.type === 'income' ? 'nộp' : 'nhận'} tiền:</span>
                  <span className="font-bold uppercase text-slate-900">{printedReceipt.partyName || 'Khách lẻ / Đối tác'}</span>
                </div>

                <div className="flex">
                  <span className="w-36 font-semibold shrink-0">Hạng mục:</span>
                  <span className="font-medium text-slate-900">{printedReceipt.categoryName}</span>
                </div>

                <div className="flex">
                  <span className="w-36 font-semibold shrink-0">Lý do thu / chi:</span>
                  <span className="italic text-slate-800">{printedReceipt.note || 'Không có ghi chú'}</span>
                </div>

                <div className="flex">
                  <span className="w-36 font-semibold shrink-0">Phương thức thanh toán:</span>
                  <span className="font-bold text-slate-900">
                    {printedReceipt.paymentMethod === 'cash'
                      ? 'Tiền mặt'
                      : printedReceipt.paymentMethod === 'bank_transfer'
                      ? 'Chuyển khoản ngân hàng'
                      : 'Khác'}
                  </span>
                </div>

                <div className="flex items-baseline pt-1">
                  <span className="w-36 font-semibold shrink-0">Số tiền:</span>
                  <span className="text-lg font-black text-emerald-700 font-mono">
                    {formatCurrency(printedReceipt.amount)}
                  </span>
                </div>

                <div className="flex bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="w-36 font-semibold shrink-0">Bằng chữ:</span>
                  <span className="font-bold text-slate-900 italic">
                    {numberToVietnameseWords(printedReceipt.amount)}
                  </span>
                </div>
              </div>

              {/* Signatures Area */}
              <div className="grid grid-cols-3 text-center text-xs pt-6 pb-2">
                <div>
                  <p className="font-bold text-slate-900 uppercase">NGƯỜI LẬP PHIẾU</p>
                  <p className="text-[10px] text-slate-400 italic">(Ký, ghi rõ họ tên)</p>
                  <div className="h-16"></div>
                </div>
                <div>
                  <p className="font-bold text-slate-900 uppercase">NGƯỜI {printedReceipt.type === 'income' ? 'NỘP' : 'NHẬN'} TIỀN</p>
                  <p className="text-[10px] text-slate-400 italic">(Ký, ghi rõ họ tên)</p>
                  <div className="h-16"></div>
                </div>
                <div>
                  <p className="font-bold text-slate-900 uppercase">THỦ QUỸ</p>
                  <p className="text-[10px] text-slate-400 italic">(Ký và đã nhận đủ tiền)</p>
                  <div className="h-16"></div>
                </div>
              </div>

              <div className="text-center border-t border-dashed border-slate-300 pt-2">
                <p className="text-[10px] font-medium text-slate-400 italic">
                  In từ Hệ Thống Quản Lý Kho Nguyễn Vi Shop vào {new Date().toLocaleString('vi-VN')}
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-800 no-print">
              <button
                onClick={() => setPrintedReceipt(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
              >
                Đóng
              </button>

              <button
                onClick={async () => {
                  await exportElementToPDF('cashbook-receipt-print-area', `phieu_${printedReceipt.code}`);
                  showToast('Đã tải file PDF phiếu thành công!', 'success');
                }}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900 transition"
              >
                <Download className="h-4 w-4" />
                Tải PDF
              </button>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-500 transition"
              >
                <Printer className="h-4 w-4" />
                In Phiếu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
