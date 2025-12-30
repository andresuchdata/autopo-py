-- Migration: Create pipeline tracking tables
-- Description: Adds tables for tracking pipeline runs and file processing jobs

-- Pipeline runs table: tracks each execution of a pipeline for a specific date
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id BIGSERIAL PRIMARY KEY,
    pipeline_name VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total_files INT NOT NULL DEFAULT 0,
    processed_files INT NOT NULL DEFAULT 0,
    total_rows INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(pipeline_name, date)
);

-- Index for querying by pipeline and date
CREATE INDEX idx_pipeline_runs_pipeline_date ON pipeline_runs(pipeline_name, date DESC);

-- Index for querying by status
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);

-- Index for querying today's runs
CREATE INDEX idx_pipeline_runs_date ON pipeline_runs(date DESC);

-- File jobs table: tracks processing of individual files
CREATE TABLE IF NOT EXISTS pipeline_file_jobs (
    id BIGSERIAL PRIMARY KEY,
    pipeline_run_id BIGINT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    store_id INT REFERENCES stores(id),
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying jobs by run
CREATE INDEX idx_file_jobs_run_id ON pipeline_file_jobs(pipeline_run_id);

-- Index for querying failed jobs
CREATE INDEX idx_file_jobs_status ON pipeline_file_jobs(status) WHERE status = 'failed';

-- Index for querying by store
CREATE INDEX idx_file_jobs_store_id ON pipeline_file_jobs(store_id) WHERE store_id IS NOT NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pipeline_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pipeline_runs_updated_at
    BEFORE UPDATE ON pipeline_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_pipeline_updated_at();

CREATE TRIGGER file_jobs_updated_at
    BEFORE UPDATE ON pipeline_file_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_pipeline_updated_at();

-- Comments for documentation
COMMENT ON TABLE pipeline_runs IS 'Tracks execution of data pipelines (stock health, PO snapshots, etc.)';
COMMENT ON TABLE pipeline_file_jobs IS 'Tracks processing of individual files within a pipeline run';

COMMENT ON COLUMN pipeline_runs.pipeline_name IS 'Identifier for the pipeline type (e.g., stock_health, po_snapshots)';
COMMENT ON COLUMN pipeline_runs.date IS 'The business date this pipeline run processes data for';
COMMENT ON COLUMN pipeline_runs.status IS 'Current status: pending, processing, completed, failed';
COMMENT ON COLUMN pipeline_runs.total_files IS 'Total number of files to process';
COMMENT ON COLUMN pipeline_runs.processed_files IS 'Number of files successfully processed';
COMMENT ON COLUMN pipeline_runs.total_rows IS 'Total number of data rows processed';

COMMENT ON COLUMN pipeline_file_jobs.file_path IS 'Path to the input file being processed';
COMMENT ON COLUMN pipeline_file_jobs.store_id IS 'Associated store ID (NULL for non-store files)';
COMMENT ON COLUMN pipeline_file_jobs.status IS 'Current status: queued, processing, completed, failed';
COMMENT ON COLUMN pipeline_file_jobs.retry_count IS 'Number of times this job has been retried';
