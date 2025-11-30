-- Add unique constraint to po_snapshots table for ON CONFLICT clause to work

-- handle if exists
CREATE UNIQUE INDEX IF NOT EXISTS po_snapshots_time_po_number_sku_key 
ON po_snapshots (time, po_number, sku);
