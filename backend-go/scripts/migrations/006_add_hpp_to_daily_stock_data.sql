-- 006_add_hpp_to_daily_stock_data.sql
-- Adds an HPP column to daily_stock_data so each snapshot can store its own cost basis

ALTER TABLE daily_stock_data
    ADD COLUMN IF NOT EXISTS hpp NUMERIC(15, 2);
