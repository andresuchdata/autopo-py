-- 000_enable_timescaledb.sql
-- Ensure TimescaleDB extension is available
-- Note: We don't DROP the extension here because it can't be cleanly recreated in the same session

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;