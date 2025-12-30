package pipeline

import (
	"context"
	"sync"

	"github.com/andresuchdata/autopo-py/backend-go/internal/models"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

// ProgressTracker tracks pipeline execution progress
type ProgressTracker struct {
	runID        int64
	pipelineRepo *repository.PipelineRepository
	mu           sync.Mutex
}

// NewProgressTracker creates a new progress tracker
func NewProgressTracker(runID int64, pipelineRepo *repository.PipelineRepository) *ProgressTracker {
	return &ProgressTracker{
		runID:        runID,
		pipelineRepo: pipelineRepo,
	}
}

// UpdateFileJobStage updates the stage and progress of a file job
func (t *ProgressTracker) UpdateFileJobStage(ctx context.Context, jobID int64, stage models.PipelineStage, progressPercent int) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	logger.Log.Debug().
		Int64("job_id", jobID).
		Str("stage", string(stage)).
		Int("progress", progressPercent).
		Msg("Updating file job stage")

	return t.pipelineRepo.UpdateFileJobStage(ctx, jobID, stage, progressPercent)
}

// UpdateFileJobError records an error for a file job
func (t *ProgressTracker) UpdateFileJobError(ctx context.Context, jobID int64, errorMsg string) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	logger.Log.Error().
		Int64("job_id", jobID).
		Str("error", errorMsg).
		Msg("Recording file job error")

	return t.pipelineRepo.UpdateFileJobError(ctx, jobID, errorMsg)
}

// IncrementProcessedFiles increments the processed file count for the run
func (t *ProgressTracker) IncrementProcessedFiles(ctx context.Context) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	// Get current run
	run, err := t.pipelineRepo.GetRun(ctx, t.runID)
	if err != nil {
		return err
	}

	// Increment processed files
	processedFiles := run.ProcessedFiles + 1

	logger.Log.Debug().
		Int64("run_id", t.runID).
		Int("processed", processedFiles).
		Int("total", run.TotalFiles).
		Msg("Incrementing processed files")

	return t.pipelineRepo.UpdateRunProgress(ctx, t.runID, processedFiles, run.TotalRows)
}

// AddProcessedRows adds to the total row count for the run
func (t *ProgressTracker) AddProcessedRows(ctx context.Context, rowCount int) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	// Get current run
	run, err := t.pipelineRepo.GetRun(ctx, t.runID)
	if err != nil {
		return err
	}

	// Add rows
	totalRows := run.TotalRows + rowCount

	logger.Log.Debug().
		Int64("run_id", t.runID).
		Int("added_rows", rowCount).
		Int("total_rows", totalRows).
		Msg("Adding processed rows")

	return t.pipelineRepo.UpdateRunProgress(ctx, t.runID, run.ProcessedFiles, totalRows)
}

// MarkJobCompleted marks a job as completed
func (t *ProgressTracker) MarkJobCompleted(ctx context.Context, jobID int64, rowCount int) error {
	// Update stage to completed
	if err := t.UpdateFileJobStage(ctx, jobID, models.StageCompleted, 100); err != nil {
		return err
	}

	// Increment processed files
	if err := t.IncrementProcessedFiles(ctx); err != nil {
		return err
	}

	// Add processed rows
	if err := t.AddProcessedRows(ctx, rowCount); err != nil {
		return err
	}

	logger.Log.Info().
		Int64("job_id", jobID).
		Int("rows", rowCount).
		Msg("Job completed successfully")

	return nil
}

// MarkJobFailed marks a job as failed with an error message
func (t *ProgressTracker) MarkJobFailed(ctx context.Context, jobID int64, errorMsg string) error {
	// Update stage to failed
	if err := t.UpdateFileJobStage(ctx, jobID, models.StageFailed, 0); err != nil {
		return err
	}

	// Record error
	if err := t.UpdateFileJobError(ctx, jobID, errorMsg); err != nil {
		return err
	}

	// Still increment processed files (even though it failed)
	if err := t.IncrementProcessedFiles(ctx); err != nil {
		return err
	}

	logger.Log.Warn().
		Int64("job_id", jobID).
		Str("error", errorMsg).
		Msg("Job failed")

	return nil
}

// TrackProgress provides a callback for tracking progress during processing
func (t *ProgressTracker) TrackProgress(jobID int64) func(stage models.PipelineStage, progress int) {
	return func(stage models.PipelineStage, progress int) {
		ctx := context.Background()
		if err := t.UpdateFileJobStage(ctx, jobID, stage, progress); err != nil {
			logger.Log.Error().
				Err(err).
				Int64("job_id", jobID).
				Str("stage", string(stage)).
				Msg("Failed to update progress")
		}
	}
}
