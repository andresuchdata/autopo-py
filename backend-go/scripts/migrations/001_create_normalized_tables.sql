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

-- Create purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(100) UNIQUE NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    brand_id INTEGER REFERENCES brands(id),
    store_id INTEGER REFERENCES stores(id),
    status INTEGER NOT NULL DEFAULT 1, -- 1: Draft, 2: Released, 3: Sent, 4: Approved, 5: Arrived, 6: Received
    po_qty INTEGER NOT NULL DEFAULT 0,
    received_qty INTEGER NOT NULL DEFAULT 0,
    po_released_at TIMESTAMP WITH TIME ZONE,
    po_sent_at TIMESTAMP WITH TIME ZONE,
    po_approved_at TIMESTAMP WITH TIME ZONE,
    po_arrived_at TIMESTAMP WITH TIME ZONE,
    po_received_at TIMESTAMP WITH TIME ZONE,
    min_purchase NUMERIC(15, 2),
    trading_term VARCHAR(255),
    promo_factor NUMERIC(10, 2),
    delay_factor NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create purchase_order_items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC(15, 2) NOT NULL,
    amount NUMERIC(15, 2) GENERATED ALWAYS AS (quantity * price) STORED,
    received_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(po_id, product_id)
);

-- Create supplier_brand_mappings table for many-to-many relationship
CREATE TABLE IF NOT EXISTS supplier_brand_mappings (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supplier_id, brand_id)
);

-- Create indexes for purchase orders
CREATE INDEX idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_brand ON purchase_orders(brand_id);
CREATE INDEX idx_purchase_orders_store ON purchase_orders(store_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

-- Create indexes for purchase order items
CREATE INDEX idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX idx_po_items_product ON purchase_order_items(product_id);
CREATE INDEX idx_po_items_sku ON purchase_order_items(sku);

-- Create indexes for supplier_brand_mappings
CREATE INDEX idx_supplier_brand_mapping_supplier ON supplier_brand_mappings(supplier_id);
CREATE INDEX idx_supplier_brand_mapping_brand ON supplier_brand_mappings(brand_id);

-- Create product_mappings table
CREATE TABLE IF NOT EXISTS product_mappings (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    original_sku VARCHAR(255) NOT NULL,
    original_product_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, brand_id, store_id, supplier_id)
);

-- Create indexes for product_mappings
CREATE INDEX idx_product_mappings_product ON product_mappings(product_id);
CREATE INDEX idx_product_mappings_brand ON product_mappings(brand_id);
CREATE INDEX idx_product_mappings_store ON product_mappings(store_id);
CREATE INDEX idx_product_mappings_supplier ON product_mappings(supplier_id);
CREATE INDEX idx_product_mappings_sku ON product_mappings(original_sku);

-- Add function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_purchase_orders_updated_at
BEFORE UPDATE ON purchase_orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_order_items_updated_at
BEFORE UPDATE ON purchase_order_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_supplier_brand_mappings_updated_at
BEFORE UPDATE ON supplier_brand_mappings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for product_mappings
CREATE TRIGGER update_product_mappings_updated_at
BEFORE UPDATE ON product_mappings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
