package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/models"
)

// PipelineRepository handles database operations for pipeline runs
type PipelineRepository struct {
	db *sql.DB
}

// NewPipelineRepository creates a new pipeline repository
func NewPipelineRepository(db *sql.DB) *PipelineRepository {
	return &PipelineRepository{db: db}
}

// GetDB returns the underlying database connection
func (r *PipelineRepository) GetDB() *sql.DB {
	return r.db
}

// CreateRun creates a new pipeline run
func (r *PipelineRepository) CreateRun(ctx context.Context, run *models.PipelineRun) error {
	query := `
		INSERT INTO pipeline_runs (
			pipeline_name, date, status, total_files, processed_files, 
			total_rows, started_at, config, priority, is_paused, scheduled_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at, updated_at
	`

	err := r.db.QueryRowContext(
		ctx, query,
		run.PipelineName, run.Date, run.Status, run.TotalFiles, run.ProcessedFiles,
		run.TotalRows, run.StartedAt, run.Config, run.Priority, run.IsPaused, run.ScheduledAt,
	).Scan(&run.ID, &run.CreatedAt, &run.UpdatedAt)

	return err
}

// GetRun retrieves a pipeline run by ID
func (r *PipelineRepository) GetRun(ctx context.Context, id int64) (*models.PipelineRun, error) {
	query := `
		SELECT id, pipeline_name, date, status, total_files, processed_files,
			total_rows, started_at, completed_at, error_message, config,
			priority, is_paused, scheduled_at, created_at, updated_at
		FROM pipeline_runs
		WHERE id = $1
	`

	run := &models.PipelineRun{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&run.ID, &run.PipelineName, &run.Date, &run.Status, &run.TotalFiles,
		&run.ProcessedFiles, &run.TotalRows, &run.StartedAt, &run.CompletedAt,
		&run.ErrorMessage, &run.Config, &run.Priority, &run.IsPaused,
		&run.ScheduledAt, &run.CreatedAt, &run.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrPipelineNotFound
	}

	return run, err
}

// GetRunByPipelineAndDate retrieves a pipeline run by name and date
func (r *PipelineRepository) GetRunByPipelineAndDate(ctx context.Context, pipelineName string, date time.Time) (*models.PipelineRun, error) {
	query := `
		SELECT id, pipeline_name, date, status, total_files, processed_files,
			total_rows, started_at, completed_at, error_message, config,
			priority, is_paused, scheduled_at, created_at, updated_at
		FROM pipeline_runs
		WHERE pipeline_name = $1 AND date = $2
		ORDER BY created_at DESC
		LIMIT 1
	`

	run := &models.PipelineRun{}
	err := r.db.QueryRowContext(ctx, query, pipelineName, date).Scan(
		&run.ID, &run.PipelineName, &run.Date, &run.Status, &run.TotalFiles,
		&run.ProcessedFiles, &run.TotalRows, &run.StartedAt, &run.CompletedAt,
		&run.ErrorMessage, &run.Config, &run.Priority, &run.IsPaused,
		&run.ScheduledAt, &run.CreatedAt, &run.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrPipelineNotFound
	}

	return run, err
}

// UpdateRunStatus updates the status of a pipeline run
func (r *PipelineRepository) UpdateRunStatus(ctx context.Context, id int64, status models.PipelineStatus, errorMsg *string) error {
	query := `
		UPDATE pipeline_runs
		SET status = $1, error_message = $2, 
			completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
		WHERE id = $3
	`

	_, err := r.db.ExecContext(ctx, query, status, errorMsg, id)
	return err
}

// UpdateRun updates an existing pipeline run
func (r *PipelineRepository) UpdateRun(ctx context.Context, run *models.PipelineRun) error {
	query := `
		UPDATE pipeline_runs
		SET status = $1, processed_files = $2, total_rows = $3,
		    completed_at = $4, error_message = $5, updated_at = NOW()
		WHERE id = $6
	`

	_, err := r.db.ExecContext(
		ctx, query,
		run.Status, run.ProcessedFiles, run.TotalRows,
		run.CompletedAt, run.ErrorMessage, run.ID,
	)

	return err
}

