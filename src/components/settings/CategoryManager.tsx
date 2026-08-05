import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { initialCategories } from '../../db/seed';
import type { Category } from '../../types/inventory';
import { enqueueSyncItem } from '../../services/syncEngine';
import { useUIStore } from '../../store/useUIStore';
import {
  FolderTree,
  Plus,
  Search,
  Edit,
  Trash2,
  Sparkles,
  Package,
  X,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileText,
} from 'lucide-react';

export const CategoryManager: React.FC = () => {
  const { showToast } = useUIStore();

  const allCategories = useLiveQuery(() => db.categories.toArray(), []) || [];
  const categories = allCategories.filter((c) => !c.isDeleted);
  const products = useLiveQuery(() => db.products.toArray(), []) || [];
  const activeProducts = products.filter((p) => !p.isDeleted);

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  // Delete modal state
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  // Filter categories by search term
  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Calculate product count per category
  const getProductCount = (categoryId: string) => {
    return activeProducts.filter((p) => p.categoryId === categoryId).length;
  };

  const handleOpenModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || '',
      });
    } else {
      setEditingCategory(null);
      setFormData({ name: '', description: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast('Vui lòng nhập tên danh mục!', 'error');
      return;
    }

    try {
      const now = new Date().toISOString();

      if (editingCategory) {
        // Update existing category
        const updatedCat: Category = {
          ...editingCategory,
          name: formData.name.trim(),
          description: formData.description.trim(),
          updatedAt: now,
          syncStatus: 'pending',
        };
        await db.categories.put(updatedCat);
        await enqueueSyncItem('categories', 'update', updatedCat.id, updatedCat);
        showToast(`Đã cập nhật danh mục "${updatedCat.name}"!`, 'success');
      } else {
        // Create new category
        const newCat: Category = {
          id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: formData.name.trim(),
          description: formData.description.trim(),
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
          isDeleted: false,
        };
        await db.categories.add(newCat);
        await enqueueSyncItem('categories', 'create', newCat.id, newCat);
        showToast(`Đã thêm danh mục mới "${newCat.name}"!`, 'success');
      }

      setIsModalOpen(false);
      setFormData({ name: '', description: '' });
    } catch (err) {
      console.error('Category save error:', err);
      showToast('Lỗi khi lưu danh mục sản phẩm!', 'error');
    }
  };

  // Seed / Add default pre-made categories
  const handleSeedDefaults = async () => {
    try {
      let addedCount = 0;
      const existingIds = new Set(categories.map((c) => c.id));
      const existingNames = new Set(categories.map((c) => c.name.toLowerCase()));

      for (const item of initialCategories) {
        if (!existingIds.has(item.id) && !existingNames.has(item.name.toLowerCase())) {
          const newCat: Category = {
            ...item,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            syncStatus: 'pending',
            isDeleted: false,
          };
          await db.categories.put(newCat);
          await enqueueSyncItem('categories', 'create', newCat.id, newCat);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        showToast(`Đã thêm thành công ${addedCount} danh mục mẫu sẵn có!`, 'success');
      } else {
        showToast('Tất cả 12 danh mục mẫu đã tồn tại trong hệ thống!', 'info');
      }
    } catch (err) {
      console.error('Error seeding categories:', err);
      showToast('Lỗi khi tạo danh mục mẫu!', 'error');
    }
  };

  // Confirm delete category
  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;

    try {
      const count = getProductCount(deletingCategory.id);
      if (count > 0) {
        showToast(`Không thể xóa! Có ${count} sản phẩm đang thuộc danh mục này.`, 'error');
        setDeletingCategory(null);
        return;
      }

      const now = new Date().toISOString();
      await db.categories.update(deletingCategory.id, {
        isDeleted: true,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await enqueueSyncItem('categories', 'delete', deletingCategory.id, { id: deletingCategory.id });

      showToast(`Đã xóa danh mục "${deletingCategory.name}"!`, 'info');
      setDeletingCategory(null);
    } catch (err) {
      console.error('Delete category error:', err);
      showToast('Có lỗi xảy ra khi xóa danh mục!', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info & Actions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Danh Mục Sản Phẩm ({categories.length})
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Tạo và quản lý các ngành hàng để phân loại sản phẩm, báo cáo tồn kho & áp dụng chương trình khuyến mãi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleSeedDefaults}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 transition shadow-sm"
              title="Thêm các danh mục ngành hàng phổ biến đã được chuẩn bị sẵn"
            >
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Thêm 12 Danh Mục Mẫu
            </button>

            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition"
            >
              <Plus className="h-4 w-4" />
              Thêm Danh Mục Mới
            </button>
          </div>
        </div>

        {/* Search Bar & Quick Stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 border-t pt-4 border-gray-100 dark:border-gray-800">
          <div className="sm:col-span-8 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm danh mục theo tên hoặc mô tả..."
              className="w-full rounded-xl border border-gray-300 bg-gray-50 pl-10 pr-4 py-2 text-xs text-gray-900 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="sm:col-span-4 flex items-center justify-end gap-3 text-xs font-medium text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <Layers className="h-3.5 w-3.5 text-emerald-500" />
              Hiển thị: <strong>{filteredCategories.length}</strong>
            </span>
            <span className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <Package className="h-3.5 w-3.5 text-blue-500" />
              Sản phẩm: <strong>{activeProducts.length}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Categories Grid List */}
      {filteredCategories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-800 dark:bg-gray-900 space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-400">
            <FolderTree className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">Chưa có danh mục sản phẩm nào</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
            Bạn có thể bấm nút bên dưới để nạp nhanh 12 danh mục mẫu ngành hàng phổ biến hoặc tự tạo danh mục mới.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={handleSeedDefaults}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500"
            >
              <Sparkles className="h-4 w-4" />
              Tải 12 Danh Mục Mẫu Sẵn Có
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCategories.map((cat) => {
            const productCount = getProductCount(cat.id);
            return (
              <div
                key={cat.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4.5 shadow-sm transition hover:border-emerald-500/50 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-emerald-500/50 space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-bold text-sm">
                        {cat.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white leading-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
                          {cat.name}
                        </h4>
                        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 font-mono">
                          ID: {cat.id}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100">
                      <button
                        onClick={() => handleOpenModal(cat)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-emerald-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-emerald-400 transition"
                        title="Chỉnh sửa danh mục"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeletingCategory(cat)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:text-gray-500 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition"
                        title="Xóa danh mục"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-2.5 text-xs text-gray-600 dark:text-gray-400 line-clamp-2 min-h-[32px]">
                    {cat.description || 'Chưa có mô tả chi tiết cho danh mục này.'}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t pt-3 border-gray-100 dark:border-gray-800/80 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-gray-600 dark:text-gray-400">
                    <Package className="h-3.5 w-3.5 text-blue-500" />
                    <strong>{productCount}</strong> sản phẩm
                  </span>

                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {cat.syncStatus === 'synced' ? 'Đã đồng bộ' : 'Đờng chờ sync'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                {editingCategory ? 'Chỉnh Sửa Danh Mục' : 'Thêm Danh Mục Sản Phẩm Mới'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Tên Danh Mục Sản Phẩm *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ví dụ: Đồ Dùng Gia Dụng, Điện Thoại..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-xs text-gray-900 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Mô Tả Danh Mục
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ghi chú ngắn về loại hàng hóa trong danh mục này..."
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-xs text-gray-900 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white resize-none"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {editingCategory ? 'Cập Nhật' : 'Tạo Danh Mục'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950">
                <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Xác Nhận Xóa Danh Mục</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">"{deletingCategory.name}"</p>
              </div>
            </div>

            {getProductCount(deletingCategory.id) > 0 ? (
              <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 font-medium">
                ⚠️ Danh mục này hiện đang có <strong>{getProductCount(deletingCategory.id)}</strong> sản phẩm thuộc về nó. Bạn cần đổi danh mục cho các sản phẩm đó trước khi xóa.
              </div>
            ) : (
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Bạn có chắc chắn muốn xóa danh mục này khỏi hệ thống không?
              </p>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Đóng
              </button>
              {getProductCount(deletingCategory.id) === 0 && (
                <button
                  type="button"
                  onClick={handleDeleteCategory}
                  className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-rose-700"
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa Vĩnh Viễn
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
