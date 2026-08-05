import * as XLSX from 'xlsx';
import type { Product } from '../types/inventory';

export function exportProductsToExcel(products: Product[]) {
  const exportData = products.map((p) => ({
    'Mã SKU': p.sku,
    'Tên Sản Phẩm': p.name,
    'Danh Mục': p.categoryName,
    'Đơn Vị Tính': p.unit,
    'Giá Nhập (VNĐ)': p.importPrice,
    'Giá Bán (VNĐ)': p.sellingPrice,
    'Tồn Kho': p.stockQuantity,
    'Ngưỡng Cảnh Báo': p.minStockAlert,
    'Mã Vạch': p.barcode,
    'Trạng Thái': p.isActive ? 'Đang kinh doanh' : 'Ngừng kinh doanh',
    'Trạng Thái Sync': p.syncStatus === 'synced' ? 'Đã đồng bộ' : p.syncStatus === 'pending' ? 'Chờ đồng bộ' : 'Xung đột',
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sản Phẩm');

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `danh_sach_san_pham_${dateStr}.xlsx`);
}

export function parseExcelFile(file: File): Promise<Partial<Product>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        const parsedProducts: Partial<Product>[] = json.map((row, index) => {
          const sku = row['Mã SKU'] || row['SKU'] || `SP-IMP-${Date.now()}-${index}`;
          const name = row['Tên Sản Phẩm'] || row['Tên'] || row['Name'] || `Sản phẩm ${index + 1}`;
          const categoryName = row['Danh Mục'] || row['Category'] || 'Chưa phân loại';
          const unit = row['Đơn Vị Tính'] || row['Unit'] || 'Cái';
          const importPrice = Number(row['Giá Nhập (VNĐ)'] || row['Giá Nhập'] || row['ImportPrice'] || 0);
          const sellingPrice = Number(row['Giá Bán (VNĐ)'] || row['Giá Bán'] || row['SellingPrice'] || 0);
          const stockQuantity = Number(row['Tồn Kho'] || row['Stock'] || 0);
          const minStockAlert = Number(row['Ngưỡng Cảnh Báo'] || row['MinStock'] || 5);
          const barcode = String(row['Mã Vạch'] || row['Barcode'] || Date.now().toString());

          return {
            sku: String(sku).trim(),
            name: String(name).trim(),
            categoryName: String(categoryName).trim(),
            unit: String(unit).trim(),
            importPrice,
            sellingPrice,
            stockQuantity,
            minStockAlert,
            barcode,
            isActive: true,
          };
        });

        resolve(parsedProducts);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
}
