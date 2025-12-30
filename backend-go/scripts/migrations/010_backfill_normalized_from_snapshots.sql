-- Migration: Backfill Purchase Orders and Items from Snapshots
-- This is required because the current ingestion pipeline writes directly to po_snapshots,
-- leaving the normalized tables empty. The ETA feature requires these tables for mutable state.

BEGIN;

-- 0. Disable triggers to prevent creating duplicate snapshots or infinite loops
-- We are hydrating the "source of truth" tables from the log, so we don't want to write back to the log.
ALTER TABLE purchase_order_items DISABLE TRIGGER log_new_po_item_trigger;
ALTER TABLE purchase_order_items DISABLE TRIGGER update_po_item_quantity_trigger;
ALTER TABLE purchase_orders DISABLE TRIGGER log_po_status_change_trigger;

-- 1. Insert missing Purchase Orders
INSERT INTO purchase_orders (
    po_number, supplier_id, brand_id, store_id, status, 
    po_qty, received_qty, 
    po_released_at, po_sent_at, po_approved_at, po_arrived_at, po_received_at, 
    min_purchase, trading_term, promo_factor, delay_factor,
    created_at, updated_at
)
SELECT DISTINCT ON (po_number)
    po_number, 
    supplier_id, 
    brand_id, 
    store_id, 
    status,
    0, 0, -- Initial values, will calculate sum later
    po_released_at, po_sent_at, po_approved_at, po_arrived_at, po_received_at,
    min_purchase, trading_term, promo_factor, delay_factor,
    NOW(), NOW()
FROM po_snapshots
ORDER BY po_number, time DESC
ON CONFLICT (po_number) DO NOTHING;

-- 2. Insert missing Purchase Order Items
-- distinct on po_number + sku to get the latest item state
INSERT INTO purchase_order_items (
    po_id, product_id, sku, product_name, quantity, 
    price, received_quantity, eta, created_at, updated_at
)
SELECT 
    po.id, 
    ps.product_id, 
    ps.sku, 
    ps.product_name, 
    ps.quantity_ordered,
    ps.unit_price, 
    ps.quantity_received, 
    ps.eta, 
    NOW(), NOW()
FROM (
    SELECT DISTINCT ON (po_number, sku) *
    FROM po_snapshots
    ORDER BY po_number, sku, time DESC
) ps
JOIN purchase_orders po ON ps.po_number = po.po_number
ON CONFLICT (po_id, product_id) DO UPDATE SET
    eta = EXCLUDED.eta, -- Preserve/Update ETA if we run this multiple times
    updated_at = NOW();

-- 3. Recalculate Aggregates in Purchase Orders
UPDATE purchase_orders po
SET 
    po_qty = (SELECT COALESCE(SUM(quantity), 0) FROM purchase_order_items WHERE po_id = po.id),
    received_qty = (SELECT COALESCE(SUM(received_quantity), 0) FROM purchase_order_items WHERE po_id = po.id);

-- 4. Re-enable triggers
ALTER TABLE purchase_order_items ENABLE TRIGGER log_new_po_item_trigger;
ALTER TABLE purchase_order_items ENABLE TRIGGER update_po_item_quantity_trigger;
ALTER TABLE purchase_orders ENABLE TRIGGER log_po_status_change_trigger;

COMMIT;
