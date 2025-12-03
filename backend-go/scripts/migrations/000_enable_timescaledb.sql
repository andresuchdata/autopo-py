-- 000_enable_timescaledb.sql
-- Ensure TimescaleDB extension is available
-- The extension persists across schema resets and will be reused

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;