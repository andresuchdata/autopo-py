-- Migration: Add pipeline configuration and stage tracking
-- Description: Adds config JSONB column and stage tracking to pipeline tables

-- Add config column to pipeline_runs for storing run configuration
ALTER TABLE pipeline_runs 
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

-- Add stage column to pipeline_file_jobs for tracking current processing stage
ALTER TABLE pipeline_file_jobs
ADD COLUMN IF NOT EXISTS stage VARCHAR(50) DEFAULT 'queued';

-- Add progress_percentage for granular progress tracking
ALTER TABLE pipeline_file_jobs
ADD COLUMN IF NOT EXISTS progress_percentage INT DEFAULT 0;

-- Add priority for queue management
ALTER TABLE pipeline_runs
ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;

-- Add paused state tracking
ALTER TABLE pipeline_runs
ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;

-- Add scheduled run tracking
ALTER TABLE pipeline_runs
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Add retry tracking
ALTER TABLE pipeline_file_jobs
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

-- Create index for priority queue
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_priority ON pipeline_runs(priority DESC, created_at ASC) WHERE status = 'pending';

-- Create index for paused runs
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_paused ON pipeline_runs(is_paused) WHERE is_paused = TRUE;

-- Create index for scheduled runs
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_scheduled ON pipeline_runs(scheduled_at) WHERE scheduled_at IS NOT NULL AND status = 'pending';

-- Create index for stage tracking
CREATE INDEX IF NOT EXISTS idx_file_jobs_stage ON pipeline_file_jobs(stage);

-- Comments for new columns
COMMENT ON COLUMN pipeline_runs.config IS 'JSON configuration for the pipeline run (data source, store filters, retry config, etc.)';
COMMENT ON COLUMN pipeline_runs.priority IS 'Priority for queue management (higher = more priority)';
COMMENT ON COLUMN pipeline_runs.is_paused IS 'Whether this pipeline run is currently paused';
COMMENT ON COLUMN pipeline_runs.scheduled_at IS 'When this pipeline run is scheduled to execute';

COMMENT ON COLUMN pipeline_file_jobs.stage IS 'Current processing stage: queued, downloading, cleaning, calculating, finishing, completed, failed';
COMMENT ON COLUMN pipeline_file_jobs.progress_percentage IS 'Progress percentage (0-100) for granular tracking';
COMMENT ON COLUMN pipeline_file_jobs.last_retry_at IS 'Timestamp of last retry attempt';
