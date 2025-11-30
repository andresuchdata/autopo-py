-- Migration: Add PO Snapshots for Lifecycle Analytics
-- This migration adds tables for tracking PO snapshots and their lifecycle events

-- Enable TimescaleDB extension if not already enabled
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- PO Snapshots Table (Hypertable)
CREATE TABLE po_snapshots (
    time TIMESTAMPTZ NOT NULL,
    po_id BIGINT REFERENCES purchase_orders(id) ON DELETE SET NULL,
    po_number VARCHAR(100) NOT NULL,
    
    -- Product Information
    product_id INTEGER REFERENCES products(id),
    sku VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    
    -- References
    brand_id INTEGER REFERENCES brands(id),
    store_id INTEGER REFERENCES stores(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    
    -- Quantities and Pricing
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER,
    unit_price DECIMAL(12, 2) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    
    -- Status Information
    status INTEGER NOT NULL,
    status_label VARCHAR(50) GENERATED ALWAYS AS (
        CASE status
            WHEN 1 THEN 'draft'
            WHEN 2 THEN 'released'
            WHEN 3 THEN 'sent'
            WHEN 4 THEN 'approved'
            WHEN 5 THEN 'arrived'
            WHEN 6 THEN 'received'
            ELSE 'unknown'
        END
    ) STORED,
    
    -- Status Timestamps
    po_released_at TIMESTAMPTZ,
    po_sent_at TIMESTAMPTZ,
    po_approved_at TIMESTAMPTZ,
    po_arrived_at TIMESTAMPTZ,
    po_received_at TIMESTAMPTZ,
    
    -- Additional PO Information
    min_purchase DECIMAL(12,2),
    trading_term TEXT,
    promo_factor DECIMAL(10,2),
    delay_factor DECIMAL(10,2),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT fk_po_item FOREIGN KEY (po_id, product_id) 
        REFERENCES purchase_order_items(po_id, product_id) ON DELETE SET NULL
);

-- Convert to hypertable for time-series data
SELECT create_hypertable('po_snapshots', 'time');

-- Create indexes for better query performance
CREATE INDEX idx_po_snapshots_time ON po_snapshots (time DESC);
CREATE INDEX idx_po_snapshots_po_number ON po_snapshots (po_number, time DESC);
CREATE INDEX idx_po_snapshots_sku ON po_snapshots (sku, time DESC);
CREATE INDEX idx_po_snapshots_brand ON po_snapshots (brand_id, time DESC);
CREATE INDEX idx_po_snapshots_store ON po_snapshots (store_id, time DESC);
CREATE INDEX idx_po_snapshots_status ON po_snapshots (status, time DESC);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update the updated_at column
CREATE TRIGGER update_po_snapshots_updated_at
BEFORE UPDATE ON po_snapshots
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create a function to log PO status changes
CREATE OR REPLACE FUNCTION log_po_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a new snapshot when PO status changes
    INSERT INTO po_snapshots (
        time, po_id, po_number, product_id, sku, product_name,
        brand_id, store_id, supplier_id, quantity_ordered, quantity_received,
        unit_price, total_amount, status, po_released_at, po_sent_at,
        po_approved_at, po_arrived_at, po_received_at, min_purchase,
        trading_term, promo_factor, delay_factor
    )
    SELECT 
        NOW(),
        po.id,
        po.po_number,
        poi.product_id,
        poi.sku,
        poi.product_name,
        po.brand_id,
        po.store_id,
        po.supplier_id,
        poi.quantity,
        poi.received_quantity,
        poi.price,
        poi.amount,
        po.status,
        po.po_released_at,
        po.po_sent_at,
        po.po_approved_at,
        po.po_arrived_at,
        po.po_received_at,
        po.min_purchase,
        po.trading_term,
        po.promo_factor,
        po.delay_factor
    FROM purchase_orders po
    JOIN purchase_order_items poi ON po.id = poi.po_id
    WHERE po.id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to log PO status changes
CREATE TRIGGER log_po_status_change_trigger
AFTER UPDATE OF status, po_released_at, po_sent_at, po_approved_at, po_arrived_at, po_received_at
ON purchase_orders
FOR EACH ROW
WHEN (
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.po_released_at IS DISTINCT FROM NEW.po_released_at OR
    OLD.po_sent_at IS DISTINCT FROM NEW.po_sent_at OR
    OLD.po_approved_at IS DISTINCT FROM NEW.po_approved_at OR
    OLD.po_arrived_at IS DISTINCT FROM NEW.po_arrived_at OR
    OLD.po_received_at IS DISTINCT FROM NEW.po_received_at
)
EXECUTE FUNCTION log_po_status_change();

-- Create a function to log new PO items
CREATE OR REPLACE FUNCTION log_new_po_item()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a new snapshot when a new PO item is added
    INSERT INTO po_snapshots (
        time, po_id, po_number, product_id, sku, product_name,
        brand_id, store_id, supplier_id, quantity_ordered, quantity_received,
        unit_price, total_amount, status, po_released_at, po_sent_at,
        po_approved_at, po_arrived_at, po_received_at, min_purchase,
        trading_term, promo_factor, delay_factor
    )
    SELECT 
        NOW(),
        po.id,
        po.po_number,
        NEW.product_id,
        NEW.sku,
        NEW.product_name,
        po.brand_id,
        po.store_id,
        po.supplier_id,
        NEW.quantity,
        NEW.received_quantity,
        NEW.price,
        NEW.amount,
        po.status,
        po.po_released_at,
        po.po_sent_at,
        po.po_approved_at,
        po.po_arrived_at,
        po.po_received_at,
        po.min_purchase,
        po.trading_term,
        po.promo_factor,
        po.delay_factor
    FROM purchase_orders po
    WHERE po.id = NEW.po_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to log new PO items
CREATE TRIGGER log_new_po_item_trigger
AFTER INSERT ON purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION log_new_po_item();

-- Create a function to update PO item quantities
CREATE OR REPLACE FUNCTION update_po_item_quantity()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a new snapshot when PO item quantity or received quantity changes
    IF OLD.quantity != NEW.quantity OR OLD.received_quantity != NEW.received_quantity THEN
        INSERT INTO po_snapshots (
            time, po_id, po_number, product_id, sku, product_name,
            brand_id, store_id, supplier_id, quantity_ordered, quantity_received,
            unit_price, total_amount, status, po_released_at, po_sent_at,
            po_approved_at, po_arrived_at, po_received_at, min_purchase,
            trading_term, promo_factor, delay_factor
        )
        SELECT 
            NOW(),
            po.id,
            po.po_number,
            NEW.product_id,
            NEW.sku,
            NEW.product_name,
            po.brand_id,
            po.store_id,
            po.supplier_id,
            NEW.quantity,
            NEW.received_quantity,
            NEW.price,
            NEW.amount,
            po.status,
            po.po_released_at,
            po.po_sent_at,
            po.po_approved_at,
            po.po_arrived_at,
            po.po_received_at,
            po.min_purchase,
            po.trading_term,
            po.promo_factor,
            po.delay_factor
        FROM purchase_orders po
        WHERE po.id = NEW.po_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update PO item quantities
CREATE TRIGGER update_po_item_quantity_trigger
AFTER UPDATE OF quantity, received_quantity ON purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION update_po_item_quantity();
