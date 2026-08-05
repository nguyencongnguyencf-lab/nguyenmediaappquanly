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
  const [debtAmount, setDebtAmount] = useState<number>(0);
  const [debtNote, setDebtNote] = useState('');

  // State: Repay Debt Modal
  const [selectedDebt, setSelectedDebt] = useState<DebtRecord | null>(null);
  const [repayAmount, setRepayAmount] = useState<number>(0);
  const [repayMethod, setRepayMethod] = useState<PaymentMethod>('cash');

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

  const totalCustomerDebt = debts
    .filter((d) => d.partyType === 'customer' && d.status !== 'paid')
    .reduce((acc, curr) => acc + (curr.remainingDebt || 0), 0);

  const totalSupplierDebt = debts
    .filter((d) => d.partyType === 'supplier' && d.status !== 'paid')
    .reduce((acc, curr) => acc + (curr.remainingDebt || 0), 0);

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
      totalDebt: Number(debtAmount),
      paidAmount: 0,
      remainingDebt: Number(debtAmount),
      note: debtNote.trim(),
      status: 'unpaid',
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    };

    try {
      await db.debts.add(newDebt);
      await enqueueSyncItem('debts', 'create', newDebt.id, newDebt);
      showToast(`Đã ghi nhận công nợ mới cho "${newDebt.partyName}"`, 'success');
      setDebtPartyName('');
      setDebtAmount(0);
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

      const updatedDebt = {
        ...selectedDebt,
        paidAmount: newPaid,
        remainingDebt: newRemaining,
        status: newStatus,
        updatedAt: now,
      };

      // 1. Update debt record
      await db.debts.update(selectedDebt.id, {
        paidAmount: newPaid,
        remainingDebt: newRemaining,
        status: newStatus,
        updatedAt: now,
      });
      await enqueueSyncItem('debts', 'update', selectedDebt.id, updatedDebt);

      // 2. Automatically record in Cashbook Sổ Quỹ
      const codePrefix = selectedDebt.partyType === 'customer' ? 'PT' : 'PC';
      const code = `${codePrefix}-TN-${Date.now().toString().slice(-4)}`;
      const finRecord: FinancialTransaction = {
        id: `fin-debt-${Date.now()}`,
        code,
        type: selectedDebt.partyType === 'customer' ? 'income' : 'expense',
        category: selectedDebt.partyType === 'customer' ? 'sale' : 'purchase',
        categoryName: selectedDebt.partyType === 'customer' ? 'Thu nợ khách' : 'Trả nợ NCC',
        amount: Number(repayAmount),
        partyName: selectedDebt.partyName,
        paymentMethod: repayMethod,
        note: `Thanh toán nợ cho ${selectedDebt.partyName}`,
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
      setPrintedReceipt(finRecord);
      showToast(`Đã cập nhật trả nợ ${formatCurrency(repayAmount)} và ghi sổ quỹ!`, 'success');

      setSelectedDebt(null);
      setRepayAmount(0);
    } catch (err) {
      console.error('Repay debt error:', err);
      showToast('Lỗi khi cập nhật thanh toán nợ!', 'error');
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
            {formatCurrency(totalCustomerDebt)}
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Form Create Debt */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
              <Plus className="h-4 w-4 text-emerald-600" />
              Ghi Nhận Khoản Nợ Mới
            </h3>

            <form onSubmit={handleAddDebt} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Loại Công Nợ *
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
                  value={debtPartyName}
                  onChange={(e) => setDebtPartyName(e.target.value)}
                  placeholder="VD: Anh Minh, Cty Dược Phẩm..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
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

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Ghi Chú Nợ
                </label>
                <input
                  type="text"
                  value={debtNote}
                  onChange={(e) => setDebtNote(e.target.value)}
                  placeholder="Ghi chú thêm..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-500"
              >
                <Plus className="h-4 w-4" />
                Lưu Khoản Nợ
              </button>
            </form>
          </div>

          {/* Debt List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 border-b pb-3 border-gray-100 dark:border-gray-800">
                <CreditCard className="h-4 w-4 text-emerald-600" />
                Danh Sách Sổ Nợ Khách Hàng & Nhà Cung Cấp
              </h3>

              {debts.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400 italic">
                  Chưa có khoản công nợ nào.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold uppercase text-[11px]">
                        <th className="py-2.5 px-3">TÊN ĐỐI TÁC</th>
                        <th className="py-2.5 px-3">LOẠI NỢ</th>
                        <th className="py-2.5 px-3 text-right">NỢ GỐC</th>
                        <th className="py-2.5 px-3 text-right">ĐÃ TRẢ</th>
                        <th className="py-2.5 px-3 text-right text-rose-600">CÒN NỢ</th>
                        <th className="py-2.5 px-3 text-center">THAO TÁC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                      {debts.map((d) => (
                        <tr key={d.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                          <td className="py-2.5 px-3 font-bold">{d.partyName}</td>
                          <td className="py-2.5 px-3">
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
                          <td className="py-2.5 px-3 text-right font-medium">{formatCurrency(d.totalDebt)}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-600">{formatCurrency(d.paidAmount)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-rose-600">{formatCurrency(d.remainingDebt)}</td>
                          <td className="py-2.5 px-3 text-center">
                            {d.remainingDebt > 0 ? (
                              <button
                                onClick={() => {
                                  setSelectedDebt(d);
                                  setRepayAmount(d.remainingDebt);
                                }}
                                className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300"
                              >
                                Thanh Toán
                              </button>
                            ) : (
                              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                                Đã Hoàn Tất
                              </span>
                            )}
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
            <h3 className="text-base font-bold text-gray-900 dark:text-white border-b pb-2">
              Thanh Toán Công Nợ: {selectedDebt.partyName}
            </h3>

            <form onSubmit={handleRepayDebt} className="space-y-3.5">
              <div className="text-xs text-gray-600 dark:text-gray-300">
                Còn nợ: <span className="font-bold text-rose-600">{formatCurrency(selectedDebt.remainingDebt)}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Số Tiền Thanh Toán (VNĐ) *
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
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="cash">💵 Tiền Mặt</option>
                  <option value="bank_transfer">💳 Chuyển Khoản Ngân Hàng</option>
                </select>
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
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500"
                >
                  Xác Nhận Thanh Toán
                </button>
              </div>
            </form>
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
