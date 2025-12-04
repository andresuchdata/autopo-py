package pipeline

import (
	"context"
	"database/sql"
	"time"
)

// Repository handles database operations for pipeline tracking
type Repository struct {
	db *sql.DB
}

// NewRepository creates a new pipeline repository
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// CreatePipelineRun creates a new pipeline run record
func (r *Repository) CreatePipelineRun(ctx context.Context, run *PipelineRun) error {
	query := `
		INSERT INTO pipeline_runs (
			pipeline_name, date, status, total_files, 
			processed_files, total_rows, started_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`

	err := r.db.QueryRowContext(
		ctx, query,
		run.PipelineName, run.Date, run.Status, run.TotalFiles,
		run.ProcessedFiles, run.TotalRows, run.StartedAt,
	).Scan(&run.ID)

	return err
}

// UpdatePipelineRun updates an existing pipeline run
func (r *Repository) UpdatePipelineRun(ctx context.Context, run *PipelineRun) error {
	query := `
		UPDATE pipeline_runs
		SET status = $1, processed_files = $2, total_rows = $3,
		    completed_at = $4, error_message = $5
		WHERE id = $6
	`

	_, err := r.db.ExecContext(
		ctx, query,
		run.Status, run.ProcessedFiles, run.TotalRows,
		run.CompletedAt, run.ErrorMessage, run.ID,
	)

	return err
}

// GetPipelineRun retrieves a pipeline run by ID
func (r *Repository) GetPipelineRun(ctx context.Context, id int64) (*PipelineRun, error) {
	query := `
		SELECT id, pipeline_name, date, status, total_files,
		       processed_files, total_rows, started_at, completed_at, error_message
		FROM pipeline_runs
		WHERE id = $1
	`

	run := &PipelineRun{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&run.ID, &run.PipelineName, &run.Date, &run.Status,
		&run.TotalFiles, &run.ProcessedFiles, &run.TotalRows,
		&run.StartedAt, &run.CompletedAt, &run.ErrorMessage,
	)

	if err != nil {
		return nil, err
	}

	return run, nil
}

