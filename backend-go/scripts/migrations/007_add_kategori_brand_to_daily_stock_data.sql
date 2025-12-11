-- 007_add_kategori_brand_to_daily_stock_data.sql
-- Add kategori_brand column used for master data and filtering

ALTER TABLE daily_stock_data
    ADD COLUMN IF NOT EXISTS kategori_brand VARCHAR(255);
