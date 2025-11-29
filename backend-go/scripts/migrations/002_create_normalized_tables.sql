-- Create brands table
CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    original_id VARCHAR(255) UNIQUE, -- ID Brand from CSV
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    original_id VARCHAR(255) UNIQUE, -- ID Supplier from CSV
    min_purchase NUMERIC(15, 2),
    trading_term VARCHAR(255),
    promo_factor VARCHAR(255),
    delay_factor VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create stores table
CREATE TABLE IF NOT EXISTS stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    original_id VARCHAR(255) UNIQUE, -- ID Store from CSV
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    sku_code VARCHAR(255) NOT NULL UNIQUE, -- SKU from CSV
    name VARCHAR(255) NOT NULL,
    brand_id INTEGER REFERENCES brands(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    hpp NUMERIC(15, 2), -- Harga Pokok Penjualan
    price NUMERIC(15, 2), -- Harga
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create daily_stock_data table
CREATE TABLE IF NOT EXISTS daily_stock_data (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    store_id INTEGER REFERENCES stores(id),
    product_id INTEGER REFERENCES products(id),
    
    -- Stock and Sales Metrics
    stock INTEGER DEFAULT 0,
    daily_sales NUMERIC(10, 2),
    max_daily_sales NUMERIC(10, 2),
    orig_daily_sales NUMERIC(10, 2),
    orig_max_daily_sales NUMERIC(10, 2),
    
    -- Supply Chain Metrics
    lead_time INTEGER,
    max_lead_time INTEGER,
    min_order INTEGER,
    is_in_padang BOOLEAN,
    safety_stock INTEGER,
    reorder_point INTEGER,
    
    -- PO Metrics
    sedang_po INTEGER, -- Sedang PO
    is_open_po BOOLEAN,
    initial_qty_po INTEGER,
    emergency_po_qty INTEGER,
    updated_regular_po_qty INTEGER,
    final_updated_regular_po_qty INTEGER,
    emergency_po_cost NUMERIC(15, 2),
    final_updated_regular_po_cost NUMERIC(15, 2),
    
    -- Analysis Metrics
    contribution_pct NUMERIC(5, 2),
    contribution_ratio NUMERIC(5, 2),
    sales_contribution NUMERIC(15, 2),
    target_days INTEGER,
    target_days_cover INTEGER,
    daily_stock_cover NUMERIC(10, 2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique record per store-product-date
    UNIQUE(date, store_id, product_id)
);

-- Create indexes for performance
CREATE INDEX idx_daily_stock_date ON daily_stock_data(date);
CREATE INDEX idx_daily_stock_store ON daily_stock_data(store_id);
CREATE INDEX idx_daily_stock_product ON daily_stock_data(product_id);
