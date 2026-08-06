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

-- 4. Table: financialTransactions
CREATE TABLE IF NOT EXISTS "financialTransactions" (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    "categoryName" TEXT,
    amount NUMERIC DEFAULT 0,
    "partyName" TEXT,
    "paymentMethod" TEXT DEFAULT 'cash',
    note TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "syncStatus" TEXT DEFAULT 'synced',
    "isDeleted" BOOLEAN DEFAULT false
);

-- 5. Table: debts
CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    "partyName" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    "totalDebt" NUMERIC DEFAULT 0,
    "paidAmount" NUMERIC DEFAULT 0,
    "remainingDebt" NUMERIC DEFAULT 0,
    "dueDate" TEXT,
    "transactionCode" TEXT,
    note TEXT,
    status TEXT DEFAULT 'unpaid',
    history JSONB DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "syncStatus" TEXT DEFAULT 'synced',
    "isDeleted" BOOLEAN DEFAULT false
);

-- Migration safety for existing debts table in Supabase
ALTER TABLE debts ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS "dueDate" TEXT;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS "transactionCode" TEXT;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS "syncStatus" TEXT DEFAULT 'synced';

-- 6. Table: system_settings
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) & Allow public access for anon key
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventoryTransactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financialTransactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on inventoryTransactions" ON "inventoryTransactions" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on financialTransactions" ON "financialTransactions" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on debts" ON debts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on system_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);

-- 7. RPC Function: truncate_all_business_data
-- Truncates all business data tables dynamically, handles case-sensitivity, resets IDENTITY to 1, and updates system_settings in a single atomic transaction.
CREATE OR REPLACE FUNCTION truncate_all_business_data()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    tbl_name text;
    target_tables text[] := ARRAY[
        'products', 
        'categories', 
        'inventoryTransactions', 
        'inventorytransactions',
        'financialTransactions', 
        'financialtransactions',
        'debts'
    ];
    truncated_count int := 0;
    result json;
BEGIN
    -- Loop through business tables that actually exist in public schema and truncate them
    FOR tbl_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name = ANY(target_tables)
    LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tbl_name) || ' RESTART IDENTITY CASCADE';
        truncated_count := truncated_count + 1;
    END LOOP;

    -- Ensure system_settings table exists
    CREATE TABLE IF NOT EXISTS public.system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    );

    -- Update or insert last_reset_at timestamp in system_settings
    INSERT INTO public.system_settings (key, value, "updatedAt")
    VALUES ('last_reset_at', NOW()::text, NOW())
    ON CONFLICT (key) 
    DO UPDATE SET value = EXCLUDED.value, "updatedAt" = EXCLUDED."updatedAt";

    result := json_build_object(
        'success', true,
        'message', 'Đã xóa toàn bộ dữ liệu nghiệp vụ trên Supabase (' || truncated_count || ' bảng) và reset IDENTITY về 1 thành công!'
    );
    RETURN result;

EXCEPTION WHEN OTHERS THEN
    -- Automatically rolls back transaction on error
    result := json_build_object(
        'success', false,
        'message', SQLERRM
    );
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION truncate_all_business_data() TO anon, authenticated, service_role;



