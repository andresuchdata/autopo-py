-- Add unique constraint to po_snapshots table for ON CONFLICT clause to work
ALTER TABLE po_snapshots 
ADD CONSTRAINT po_snapshots_time_po_number_sku_key 
UNIQUE (time, po_number, sku);
