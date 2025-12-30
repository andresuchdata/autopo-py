-- Migration: Add ETA to PO Items and Snapshots
-- This migration adds an eta column to purchase_order_items and po_snapshots, and updates triggers.

-- 1. Add eta column to purchase_order_items
ALTER TABLE purchase_order_items
ADD COLUMN IF NOT EXISTS eta DATE;

-- 2. Add eta column to po_snapshots
ALTER TABLE po_snapshots
ADD COLUMN IF NOT EXISTS eta DATE;

-- 3. Update log_po_status_change function to include eta
CREATE OR REPLACE FUNCTION log_po_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a new snapshot when PO status changes
    INSERT INTO po_snapshots (
        time, po_id, po_number, product_id, sku, product_name,
        brand_id, store_id, supplier_id, quantity_ordered, quantity_received,
        unit_price, total_amount, status, po_released_at, po_sent_at,
        po_approved_at, po_arrived_at, po_received_at, min_purchase,
        trading_term, promo_factor, delay_factor, eta
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
        po.delay_factor,
        poi.eta
    FROM purchase_orders po
    JOIN purchase_order_items poi ON po.id = poi.po_id
    WHERE po.id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Update log_new_po_item function to include eta
CREATE OR REPLACE FUNCTION log_new_po_item()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a new snapshot when a new PO item is added
    INSERT INTO po_snapshots (
        time, po_id, po_number, product_id, sku, product_name,
        brand_id, store_id, supplier_id, quantity_ordered, quantity_received,
        unit_price, total_amount, status, po_released_at, po_sent_at,
        po_approved_at, po_arrived_at, po_received_at, min_purchase,
        trading_term, promo_factor, delay_factor, eta
    )
    SELECT 
        NOW(),
        po.id,
        po.po_number,
        NEW.product_id,
        NEW.sku,
        NEW.product_name,
        brand_id,
        store_id,
        supplier_id,
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
        po.delay_factor,
        NEW.eta
    FROM purchase_orders po
    WHERE po.id = NEW.po_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Update update_po_item_quantity function to trigger on eta change and log snapshot
CREATE OR REPLACE FUNCTION update_po_item_quantity()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert a new snapshot when PO item quantity, received quantity, OR ETA changes
    IF OLD.quantity != NEW.quantity OR OLD.received_quantity != NEW.received_quantity OR OLD.eta IS DISTINCT FROM NEW.eta THEN
        INSERT INTO po_snapshots (
            time, po_id, po_number, product_id, sku, product_name,
            brand_id, store_id, supplier_id, quantity_ordered, quantity_received,
            unit_price, total_amount, status, po_released_at, po_sent_at,
            po_approved_at, po_arrived_at, po_received_at, min_purchase,
            trading_term, promo_factor, delay_factor, eta
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
            po.delay_factor,
            NEW.eta
        FROM purchase_orders po
        WHERE po.id = NEW.po_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to include eta in UPDATE OF list
DROP TRIGGER IF EXISTS update_po_item_quantity_trigger ON purchase_order_items;

CREATE TRIGGER update_po_item_quantity_trigger
AFTER UPDATE OF quantity, received_quantity, eta ON purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION update_po_item_quantity();
