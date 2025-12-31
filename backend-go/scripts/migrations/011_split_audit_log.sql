-- Migration: Split Audit Log and Remove Daily Snapshot Triggers
-- 1. Create po_audit_trails for real-time change tracking.
-- 2. Remove triggers from purchase_orders/items that wrote to po_snapshots.
-- 3. Add triggers to write to po_audit_trails.

-- 1. Create Audit Trail Table
CREATE TABLE IF NOT EXISTS po_audit_trails (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    event_source VARCHAR(50) DEFAULT 'system', -- 'app', 'system', 'import'
    
    po_id BIGINT,
    po_number VARCHAR(100),
    sku VARCHAR(100),
    
    -- Changed Fields (JSONB is flexible, but let's stick to structured for key metrics if needed, or JSONB for diff)
    -- Using simpler structured approach for key business metrics + JSONB for details
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Capture key state at time of change
    status INTEGER,
    previous_status INTEGER,
    
    eta DATE,
    previous_eta DATE,
    
    quantity INTEGER,
    received_quantity INTEGER,
    
    changes JSONB -- Stores full diff { "field": {"old": val, "new": val} }
);

CREATE INDEX IF NOT EXISTS idx_po_audit_trails_po_number ON po_audit_trails (po_number);
CREATE INDEX IF NOT EXISTS idx_po_audit_trails_sku ON po_audit_trails (sku);
CREATE INDEX IF NOT EXISTS idx_po_audit_trails_changed_at ON po_audit_trails (changed_at DESC);

-- 2. Drop Old Triggers (Stop spamming po_snapshots)
DROP TRIGGER IF EXISTS log_po_status_change_trigger ON purchase_orders;
DROP TRIGGER IF EXISTS log_new_po_item_trigger ON purchase_order_items;
DROP TRIGGER IF EXISTS update_po_item_quantity_trigger ON purchase_order_items;

-- 3. Create Audit Trigger Function
CREATE OR REPLACE FUNCTION log_po_audit_change()
RETURNS TRIGGER AS $$
DECLARE
    audit_po_id BIGINT;
    audit_po_number VARCHAR;
    audit_sku VARCHAR;
    changes JSONB;
    
    -- Variables for INSERT
    v_status INTEGER;
    v_prev_status INTEGER;
    v_eta DATE;
    v_prev_eta DATE;
    v_qty INTEGER;
BEGIN
    changes := '{}'::JSONB;
    v_status := NULL;
    v_prev_status := NULL;
    v_eta := NULL;
    v_prev_eta := NULL;
    v_qty := NULL;
    
    IF TG_TABLE_NAME = 'purchase_orders' THEN
        audit_po_id := NEW.id;
        audit_po_number := NEW.po_number;
        audit_sku := NULL;
        
        -- Safe assignments for PO table
        v_status := NEW.status;
        v_prev_status := OLD.status;
        
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            changes := jsonb_set(changes, '{status}', jsonb_build_object('old', OLD.status, 'new', NEW.status));
        END IF;
         
    ELSIF TG_TABLE_NAME = 'purchase_order_items' THEN
        audit_po_id := NEW.po_id;
        -- Need to fetch PO Number
        SELECT po_number INTO audit_po_number FROM purchase_orders WHERE id = NEW.po_id;
        audit_sku := NEW.sku;
        
        -- Safe assignments for PO Items table
        v_eta := NEW.eta;
        v_prev_eta := OLD.eta;
        v_qty := NEW.quantity;
        
        IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
            changes := jsonb_set(changes, '{quantity}', jsonb_build_object('old', OLD.quantity, 'new', NEW.quantity));
        END IF;
        
        IF OLD.eta IS DISTINCT FROM NEW.eta THEN
            changes := jsonb_set(changes, '{eta}', jsonb_build_object('old', OLD.eta, 'new', NEW.eta));
        END IF;
    END IF;

    IF changes != '{}'::JSONB THEN
        INSERT INTO po_audit_trails (
            event_type, po_id, po_number, sku, changed_at, 
            status, previous_status, eta, previous_eta, quantity, changes
        ) VALUES (
            TG_OP, 
            audit_po_id, 
            audit_po_number, 
            audit_sku, 
            NOW(),
            v_status,
            v_prev_status,
            v_eta,
            v_prev_eta,
            v_qty,
            changes
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach Audit Triggers
DROP TRIGGER IF EXISTS audit_po_changes ON purchase_orders;
CREATE TRIGGER audit_po_changes
AFTER UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION log_po_audit_change();

DROP TRIGGER IF EXISTS audit_po_item_changes ON purchase_order_items;
CREATE TRIGGER audit_po_item_changes
AFTER UPDATE ON purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION log_po_audit_change();
