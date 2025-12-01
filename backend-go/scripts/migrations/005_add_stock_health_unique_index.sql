-- Ensure daily_stock_data upserts can rely on ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS daily_stock_data_time_store_sku_brand_idx
ON daily_stock_data (time, store_id, sku, brand_id);
