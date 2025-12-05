-- Migration: Increase decimal precision for po_snapshots to handle large values
-- This fixes the numeric field overflow error when importing CSV data with large amounts

-- Increase unit_price and total_amount precision from DECIMAL(12,2) to DECIMAL(18,2)
-- DECIMAL(18,2) can store values up to 9,999,999,999,999,999.99 (16 digits before decimal)
ALTER TABLE po_snapshots 
    ALTER COLUMN unit_price TYPE DECIMAL(18, 2),
    ALTER COLUMN total_amount TYPE DECIMAL(18, 2);

-- Also increase min_purchase, promo_factor, and delay_factor for consistency
ALTER TABLE po_snapshots
    ALTER COLUMN min_purchase TYPE DECIMAL(18, 2),
    ALTER COLUMN promo_factor TYPE DECIMAL(18, 2),
    ALTER COLUMN delay_factor TYPE DECIMAL(18, 2);
