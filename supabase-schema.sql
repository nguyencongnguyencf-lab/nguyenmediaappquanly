-- SQL Schema script for Supabase database synchronization
-- Copy and run this script in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- 1. Table: products
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT,
    unit TEXT DEFAULT 'Cái',
    "importPrice" NUMERIC DEFAULT 0,
    "sellingPrice" NUMERIC DEFAULT 0,
    "stockQuantity" INT DEFAULT 0,
    "minStockAlert" INT DEFAULT 5,
    description TEXT,
    image TEXT,
    barcode TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "syncStatus" TEXT DEFAULT 'synced',
    "isDeleted" BOOLEAN DEFAULT false
);

-- 2. Table: categories
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "syncStatus" TEXT DEFAULT 'synced',
    "isDeleted" BOOLEAN DEFAULT false
);

-- 3. Table: inventoryTransactions
CREATE TABLE IF NOT EXISTS "inventoryTransactions" (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    code TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    "totalAmount" NUMERIC DEFAULT 0,
    note TEXT,
    "customerSupplierName" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "syncStatus" TEXT DEFAULT 'synced',
    "isDeleted" BOOLEAN DEFAULT false
);

-- Enable Row Level Security (RLS) & Allow public access for anon key
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventoryTransactions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on inventoryTransactions" ON "inventoryTransactions" FOR ALL USING (true) WITH CHECK (true);
