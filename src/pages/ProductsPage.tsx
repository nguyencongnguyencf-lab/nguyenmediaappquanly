import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Product } from '../types/inventory';
import { enqueueSyncItem } from '../services/syncEngine';
import { exportProductsToExcel, parseExcelFile } from '../services/excelService';
import { useUIStore } from '../store/useUIStore';
import {
  Plus,
  Search,
  FileSpreadsheet,
  Upload,
  Edit,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Image as ImageIcon,
  Scan,
  X,
  Filter,
  Check,
  LayoutGrid,
  List,
  Layers,
  Boxes,
  Percent,
  Package,
} from 'lucide-react';
import { BarcodeScannerModal } from '../components/common/BarcodeScannerModal';

export const ProductsPage: React.FC = () => {
  const { showToast } = useUIStore();

  const allProducts = useLiveQuery(() => db.products.toArray(), []) || [];
  const products = allProducts.filter((p) => !p.isDeleted);
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState('all'); // all, low, active
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Import preview modal state
  const [importPreview, setImportPreview] = useState<Partial<Product>[] | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    categoryId: '',
    categoryName: '',
    unit: 'Cái',
    importPrice: 0,
    sellingPrice: 0,
    stockQuantity: 0,
    minStockAlert: 5,
    description: '',
    barcode: '',
    image: '',
    isActive: true,
  });

  // Open modal for Create/Edit
  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        sku: product.sku,
        name: product.name,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        unit: product.unit,
        importPrice: product.importPrice,
        sellingPrice: product.sellingPrice,
        stockQuantity: product.stockQuantity,
        minStockAlert: product.minStockAlert,
        description: product.description || '',
        barcode: product.barcode,
        image: product.image || '',
        isActive: product.isActive,
      });
    } else {
      setEditingProduct(null);
      setFormData({
        sku: `SP-${Date.now().toString().slice(-6)}`,
        name: '',
        categoryId: categories[0]?.id || 'cat-01',
        categoryName: categories[0]?.name || 'Thiết bị Điện tử',
        unit: 'Cái',
        importPrice: 0,
        sellingPrice: 0,
        stockQuantity: 10,
        minStockAlert: 5,
        description: '',
        barcode: Date.now().toString(),
        image: '',
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };

  // Image base64 handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Save product to IndexedDB & enqueue to sync
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.sku.trim()) {
      showToast('Vui lòng điền Tên sản phẩm và Mã SKU!', 'warning');
      return;
    }

    const categoryObj = categories.find((c) => c.id === formData.categoryId);
    const categoryName = categoryObj ? categoryObj.name : formData.categoryName || 'Chưa phân loại';

    try {
      if (editingProduct) {
        // Update existing
        const updated: Product = {
          ...editingProduct,
          ...formData,
          categoryName,
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        };
        await db.products.put(updated);
        await enqueueSyncItem('products', 'update', updated.id, updated);
        showToast('Đã cập nhật sản phẩm thành công!', 'success');
      } else {
        // Create new
        const newProduct: Product = {
          id: `prod-${Date.now()}`,
          ...formData,
          categoryName,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        };
        await db.products.add(newProduct);
        await enqueueSyncItem('products', 'create', newProduct.id, newProduct);
        showToast('Đã thêm sản phẩm mới thành công!', 'success');
        setCurrentPage(1);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving product:', err);
      showToast('Có lỗi xảy ra khi lưu sản phẩm', 'error');
    }
  };

  // Soft delete product
  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) {
      await db.products.update(id, { isDeleted: true, syncStatus: 'pending', updatedAt: new Date().toISOString() });
      await enqueueSyncItem('products', 'delete', id, { id });
      showToast('Đã xóa sản phẩm thành công', 'info');
    }
  };

  // Toggle active business status
  const handleToggleActive = async (product: Product) => {
    const nextState = !product.isActive;
    await db.products.update(product.id, { isActive: nextState, syncStatus: 'pending', updatedAt: new Date().toISOString() });
    await enqueueSyncItem('products', 'update', product.id, { ...product, isActive: nextState });
    showToast(`Đã ${nextState ? 'kích hoạt' : 'ngừng'} kinh doanh sản phẩm`, 'info');
  };

  // Excel Export
  const handleExportExcel = () => {
    exportProductsToExcel(filteredProducts);
    showToast('Đã xuất file Excel thành công!', 'success');
  };

  // Excel Import File Select
  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const parsed = await parseExcelFile(file);
        setImportPreview(parsed);
      } catch (err) {
        showToast('File Excel không đúng định dạng!', 'error');
      }
    }
  };

  // Confirm Excel Import
  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.length === 0) return;

    let count = 0;
    for (const item of importPreview) {
      const id = `prod-imp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const prod: Product = {
        id,
        sku: item.sku || `SKU-${Date.now()}`,
        name: item.name || 'Sản phẩm mới',
        categoryId: categories[0]?.id || 'cat-01',
        categoryName: item.categoryName || 'Chưa phân loại',
        unit: item.unit || 'Cái',
        importPrice: item.importPrice || 0,
        sellingPrice: item.sellingPrice || 0,
        stockQuantity: item.stockQuantity || 0,
        minStockAlert: item.minStockAlert || 5,
        barcode: item.barcode || Date.now().toString(),
        isActive: true,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
      };
      await db.products.put(prod);
      await enqueueSyncItem('products', 'create', prod.id, prod);
      count++;
    }

    setImportPreview(null);
    showToast(`Đã nhập thành công ${count} sản phẩm từ Excel!`, 'success');
  };

  // Filtering
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.includes(searchTerm);

    const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;

    const matchesStock =
      stockFilter === 'all' ||
      (stockFilter === 'low' && p.stockQuantity <= p.minStockAlert) ||
      (stockFilter === 'active' && p.isActive);

    return matchesSearch && matchesCategory && matchesStock;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quản Lý Sản Phẩm</h2>
          <p className="text-xs text-gray-500">
            Tổng số: <span className="font-bold text-emerald-600">{products.length}</span> sản phẩm trong IndexedDB local
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Xuất Excel
          </button>

          {/* Import Excel */}
          <label className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 cursor-pointer">
            <Upload className="h-4 w-4 text-blue-600" />
            Nhập Excel/CSV
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleImportFileSelect} className="hidden" />
          </label>

          {/* Add Product Button */}
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Thêm sản phẩm mới
          </button>
        </div>
      </div>

      {/* Top Metrics Cards Bar */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Mã SKU Sản Phẩm</span>
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{products.length}</p>
          <span className="text-[11px] text-gray-500">Mặt hàng đang quản lý</span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Tổng Số Lượng Tồn</span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-500">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {products.reduce((s, p) => s + p.stockQuantity, 0)}
          </p>
          <span className="text-[11px] text-gray-500">Đơn vị sản phẩm kho</span>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">Tổng Vốn Hàng Tồn</span>
            <div className="rounded-xl bg-purple-500/10 p-2 text-purple-500">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-lg font-black text-purple-600 dark:text-purple-400 truncate">
            {formatCurrency(products.reduce((s, p) => s + p.stockQuantity * p.importPrice, 0))}
          </p>
          <span className="text-[11px] text-gray-500">Tính theo giá vốn nhập</span>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-400">Cảnh Báo Tồn Kho</span>
            <div className="rounded-xl bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-400">
            {products.filter((p) => p.stockQuantity <= p.minStockAlert).length}
          </p>
          <span className="text-[11px] text-amber-700 dark:text-amber-500">Cần bổ sung hàng gấp</span>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên sản phẩm, mã SKU hoặc mã vạch..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Category & Stock Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Filter className="h-3.5 w-3.5" />
            Lọc:
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-800 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="all">Tất cả danh mục</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-800 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="all">Tất cả tồn kho</option>
            <option value="low">Sắp hết hàng (Cảnh báo)</option>
            <option value="active">Đang kinh doanh</option>
          </select>

          {/* View Mode Toggle Buttons */}
          <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800">
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-lg p-1.5 transition ${
                viewMode === 'table' ? 'bg-white shadow text-emerald-600 dark:bg-gray-700 dark:text-emerald-400' : 'text-gray-400 hover:text-gray-600'
              }`}
              title="Dạng bảng"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-lg p-1.5 transition ${
                viewMode === 'grid' ? 'bg-white shadow text-emerald-600 dark:bg-gray-700 dark:text-emerald-400' : 'text-gray-400 hover:text-gray-600'
              }`}
              title="Dạng thẻ lưới"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Data Render: Table or Grid */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginatedProducts.length === 0 ? (
            <div className="col-span-full py-12 text-center text-sm text-gray-500 bg-white rounded-2xl dark:bg-gray-900">
              Không tìm thấy sản phẩm phù hợp.
            </div>
          ) : (
            paginatedProducts.map((p) => {
              const isLow = p.stockQuantity <= p.minStockAlert;
              const margin = p.sellingPrice > 0 ? Math.round(((p.sellingPrice - p.importPrice) / p.sellingPrice) * 100) : 0;

              return (
                <div
                  key={p.id}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md dark:bg-gray-900 ${
                    isLow ? 'border-amber-300 dark:border-amber-900' : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Image & SKU Header */}
                    <div className="relative h-36 w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-800">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                      ) : (
                        <ImageIcon className="h-10 w-10 text-gray-400" />
                      )}

                      <span className="absolute left-2 top-2 rounded-md bg-black/60 backdrop-blur-xs px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                        {p.sku}
                      </span>

                      {margin > 0 && (
                        <span className="absolute right-2 top-2 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                          +{margin}% Lời
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div>
                      <span className="text-[11px] font-semibold text-gray-400">{p.categoryName}</span>
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-2 leading-snug">{p.name}</h4>
                    </div>

                    {/* Price Breakdown */}
                    <div className="flex items-center justify-between border-t border-b py-2 border-gray-100 dark:border-gray-800 text-xs">
                      <div>
                        <span className="text-[10px] text-gray-400 block">Giá vốn:</span>
                        <span className="font-medium text-gray-600 dark:text-gray-400">{formatCurrency(p.importPrice)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-gray-400 block">Giá bán:</span>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">{formatCurrency(p.sellingPrice)}</span>
                      </div>
                    </div>

                    {/* Stock level */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-gray-500">Tồn kho:</span>
                        <span className={`font-bold ${isLow ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {p.stockQuantity} {p.unit}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isLow ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (p.stockQuantity / Math.max(1, p.minStockAlert * 3)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 flex items-center justify-between border-t pt-3 border-gray-100 dark:border-gray-800">
                    <button
                      onClick={() => handleToggleActive(p)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                        p.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800'
                      }`}
                    >
                      {p.isActive ? 'Bán' : 'Ngừng'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenModal(p)}
                        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-emerald-600 dark:hover:bg-gray-800"
                        title="Sửa"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="rounded-lg p-1.5 text-gray-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-gray-800"
                        title="Xóa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Data Table */
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Ảnh</th>
                <th className="px-4 py-3">SKU / Tên sản phẩm</th>
                <th className="px-4 py-3">Danh mục</th>
                <th className="px-4 py-3 text-right">Giá nhập</th>
                <th className="px-4 py-3 text-right">Giá bán</th>
                <th className="px-4 py-3 text-center">Tồn kho</th>
                <th className="px-4 py-3 text-center">Trạng thái Sync</th>
                <th className="px-4 py-3 text-center">Kinh doanh</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {paginatedProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-gray-500">
                    Không tìm thấy sản phẩm phù hợp.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p) => {
                  const isLow = p.stockQuantity <= p.minStockAlert;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-gray-50 transition dark:hover:bg-gray-800/40 ${
                        isLow ? 'bg-amber-500/5 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Image */}
                      <td className="px-4 py-3">
                        <div className="h-10 w-10 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center border border-gray-200 dark:border-gray-700">
                          {p.image ? (
                            <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                      </td>

                      {/* SKU & Name */}
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {p.sku}
                        </div>
                        <div className="font-medium text-gray-900 dark:text-white line-clamp-1">{p.name}</div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 text-xs text-gray-500">{p.categoryName}</td>

                      {/* Import Price */}
                      <td className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">
                        {formatCurrency(p.importPrice)}
                      </td>

                      {/* Selling Price */}
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.sellingPrice)}
                      </td>

                      {/* Stock Quantity */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isLow
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-pulse'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {p.stockQuantity} {p.unit}
                        </span>
                      </td>

                      {/* Sync Status Badge */}
                      <td className="px-4 py-3 text-center">
                        {p.syncStatus === 'synced' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Đã sync
                          </span>
                        ) : p.syncStatus === 'pending' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                            <Clock className="h-3 w-3 animate-spin" />
                            Chờ sync
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" />
                            Xung đột
                          </span>
                        )}
                      </td>

                      {/* Active Status */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(p)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            p.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              p.isActive ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenModal(p)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-emerald-600 dark:text-gray-400 dark:hover:bg-gray-800"
                            title="Sửa sản phẩm"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(p.id)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-rose-600 dark:text-gray-400 dark:hover:bg-gray-800"
                            title="Xóa sản phẩm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
          <span className="text-xs text-gray-500">
            Hiển thị {paginatedProducts.length} trên tổng số {filteredProducts.length} sản phẩm
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Trước
            </button>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Trang {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              Sau
            </button>
          </div>
        </div>
      </div>
      )}

      {/* CRUD Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingProduct ? 'Chỉnh Sửa Sản Phẩm' : 'Thêm Sản Phẩm Mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Mã SKU *</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Tên Sản Phẩm *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="VD: iPhone 15 Pro 256GB"
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Danh Mục</label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Đơn Vị Tính</label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="Cái, Hộp, Bộ, Kg..."
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Giá Nhập (VNĐ)</label>
                  <input
                    type="number"
                    value={formData.importPrice}
                    onChange={(e) => setFormData({ ...formData, importPrice: Number(e.target.value) })}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Giá Bán (VNĐ)</label>
                  <input
                    type="number"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: Number(e.target.value) })}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Số Lượng Tồn Kho</label>
                  <input
                    type="number"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: Number(e.target.value) })}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Ngưỡng Cảnh Báo Tồn Kho</label>
                  <input
                    type="number"
                    value={formData.minStockAlert}
                    onChange={(e) => setFormData({ ...formData, minStockAlert: Number(e.target.value) })}
                    className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                {/* Barcode with Scanner Trigger */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Mã Vạch Barcode</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      placeholder="Mã vạch sản phẩm"
                      className="flex-1 rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setIsScannerOpen(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-gray-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-gray-700 dark:bg-gray-700"
                    >
                      <Scan className="h-4 w-4" />
                      Quét
                    </button>
                  </div>
                </div>

                {/* Offline Base64 Image Upload */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Hình Ảnh (Lưu Base64 khi Offline)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                  />
                  {formData.image && (
                    <div className="mt-2 h-20 w-20 overflow-hidden rounded-xl border border-gray-200">
                      <img src={formData.image} alt="Preview" className="h-full w-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                >
                  <Check className="h-4 w-4" />
                  Lưu sản phẩm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(scannedCode) => setFormData((prev) => ({ ...prev, barcode: scannedCode }))}
      />

      {/* Excel Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white pb-3 border-b border-gray-200 dark:border-gray-800">
              Xem Trước Dữ Liệu Import Từ Excel ({importPreview.length} Sản Phẩm)
            </h3>
            <div className="max-h-64 overflow-y-auto my-4 border rounded-xl border-gray-200 dark:border-gray-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 dark:bg-gray-800 font-bold text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Tên</th>
                    <th className="p-2">Danh mục</th>
                    <th className="p-2">Giá bán</th>
                    <th className="p-2">Tồn kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {importPreview.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-mono text-emerald-600">{item.sku}</td>
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2">{item.categoryName}</td>
                      <td className="p-2">{formatCurrency(item.sellingPrice || 0)}</td>
                      <td className="p-2">{item.stockQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={() => setImportPreview(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmImport}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
              >
                Xác Nhận Lưu Vào IndexedDB
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
