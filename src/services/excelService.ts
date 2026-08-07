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

export function exportDebtsToExcel(debts: any[]) {
  const exportData = debts.map((d) => ({
    'Tên Đối Tác': d.partyName,
    'Loại Nợ': d.partyType === 'customer' ? 'Phải thu (Khách nợ)' : 'Phải trả (Nợ NCC)',
    'Số Điện Thoại': d.phone || '',
    'Địa Chỉ': d.address || '',
    'Tổng Nợ Gốc (VNĐ)': d.totalDebt,
    'Đã Trả (VNĐ)': d.paidAmount,
    'Còn Nợ (VNĐ)': d.remainingDebt,
    'Hạn Trả': d.dueDate || '',
    'Mã Đơn Liên Quan': d.transactionCode || '',
    'Trạng Thái': d.status === 'paid' ? 'Đã hoàn tất' : d.status === 'partial' ? 'Trả 1 phần' : 'Chưa trả',
    'Ghi Chú': d.note || '',
    'Ngày Tạo': new Date(d.createdAt).toLocaleDateString('vi-VN'),
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'SoNoCongNo');

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `so_no_cong_no_${dateStr}.xlsx`);
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

export function exportProfitLossToExcel(pnlData: {
  storeName: string;
  timeRangeText: string;
  grossSales: number;
  salesDiscounts: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  operatingExpensesBreakdown: { categoryName: string; amount: number }[];
  netOperatingProfit: number;
  otherIncome: number;
  otherExpenses: number;
  netProfit: number;
  netMargin: number;
}) {
  const rows: any[] = [
    { 'BÁO CÁO KẾT QUẢ KINH DOANH LÃI LỖ': `CỬA HÀNG / DOANH NGHIỆP: ${pnlData.storeName || 'Nguyễn Vi Shop'}` },
    { 'BÁO CÁO KẾT QUẢ KINH DOANH LÃI LỖ': `Thời gian thống kê: ${pnlData.timeRangeText}` },
    { 'BÁO CÁO KẾT QUẢ KINH DOANH LÃI LỖ': '' },
    { 'Mã chỉ tiêu': '01', 'Chỉ tiêu Kế toán Quản trị': '1. Doanh thu bán hàng & dịch vụ', 'Số tiền (VNĐ)': pnlData.grossSales },
    { 'Mã chỉ tiêu': '02', 'Chỉ tiêu Kế toán Quản trị': '2. Các khoản giảm trừ doanh thu (Chiết khấu, Khuyến mãi)', 'Số tiền (VNĐ)': pnlData.salesDiscounts },
    { 'Mã chỉ tiêu': '10', 'Chỉ tiêu Kế toán Quản trị': '3. Doanh thu thuần về bán hàng & dịch vụ (10 = 01 - 02)', 'Số tiền (VNĐ)': pnlData.netRevenue },
    { 'Mã chỉ tiêu': '11', 'Chỉ tiêu Kế toán Quản trị': '4. Giá vốn hàng bán (COGS - Cost of Goods Sold)', 'Số tiền (VNĐ)': pnlData.cogs },
    { 'Mã chỉ tiêu': '20', 'Chỉ tiêu Kế toán Quản trị': '5. Lợi nhuận gộp về bán hàng & dịch vụ (20 = 10 - 11)', 'Số tiền (VNĐ)': pnlData.grossProfit },
    { 'Mã chỉ tiêu': '--', 'Chỉ tiêu Kế toán Quản trị': '   -> Biên lợi nhuận gộp (%)', 'Số tiền (VNĐ)': `${pnlData.grossMargin.toFixed(2)}%` },
    { 'Mã chỉ tiêu': '25', 'Chỉ tiêu Kế toán Quản trị': '6. Tổng chi phí hoạt động kinh doanh (OPEX)', 'Số tiền (VNĐ)': pnlData.operatingExpenses },
  ];

  pnlData.operatingExpensesBreakdown.forEach((exp) => {
    rows.push({
      'Mã chỉ tiêu': '',
      'Chỉ tiêu Kế toán Quản trị': `   + ${exp.categoryName}`,
      'Số tiền (VNĐ)': exp.amount,
    });
  });

  rows.push(
    { 'Mã chỉ tiêu': '30', 'Chỉ tiêu Kế toán Quản trị': '7. Lợi nhuận thuần từ hoạt động kinh doanh (30 = 20 - 25)', 'Số tiền (VNĐ)': pnlData.netOperatingProfit },
    { 'Mã chỉ tiêu': '31', 'Chỉ tiêu Kế toán Quản trị': '8. Thu nhập khác', 'Số tiền (VNĐ)': pnlData.otherIncome },
    { 'Mã chỉ tiêu': '32', 'Chỉ tiêu Kế toán Quản trị': '9. Chi phí khác', 'Số tiền (VNĐ)': pnlData.otherExpenses },
    { 'Mã chỉ tiêu': '50', 'Chỉ tiêu Kế toán Quản trị': '10. TỔNG LỢI NHUẬN RÒNG TRƯỚC/SAU THUẾ (50 = 30 + 31 - 32)', 'Số tiền (VNĐ)': pnlData.netProfit },
    { 'Mã chỉ tiêu': '--', 'Chỉ tiêu Kế toán Quản trị': '   -> Biên lợi nhuận ròng (%)', 'Số tiền (VNĐ)': `${pnlData.netMargin.toFixed(2)}%` }
  );

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 15 }, { wch: 60 }, { wch: 25 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Báo Cáo Lãi Lỗ PnL');

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `Bao_Cao_Ket_Qua_Kinh_Doanh_Lai_Lo_${dateStr}.xlsx`);
}

