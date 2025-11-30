-- 002_add_timescaledb_daily_stock_data.sql
-- Migration to convert daily_stock_data to a TimescaleDB hypertable

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create daily_stock_data as a hypertable
CREATE TABLE IF NOT EXISTS daily_stock_data (
    time TIMESTAMPTZ NOT NULL,
    store_id INTEGER REFERENCES stores(id),
    product_id INTEGER REFERENCES products(id),
    
    -- Stock and Sales Metrics
    stock INTEGER DEFAULT 0,
    daily_sales NUMERIC(10, 2),
    max_daily_sales NUMERIC(10, 2),
    orig_daily_sales NUMERIC(10, 2),
    orig_max_daily_sales NUMERIC(10, 2),
    
    -- Supply Chain Metrics
    lead_time INTEGER,
    max_lead_time INTEGER,
    min_order INTEGER,
    is_in_padang BOOLEAN,
    safety_stock INTEGER,
    reorder_point INTEGER,
    
    -- PO Metrics
    sedang_po INTEGER, -- Sedang PO
    is_open_po BOOLEAN,
    initial_qty_po INTEGER,
    emergency_po_qty INTEGER,
    updated_regular_po_qty INTEGER,
    final_updated_regular_po_qty INTEGER,
    emergency_po_cost NUMERIC(15, 2),
    final_updated_regular_po_cost NUMERIC(15, 2),
    
    -- Analysis Metrics
    contribution_pct NUMERIC(5, 2),
    contribution_ratio NUMERIC(5, 2),
    sales_contribution NUMERIC(15, 2),
    target_days INTEGER,
    target_days_cover INTEGER,
    daily_stock_cover NUMERIC(10, 2),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Convert to hypertable with time partitioning
SELECT create_hypertable('daily_stock_data', 'time', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Add compression
ALTER TABLE daily_stock_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'store_id, product_id'
);

-- Create compression policy (compress chunks older than 7 days)
SELECT add_compression_policy('daily_stock_data', INTERVAL '7 days');

-- Create retention policy (keep data for 1 year)
SELECT add_retention_policy('daily_stock_data', INTERVAL '1 year');

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_daily_stock_time ON daily_stock_data (time DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stock_store ON daily_stock_data (store_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stock_product ON daily_stock_data (product_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stock_store_product ON daily_stock_data (store_id, product_id, time DESC);

-- Create a continuous aggregate for daily rollups
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_stock_daily
WITH (timescaledb.continuous) AS
SELECT
    time_bucket(INTERVAL '1 day', time) AS bucket,
    store_id,
    product_id,
    AVG(stock) AS avg_stock,
    SUM(daily_sales) AS total_daily_sales,
    MAX(max_daily_sales) AS max_daily_sales,
    AVG(lead_time) AS avg_lead_time
FROM daily_stock_data
GROUP BY bucket, store_id, product_id
WITH NO DATA;

-- Refresh the continuous aggregate every hour
SELECT add_continuous_aggregate_policy('daily_stock_daily',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Create a function to update updated_at
CREATE OR REPLACE FUNCTION update_daily_stock_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for updated_at
CREATE TRIGGER update_daily_stock_updated_at
BEFORE UPDATE ON daily_stock_data
FOR EACH ROW EXECUTE FUNCTION update_daily_stock_updated_at();
