-- Ensure daily_stock_data upserts can rely on ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS daily_stock_data_unique_idx
ON daily_stock_data (time, store_id, sku, COALESCE(brand_id, -1));

CREATE UNIQUE INDEX IF NOT EXISTS brands_name_lower_null_original_idx
ON brands (LOWER(name))
WHERE original_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stores_name_lower_null_original_idx
ON stores (LOWER(name))
WHERE original_id IS NULL;
