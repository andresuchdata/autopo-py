package service

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/models"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

// RetryHandler handles retry logic with exponential backoff
type RetryHandler struct {
	pipelineRepo *repository.PipelineRepository
}

// NewRetryHandler creates a new retry handler
func NewRetryHandler(pipelineRepo *repository.PipelineRepository) *RetryHandler {
	return &RetryHandler{
		pipelineRepo: pipelineRepo,
	}
}

// CalculateBackoff calculates the backoff duration for a retry attempt
func (h *RetryHandler) CalculateBackoff(config models.RetryConfig, attemptNumber int) time.Duration {
	if !config.Enabled || attemptNumber >= config.MaxAttempts {
		return 0
	}

	// Calculate exponential backoff: initial * (multiplier ^ attempt)
	backoffSec := float64(config.InitialBackoffSec) * math.Pow(config.BackoffMultiplier, float64(attemptNumber))

	// Cap at max backoff
	if backoffSec > float64(config.MaxBackoffSec) {
		backoffSec = float64(config.MaxBackoffSec)
	}

	return time.Duration(backoffSec) * time.Second
}

// ShouldRetry determines if a job should be retried based on the retry config
func (h *RetryHandler) ShouldRetry(config models.RetryConfig, currentAttempt int) bool {
	if !config.Enabled {
		return false
	}

	return currentAttempt < config.MaxAttempts
}

// ScheduleRetry schedules a retry for a failed job
func (h *RetryHandler) ScheduleRetry(ctx context.Context, job *models.PipelineFileJob, config models.RetryConfig) error {
	if !h.ShouldRetry(config, job.RetryCount) {
		logger.Log.Warn().
			Int64("job_id", job.ID).
			Int("retry_count", job.RetryCount).
			Int("max_attempts", config.MaxAttempts).
			Msg("Max retry attempts reached, not scheduling retry")
		return fmt.Errorf("max retry attempts (%d) reached", config.MaxAttempts)
	}

	backoff := h.CalculateBackoff(config, job.RetryCount)

	logger.Log.Info().
		Int64("job_id", job.ID).
		Int("retry_count", job.RetryCount).
		Dur("backoff", backoff).
		Msg("Scheduling retry with exponential backoff")

	// In a full implementation, you would:
	// 1. Schedule the job to be retried after the backoff duration
	// 2. Update the job's last_retry_at timestamp
	// 3. Increment the retry count

	// For now, we'll just increment the retry count and update the timestamp
	if err := h.pipelineRepo.IncrementFileJobRetry(ctx, job.ID); err != nil {
		return fmt.Errorf("failed to increment retry count: %w", err)
	}

	return nil
}

// RetryFailedJobs retries all failed jobs for a pipeline run with exponential backoff
func (h *RetryHandler) RetryFailedJobs(ctx context.Context, runID int64, config models.RetryConfig) error {
	// Get all failed jobs
	failedJobs, err := h.pipelineRepo.GetFailedFileJobs(ctx, runID)
	if err != nil {
		return fmt.Errorf("failed to get failed jobs: %w", err)
	}

	if len(failedJobs) == 0 {
		logger.Log.Info().Int64("run_id", runID).Msg("No failed jobs to retry")
		return nil
	}

	logger.Log.Info().
		Int64("run_id", runID).
		Int("failed_count", len(failedJobs)).
		Msg("Starting retry for failed jobs")

	retriedCount := 0
	skippedCount := 0

	for _, job := range failedJobs {
		if h.ShouldRetry(config, job.RetryCount) {
			backoff := h.CalculateBackoff(config, job.RetryCount)

			logger.Log.Debug().
				Int64("job_id", job.ID).
				Str("file", job.FilePath).
				Int("retry_count", job.RetryCount).
				Dur("backoff", backoff).
				Msg("Scheduling job retry")

			// In a production system, you would schedule the retry after the backoff
			// For now, we'll just reset the job to queued status
			if err := h.pipelineRepo.IncrementFileJobRetry(ctx, job.ID); err != nil {
				logger.Log.Error().Err(err).Int64("job_id", job.ID).Msg("Failed to increment retry count")
				continue
			}

			retriedCount++
		} else {
			logger.Log.Warn().
				Int64("job_id", job.ID).
				Str("file", job.FilePath).
				Int("retry_count", job.RetryCount).
				Int("max_attempts", config.MaxAttempts).
				Msg("Skipping retry - max attempts reached")
			skippedCount++
		}
	}

	// Reset jobs that can be retried to queued status
	if retriedCount > 0 {
		if err := h.pipelineRepo.ResetFailedJobs(ctx, runID); err != nil {
			return fmt.Errorf("failed to reset failed jobs: %w", err)
		}
	}

	logger.Log.Info().
		Int64("run_id", runID).
		Int("retried", retriedCount).
		Int("skipped", skippedCount).
		Msg("Retry scheduling completed")

	return nil
}

// GetNextRetryTime calculates when a job should be retried next
func (h *RetryHandler) GetNextRetryTime(job *models.PipelineFileJob, config models.RetryConfig) time.Time {
	if job.LastRetryAt == nil {
		// First retry - use current time plus backoff
		backoff := h.CalculateBackoff(config, job.RetryCount)
		return time.Now().Add(backoff)
	}

	// Subsequent retry - use last retry time plus backoff
	backoff := h.CalculateBackoff(config, job.RetryCount)
	return job.LastRetryAt.Add(backoff)
}

// FormatRetryInfo returns a human-readable string describing the retry status
func (h *RetryHandler) FormatRetryInfo(job *models.PipelineFileJob, config models.RetryConfig) string {
	if !config.Enabled {
		return "Retry disabled"
	}

	if job.RetryCount >= config.MaxAttempts {
		return fmt.Sprintf("Max retries reached (%d/%d)", job.RetryCount, config.MaxAttempts)
	}

	nextRetry := h.GetNextRetryTime(job, config)
	backoff := h.CalculateBackoff(config, job.RetryCount)

	return fmt.Sprintf("Retry %d/%d in %v (next: %s)",
		job.RetryCount+1,
		config.MaxAttempts,
		backoff,
		nextRetry.Format("15:04:05"))
}