// UpdateRunProgress updates the progress counters of a pipeline run
func (r *PipelineRepository) UpdateRunProgress(ctx context.Context, id int64, processedFiles, totalRows int) error {
	query := `
		UPDATE pipeline_runs
		SET processed_files = $1, total_rows = $2
		WHERE id = $3
	`

	_, err := r.db.ExecContext(ctx, query, processedFiles, totalRows, id)
	return err
}

// PauseRun pauses a running pipeline
func (r *PipelineRepository) PauseRun(ctx context.Context, id int64) error {
	query := `
		UPDATE pipeline_runs
		SET is_paused = TRUE, status = 'paused'
		WHERE id = $1 AND status = 'processing'
	`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rows == 0 {
		return fmt.Errorf("pipeline run %d is not in processing state", id)
	}

	return nil
}

// ResumeRun resumes a paused pipeline
func (r *PipelineRepository) ResumeRun(ctx context.Context, id int64) error {
	query := `
		UPDATE pipeline_runs
		SET is_paused = FALSE, status = 'processing'
		WHERE id = $1 AND is_paused = TRUE
	`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rows == 0 {
		return models.ErrPipelineNotPaused
	}

	return nil
}

// ListRuns lists pipeline runs with optional filters
func (r *PipelineRepository) ListRuns(ctx context.Context, pipelineName string, limit, offset int) ([]models.PipelineRun, error) {
	query := `
		SELECT id, pipeline_name, date, status, total_files, processed_files,
			total_rows, started_at, completed_at, error_message, config,
			priority, is_paused, scheduled_at, created_at, updated_at
		FROM pipeline_runs
		WHERE pipeline_name = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`

	rows, err := r.db.QueryContext(ctx, query, pipelineName, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []models.PipelineRun
	for rows.Next() {
		var run models.PipelineRun
		err := rows.Scan(
			&run.ID, &run.PipelineName, &run.Date, &run.Status, &run.TotalFiles,
			&run.ProcessedFiles, &run.TotalRows, &run.StartedAt, &run.CompletedAt,
			&run.ErrorMessage, &run.Config, &run.Priority, &run.IsPaused,
			&run.ScheduledAt, &run.CreatedAt, &run.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}

	return runs, rows.Err()
}

// CreateFileJob creates a new file processing job
func (r *PipelineRepository) CreateFileJob(ctx context.Context, job *models.PipelineFileJob) error {
	query := `
		INSERT INTO pipeline_file_jobs (
			pipeline_run_id, file_path, store_id, status, stage, 
			progress_percentage, retry_count
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`

	err := r.db.QueryRowContext(
		ctx, query,
		job.PipelineRunID, job.FilePath, job.StoreID, job.Status,
		job.Stage, job.ProgressPercent, job.RetryCount,
	).Scan(&job.ID, &job.CreatedAt, &job.UpdatedAt)

	return err
}

// UpdateFileJob updates an existing file job
func (r *PipelineRepository) UpdateFileJob(ctx context.Context, job *models.PipelineFileJob) error {
	query := `
		UPDATE pipeline_file_jobs
		SET status = $1, error_message = $2, processed_at = $3, 
		    retry_count = $4, stage = $5, progress_percentage = $6, updated_at = NOW()
		WHERE id = $7
	`

	_, err := r.db.ExecContext(
		ctx, query,
		job.Status, job.ErrorMessage, job.ProcessedAt,
		job.RetryCount, job.Stage, job.ProgressPercent, job.ID,
	)

	return err
}

// UpdateFileJobStage updates the stage and progress of a file job
func (r *PipelineRepository) UpdateFileJobStage(ctx context.Context, id int64, stage models.PipelineStage, progressPercent int) error {
	query := `
		UPDATE pipeline_file_jobs
		SET stage = $1, progress_percentage = $2,
			status = CASE 
				WHEN $1 = 'completed' THEN 'completed'
				WHEN $1 = 'failed' THEN 'failed'
				ELSE 'processing'
			END,
			processed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE processed_at END
		WHERE id = $3
	`

	_, err := r.db.ExecContext(ctx, query, stage, progressPercent, id)
	return err
}

// UpdateFileJobError updates the error message for a file job
func (r *PipelineRepository) UpdateFileJobError(ctx context.Context, id int64, errorMsg string) error {
	query := `
		UPDATE pipeline_file_jobs
		SET status = 'failed', stage = 'failed', error_message = $1, processed_at = NOW()
		WHERE id = $2
	`

	_, err := r.db.ExecContext(ctx, query, errorMsg, id)
	return err
}

// IncrementFileJobRetry increments the retry count for a file job
func (r *PipelineRepository) IncrementFileJobRetry(ctx context.Context, id int64) error {
	query := `
		UPDATE pipeline_file_jobs
		SET retry_count = retry_count + 1, last_retry_at = NOW()
		WHERE id = $1
	`

	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// IncrementProcessedFiles atomically increments the processed file count
func (r *PipelineRepository) IncrementProcessedFiles(ctx context.Context, runID int64) error {
	query := `
		UPDATE pipeline_runs
		SET processed_files = processed_files + 1, updated_at = NOW()
		WHERE id = $1
	`

	_, err := r.db.ExecContext(ctx, query, runID)
	return err
}

// AddRowCount atomically adds to the total row count
func (r *PipelineRepository) AddRowCount(ctx context.Context, runID int64, count int) error {
	query := `
		UPDATE pipeline_runs
		SET total_rows = total_rows + $1, updated_at = NOW()
		WHERE id = $2
	`

	_, err := r.db.ExecContext(ctx, query, count, runID)
	return err
}

// GetFileJobsByRunID retrieves all file jobs for a pipeline run
func (r *PipelineRepository) GetFileJobsByRunID(ctx context.Context, runID int64) ([]models.PipelineFileJob, error) {
	query := `
		SELECT id, pipeline_run_id, file_path, store_id, status, stage,
			progress_percentage, error_message, processed_at, retry_count,
			last_retry_at, created_at, updated_at
		FROM pipeline_file_jobs
		WHERE pipeline_run_id = $1
		ORDER BY created_at ASC
	`

	rows, err := r.db.QueryContext(ctx, query, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []models.PipelineFileJob
	for rows.Next() {
		var job models.PipelineFileJob
		err := rows.Scan(
			&job.ID, &job.PipelineRunID, &job.FilePath, &job.StoreID,
			&job.Status, &job.Stage, &job.ProgressPercent, &job.ErrorMessage,
			&job.ProcessedAt, &job.RetryCount, &job.LastRetryAt,
			&job.CreatedAt, &job.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}

	return jobs, rows.Err()
}

// GetStoreProgress retrieves aggregated progress for each store in a pipeline run
func (r *PipelineRepository) GetStoreProgress(ctx context.Context, runID int64) ([]models.StoreProgress, error) {
	query := `
		SELECT 
			j.store_id,
			s.name as store_name,
			j.status,
			j.stage,
			j.progress_percentage,
			j.error_message,
			j.retry_count,
			j.updated_at
		FROM pipeline_file_jobs j
		LEFT JOIN stores s ON s.id = j.store_id
		WHERE j.pipeline_run_id = $1 AND j.store_id IS NOT NULL
		ORDER BY s.name ASC
	`

	rows, err := r.db.QueryContext(ctx, query, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var progress []models.StoreProgress
	for rows.Next() {
		var sp models.StoreProgress
		err := rows.Scan(
			&sp.StoreID, &sp.StoreName, &sp.Status, &sp.Stage,
			&sp.ProgressPercent, &sp.ErrorMessage, &sp.RetryCount, &sp.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		progress = append(progress, sp)
	}

	return progress, rows.Err()
}

// GetFailedFileJobs retrieves all failed file jobs for a pipeline run
func (r *PipelineRepository) GetFailedFileJobs(ctx context.Context, runID int64) ([]models.PipelineFileJob, error) {
	query := `
		SELECT id, pipeline_run_id, file_path, store_id, status, stage,
			progress_percentage, error_message, processed_at, retry_count,
			last_retry_at, created_at, updated_at
		FROM pipeline_file_jobs
		WHERE pipeline_run_id = $1 AND status = 'failed'
		ORDER BY created_at ASC
	`

	rows, err := r.db.QueryContext(ctx, query, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []models.PipelineFileJob
	for rows.Next() {
		var job models.PipelineFileJob
		err := rows.Scan(
			&job.ID, &job.PipelineRunID, &job.FilePath, &job.StoreID,
			&job.Status, &job.Stage, &job.ProgressPercent, &job.ErrorMessage,
			&job.ProcessedAt, &job.RetryCount, &job.LastRetryAt,
			&job.CreatedAt, &job.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}

	return jobs, rows.Err()
}

// ResetFailedJobs resets failed jobs to queued status for retry
func (r *PipelineRepository) ResetFailedJobs(ctx context.Context, runID int64) error {
	query := `
		UPDATE pipeline_file_jobs
		SET status = 'queued', stage = 'queued', error_message = NULL
		WHERE pipeline_run_id = $1 AND status = 'failed'
	`

	_, err := r.db.ExecContext(ctx, query, runID)
	return err
}

// GetRunSummary retrieves a complete summary of a pipeline run
func (r *PipelineRepository) GetRunSummary(ctx context.Context, runID int64) (*models.PipelineRunSummary, error) {
	run, err := r.GetRun(ctx, runID)
	if err != nil {
		return nil, err
	}

	storeProgress, err := r.GetStoreProgress(ctx, runID)
	if err != nil {
		return nil, err
	}

	// Count jobs by status
	countQuery := `
		SELECT 
			COUNT(*) FILTER (WHERE status = 'queued') as queued,
			COUNT(*) FILTER (WHERE status = 'processing') as processing,
			COUNT(*) FILTER (WHERE status = 'completed') as completed,
			COUNT(*) FILTER (WHERE status = 'failed') as failed
		FROM pipeline_file_jobs
		WHERE pipeline_run_id = $1
	`

	var queuedCount, processingCount, completedCount, failedCount int
	err = r.db.QueryRowContext(ctx, countQuery, runID).Scan(
		&queuedCount, &processingCount, &completedCount, &failedCount,
	)
	if err != nil {
		return nil, err
	}

	return &models.PipelineRunSummary{
		Run:             *run,
		StoreProgress:   storeProgress,
		QueuedCount:     queuedCount,
		ProcessingCount: processingCount,
		CompletedCount:  completedCount,
		FailedCount:     failedCount,
	}, nil
}

// GetNextScheduledRun retrieves the next scheduled pipeline run that's ready to execute
func (r *PipelineRepository) GetNextScheduledRun(ctx context.Context) (*models.PipelineRun, error) {
	query := `
		SELECT id, pipeline_name, date, status, total_files, processed_files,
			total_rows, started_at, completed_at, error_message, config,
			priority, is_paused, scheduled_at, created_at, updated_at
		FROM pipeline_runs
		WHERE status = 'pending' 
			AND scheduled_at IS NOT NULL 
			AND scheduled_at <= NOW()
		ORDER BY priority DESC, scheduled_at ASC
		LIMIT 1
		FOR UPDATE SKIP LOCKED
	`

	run := &models.PipelineRun{}
	err := r.db.QueryRowContext(ctx, query).Scan(
		&run.ID, &run.PipelineName, &run.Date, &run.Status, &run.TotalFiles,
		&run.ProcessedFiles, &run.TotalRows, &run.StartedAt, &run.CompletedAt,
		&run.ErrorMessage, &run.Config, &run.Priority, &run.IsPaused,
		&run.ScheduledAt, &run.CreatedAt, &run.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}

	return run, err
}
