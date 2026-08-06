import Dexie, { type Table } from 'dexie';
import type {
  Product,
  Category,
  InventoryTransaction,
  SyncQueueItem,
  SyncLog,
  ConflictRecord,
  WarehouseLocation,
  ProductLot,
  StockAuditSheet,
  PromotionProgram,
  CustomerTierPrice,
  PriceHistoryRecord,
  FinancialTransaction,
  DebtRecord,
} from '../types/inventory';
import { initialCategories, initialProducts, initialTransactions } from './seed';

export class InventoryDB extends Dexie {
  products!: Table<Product, string>;
  categories!: Table<Category, string>;
  inventoryTransactions!: Table<InventoryTransaction, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  syncLogs!: Table<SyncLog, string>;
  conflicts!: Table<ConflictRecord, string>;
  locations!: Table<WarehouseLocation, string>;
  productLots!: Table<ProductLot, string>;
  stockAudits!: Table<StockAuditSheet, string>;
  promotions!: Table<PromotionProgram, string>;
  customerTierPrices!: Table<CustomerTierPrice, string>;
  priceHistory!: Table<PriceHistoryRecord, string>;
  financialTransactions!: Table<FinancialTransaction, string>;
  debts!: Table<DebtRecord, string>;

  constructor() {
    super('KhoOfflineDB');

    // Schema definition for Dexie IndexedDB
    this.version(4).stores({
      products: 'id, sku, name, categoryId, syncStatus, barcode, updatedAt, isDeleted',
      categories: 'id, name, syncStatus, updatedAt, isDeleted',
      inventoryTransactions: 'id, type, code, syncStatus, createdAt, isDeleted',
      syncQueue: 'id, table, recordId, status, timestamp',
      syncLogs: 'id, timestamp, status',
      conflicts: 'id, table, recordId, status',
      locations: 'id, code, name, zone, isDeleted',
      productLots: 'id, productId, lotNumber, locationId, expirationDate, isDeleted',
      stockAudits: 'id, code, status, createdAt, isDeleted',
      promotions: 'id, name, type, isActive, startDate, endDate, applyType, isDeleted',
      customerTierPrices: 'id, productId',
      priceHistory: 'id, productId, createdAt',
      financialTransactions: 'id, code, type, category, createdAt, isDeleted',
      debts: 'id, partyName, partyType, status, isDeleted',
    });
  }

  // Helper to clear all data tables in IndexedDB
  async clearAllData() {
    await this.products.clear();
    await this.categories.clear();
    await this.inventoryTransactions.clear();
    await this.syncQueue.clear();
    await this.syncLogs.clear();
    await this.conflicts.clear();
    await this.locations.clear();
    await this.productLots.clear();
    await this.stockAudits.clear();
    await this.promotions.clear();
    await this.customerTierPrices.clear();
    await this.priceHistory.clear();
    await this.financialTransactions.clear();
    await this.debts.clear();
    console.log('IndexedDB cleared of all data.');
  }

  // Helper to populate initial database if empty
  async seedInitialData() {
    const catCount = await this.categories.count();
    if (catCount === 0 && initialCategories.length > 0) {
      await this.categories.bulkPut(initialCategories);
    }
  }
}

// Database instance
export const db = new InventoryDB();