// GetPipelineRunByDate retrieves a pipeline run for a specific date
func (r *Repository) GetPipelineRunByDate(ctx context.Context, pipelineName string, date time.Time) (*PipelineRun, error) {
	query := `
		SELECT id, pipeline_name, date, status, total_files,
		       processed_files, total_rows, started_at, completed_at, error_message
		FROM pipeline_runs
		WHERE pipeline_name = $1 AND date = $2
	`

	run := &PipelineRun{}
	err := r.db.QueryRowContext(ctx, query, pipelineName, date).Scan(
		&run.ID, &run.PipelineName, &run.Date, &run.Status,
		&run.TotalFiles, &run.ProcessedFiles, &run.TotalRows,
		&run.StartedAt, &run.CompletedAt, &run.ErrorMessage,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return run, nil
}

// CreateFileJob creates a new file job record
func (r *Repository) CreateFileJob(ctx context.Context, job *FileJob) error {
	query := `
		INSERT INTO pipeline_file_jobs (
			pipeline_run_id, file_path, store_id, status, error_message
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`

	err := r.db.QueryRowContext(
		ctx, query,
		job.PipelineRunID, job.FilePath, job.StoreID, job.Status, job.ErrorMessage,
	).Scan(&job.ID)

	return err
}

// UpdateFileJob updates an existing file job
func (r *Repository) UpdateFileJob(ctx context.Context, job *FileJob) error {
	query := `
		UPDATE pipeline_file_jobs
		SET status = $1, error_message = $2, processed_at = $3, retry_count = $4
		WHERE id = $5
	`

	_, err := r.db.ExecContext(
		ctx, query,
		job.Status, job.ErrorMessage, job.ProcessedAt, job.RetryCount, job.ID,
	)

	return err
}

// GetFileJobsByRunID retrieves all file jobs for a pipeline run
func (r *Repository) GetFileJobsByRunID(ctx context.Context, runID int64) ([]*FileJob, error) {
	query := `
		SELECT id, pipeline_run_id, file_path, store_id, status,
		       error_message, processed_at, retry_count
		FROM pipeline_file_jobs
		WHERE pipeline_run_id = $1
		ORDER BY id
	`

	rows, err := r.db.QueryContext(ctx, query, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []*FileJob
	for rows.Next() {
		job := &FileJob{}
		err := rows.Scan(
			&job.ID, &job.PipelineRunID, &job.FilePath, &job.StoreID,
			&job.Status, &job.ErrorMessage, &job.ProcessedAt, &job.RetryCount,
		)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}

	return jobs, rows.Err()
}

// GetFailedFileJobs retrieves all failed file jobs for retry
func (r *Repository) GetFailedFileJobs(ctx context.Context, pipelineName string, maxRetries int) ([]*FileJob, error) {
	query := `
		SELECT fj.id, fj.pipeline_run_id, fj.file_path, fj.store_id, fj.status,
		       fj.error_message, fj.processed_at, fj.retry_count
		FROM pipeline_file_jobs fj
		JOIN pipeline_runs pr ON fj.pipeline_run_id = pr.id
		WHERE pr.pipeline_name = $1 
		  AND fj.status = $2
		  AND fj.retry_count < $3
		ORDER BY fj.id
	`

	rows, err := r.db.QueryContext(ctx, query, pipelineName, FileStatusFailed, maxRetries)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []*FileJob
	for rows.Next() {
		job := &FileJob{}
		err := rows.Scan(
			&job.ID, &job.PipelineRunID, &job.FilePath, &job.StoreID,
			&job.Status, &job.ErrorMessage, &job.ProcessedAt, &job.RetryCount,
		)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}

	return jobs, rows.Err()
}

// GetPipelineStats retrieves statistics for a pipeline
func (r *Repository) GetPipelineStats(ctx context.Context, pipelineName string, since time.Time) (*PipelineMetrics, error) {
	query := `
		SELECT 
			COUNT(*) as files_processed,
			COALESCE(SUM(total_rows), 0) as rows_processed,
			COUNT(CASE WHEN status = $2 THEN 1 END) as error_count,
			MAX(completed_at) as last_processed_at
		FROM pipeline_runs
		WHERE pipeline_name = $1 
		  AND started_at >= $3
		  AND status IN ($4, $2)
	`

	metrics := &PipelineMetrics{}
	err := r.db.QueryRowContext(
		ctx, query,
		pipelineName, StatusFailed, since, StatusCompleted,
	).Scan(
		&metrics.FilesProcessed,
		&metrics.RowsProcessed,
		&metrics.ErrorCount,
		&metrics.LastProcessedAt,
	)

	if err == sql.ErrNoRows {
		return &PipelineMetrics{}, nil
	}

	return metrics, err
}

// IncrementProcessedFiles atomically increments the processed file count
func (r *Repository) IncrementProcessedFiles(ctx context.Context, runID int64) error {
	query := `
		UPDATE pipeline_runs
		SET processed_files = processed_files + 1
		WHERE id = $1
	`

	_, err := r.db.ExecContext(ctx, query, runID)
	return err
}

// AddRowCount atomically adds to the total row count
func (r *Repository) AddRowCount(ctx context.Context, runID int64, count int) error {
	query := `
		UPDATE pipeline_runs
		SET total_rows = total_rows + $1
		WHERE id = $2
	`

	_, err := r.db.ExecContext(ctx, query, count, runID)
	return err
}

// GetTodaysPipelineRuns retrieves all pipeline runs for today
func (r *Repository) GetTodaysPipelineRuns(ctx context.Context) ([]*PipelineRun, error) {
	query := `
		SELECT id, pipeline_name, date, status, total_files,
		       processed_files, total_rows, started_at, completed_at, error_message
		FROM pipeline_runs
		WHERE date = CURRENT_DATE
		ORDER BY pipeline_name, started_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []*PipelineRun
	for rows.Next() {
		run := &PipelineRun{}
		err := rows.Scan(
			&run.ID, &run.PipelineName, &run.Date, &run.Status,
			&run.TotalFiles, &run.ProcessedFiles, &run.TotalRows,
			&run.StartedAt, &run.CompletedAt, &run.ErrorMessage,
		)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}

	return runs, rows.Err()
}
