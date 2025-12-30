package service

import (
	"context"
	"database/sql"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/models"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

// PipelineScheduler handles scheduled pipeline execution
type PipelineScheduler struct {
	pipelineRepo    *repository.PipelineRepository
	pipelineService *PipelineService
	ticker          *time.Ticker
	stopChan        chan struct{}
}

// NewPipelineScheduler creates a new pipeline scheduler
func NewPipelineScheduler(db *sql.DB, pipelineService *PipelineService) *PipelineScheduler {
	return &PipelineScheduler{
		pipelineRepo:    repository.NewPipelineRepository(db),
		pipelineService: pipelineService,
		stopChan:        make(chan struct{}),
	}
}

// Start begins the scheduler loop
func (s *PipelineScheduler) Start(ctx context.Context, checkInterval time.Duration) {
	logger.Log.Info().Dur("interval", checkInterval).Msg("Starting pipeline scheduler")

	s.ticker = time.NewTicker(checkInterval)

	go func() {
		for {
			select {
			case <-ctx.Done():
				logger.Log.Info().Msg("Scheduler context cancelled, stopping")
				s.Stop()
				return
			case <-s.stopChan:
				logger.Log.Info().Msg("Scheduler stop signal received")
				return
			case <-s.ticker.C:
				s.checkScheduledRuns(ctx)
			}
		}
	}()
}

// Stop stops the scheduler
func (s *PipelineScheduler) Stop() {
	if s.ticker != nil {
		s.ticker.Stop()
	}
	close(s.stopChan)
	logger.Log.Info().Msg("Pipeline scheduler stopped")
}

// checkScheduledRuns checks for and executes scheduled pipeline runs
func (s *PipelineScheduler) checkScheduledRuns(ctx context.Context) {
	run, err := s.pipelineRepo.GetNextScheduledRun(ctx)
	if err != nil {
		logger.Log.Error().Err(err).Msg("Failed to get next scheduled run")
		return
	}

	if run == nil {
		// No scheduled runs ready
		return
	}

	logger.Log.Info().
		Int64("run_id", run.ID).
		Str("pipeline", run.PipelineName).
		Time("date", run.Date).
		Time("scheduled_at", *run.ScheduledAt).
		Msg("Executing scheduled pipeline run")

	// The run date is already a time.Time object
	runDate := run.Date

	// Update status to processing
	if err := s.pipelineRepo.UpdateRunStatus(ctx, run.ID, models.StatusProcessing, nil); err != nil {
		logger.Log.Error().Err(err).Int64("run_id", run.ID).Msg("Failed to update run status")
		return
	}

	// Trigger the pipeline
	// Note: This is a simplified implementation. In production, you'd want to:
	// 1. Parse the config to determine data source and other settings
	// 2. Call the appropriate pipeline execution method
	// 3. Handle errors and update the run status accordingly
	_, err = s.pipelineService.TriggerPipeline(ctx, run.PipelineName, runDate, nil)
	if err != nil {
		logger.Log.Error().Err(err).Int64("run_id", run.ID).Msg("Failed to trigger scheduled pipeline")
		errMsg := err.Error()
		s.pipelineRepo.UpdateRunStatus(ctx, run.ID, models.StatusFailed, &errMsg)
		return
	}

	logger.Log.Info().Int64("run_id", run.ID).Msg("Scheduled pipeline run started successfully")
}

func strPtr(s string) *string {
	return &s
}
