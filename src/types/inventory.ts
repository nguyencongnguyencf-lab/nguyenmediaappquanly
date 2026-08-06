export type SyncStatus = 'synced' | 'pending' | 'conflict';

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  isDeleted?: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  importPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minStockAlert: number;
  description?: string;
  image?: string; // base64 or URL
  barcode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  version?: number;
  isDeleted?: boolean;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface InventoryTransaction {
  id: string;
  type: 'import' | 'export';
  code: string; // e.g. PN-20260804-001 or PX-20260804-001
  items: TransactionItem[];
  totalAmount: number;
  discountAmount?: number;
  promotionId?: string;
  promotionName?: string;
  note?: string;
  customerSupplierName?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  isDeleted?: boolean;
}

export interface SyncQueueItem {
  id: string;
  table: 'products' | 'categories' | 'inventoryTransactions' | 'financialTransactions' | 'debts' | 'settings';
  action: 'create' | 'update' | 'delete';
  recordId: string;
  data: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed';
  errorMessage?: string;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  recordsProcessed: number;
  status: 'success' | 'partial' | 'failed';
  details: string;
}

export interface ConflictRecord {
  id: string;
  table: string;
  recordId: string;
  localData: any;
  remoteData: any;
  timestamp: string;
  status: 'unresolved' | 'resolved_local' | 'resolved_remote';
}

export interface StoreSettings {
  storeName: string;
  phone: string;
  address: string;
  invoiceHeader: string;
  defaultMinStock: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
  autoSyncInterval: number; // 0 for manual, or 30, 60, 300 seconds
  wifiOnlySync: boolean;
  theme: 'dark' | 'light';
  lastSyncTime?: string;
  telegramEnabled?: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  notifyStockImport?: boolean;
  notifyStockExport?: boolean;
  notifyLowStock?: boolean;
  notifyFinancial?: boolean;
  lastResetAt?: string;
}

export interface WarehouseLocation {
  id: string;
  code: string; // e.g. KHO-A-K1
  name: string; // e.g. Kệ 1 - Khu A
  zone: string; // e.g. Khu A, Khu B
  capacity: number;
  x?: number; // Grid X for visual map
  y?: number; // Grid Y for visual map
  description?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
}

export interface ProductLot {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  lotNumber: string; // e.g. LOT-20260804-01
  expirationDate: string; // ISO Date e.g. 2026-12-31
  manufactureDate?: string;
  quantity: number;
  locationId?: string;
  locationName?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
}

export interface StockAuditItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  systemQuantity: number;
  actualQuantity: number;
  difference: number; // actualQuantity - systemQuantity
  note?: string;
}

export interface StockAuditSheet {
  id: string;
  code: string; // e.g. KK-20260804-001
  locationId?: string;
  locationName?: string;
  createdByName: string;
  status: 'draft' | 'completed' | 'adjusted';
  note?: string;
  createdAt: string;
  updatedAt: string;
  items: StockAuditItem[];
  isDeleted?: boolean;
}

export type PromotionType = 'percentage' | 'fixed_amount' | 'buy_x_get_y' | 'combo';

export interface PromotionProgram {
  id: string;
  name: string;
  type: PromotionType;
  discountValue: number; // e.g. 10 for 10%, or 50000 VND
  minOrderValue?: number;
  buyQuantity?: number;
  getQuantity?: number;
  giftProductName?: string;
  startDate: string; // ISO Datetime
  endDate: string; // ISO Datetime
  applyType: 'all' | 'category' | 'product';
  targetId?: string;
  targetName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
}

export interface CustomerTierPrice {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  retailPrice: number; // Giá bán lẻ
  wholesalePrice: number; // Giá bán buôn / sỉ
  vipPrice: number; // Giá khách VIP
  updatedAt: string;
}

export interface PriceHistoryRecord {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  oldPrice: number;
  newPrice: number;
  changedByName: string;
  reason?: string;
  createdAt: string;
}

export type FinancialType = 'income' | 'expense';
export type FinancialCategory = 'sale' | 'purchase' | 'operation' | 'salary' | 'other';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'other';

export interface FinancialTransaction {
  id: string;
  code: string; // PT-20260804-001 or PC-20260804-001
  type: FinancialType;
  category: FinancialCategory;
  categoryName: string; // e.g. Bán hàng, Nhập hàng, Vận hành, Lương...
  amount: number;
  partyName?: string; // Tên Khách hàng / nhà cung cấp / người giao dịch
  paymentMethod: PaymentMethod;
  note?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus?: SyncStatus;
  isDeleted?: boolean;
}

export interface DebtRecord {
  id: string;
  partyName: string; // Tên Khách Hàng hoặc Nhà Cung Cấp
  partyType: 'customer' | 'supplier'; // customer: Phải thu (Khách nợ), supplier: Phải trả (Nợ NCC)
  totalDebt: number;
  paidAmount: number;
  remainingDebt: number;
  note?: string;
  status: 'unpaid' | 'partial' | 'paid';
  createdAt: string;
  updatedAt: string;
  syncStatus?: SyncStatus;
  isDeleted?: boolean;
}
