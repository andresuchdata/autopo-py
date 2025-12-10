package pipeline

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/analytics"
)

// Worker processes files for a specific pipeline
type Worker struct {
	pipeline   Pipeline
	config     PipelineConfig
	repo       *Repository
	db         *sql.DB
	aggregator *StreamingAggregator
	processor  *analytics.AnalyticsProcessor
	mu         sync.Mutex
}

// NewWorker creates a new pipeline worker
func NewWorker(pipeline Pipeline, config PipelineConfig, db *sql.DB) *Worker {
	repo := NewRepository(db)
	// Initialize analytics processor with default parse config (locale, etc.)
	processor := analytics.NewAnalyticsProcessor(db, analytics.ParseConfig{})

	return &Worker{
		pipeline:  pipeline,
		config:    config,
		repo:      repo,
		db:        db,
		processor: processor,
	}
}

// ProcessBatch processes a batch of files for a specific date
func (w *Worker) ProcessBatch(ctx context.Context, date time.Time, files []string) error {
	log.Printf("[%s] Starting batch processing for %s: %d files",
		w.pipeline.Name(), date.Format("2006-01-02"), len(files))

	// Create or get pipeline run
	run, err := w.getOrCreatePipelineRun(ctx, date, len(files))
	if err != nil {
		return fmt.Errorf("failed to create pipeline run: %w", err)
	}

	// Initialize streaming aggregator with seed callback
	w.aggregator = NewStreamingAggregator(
		w.pipeline,
		w.config,
		date,
		func(ctx context.Context, csvPath string) error {
			// This callback uses the existing analytics.ProcessFile
			log.Printf("[%s] Seeding aggregated data from %s", w.pipeline.Name(), csvPath)
			return w.processor.ProcessFile(ctx, csvPath)
		},
	)

	// Create file jobs
	fileJobs := make([]*FileJob, len(files))
	for i, file := range files {
		job := &FileJob{
			PipelineRunID: run.ID,
			FilePath:      file,
			Status:        FileStatusQueued,
		}
		if err := w.repo.CreateFileJob(ctx, job); err != nil {
			return fmt.Errorf("failed to create file job: %w", err)
		}
		fileJobs[i] = job
	}

	// Update run status to processing
	run.Status = StatusProcessing
	if err := w.repo.UpdatePipelineRun(ctx, run); err != nil {
		return fmt.Errorf("failed to update pipeline run: %w", err)
	}

	// Process files concurrently
	if err := w.processFilesParallel(ctx, run, fileJobs); err != nil {
		// Mark run as failed
		run.Status = StatusFailed
		run.ErrorMessage = err.Error()
		now := time.Now()
		run.CompletedAt = &now
		w.repo.UpdatePipelineRun(ctx, run)
		return err
	}

	// Finalize aggregation (flush remaining buffer)
	if err := w.aggregator.Finalize(ctx); err != nil {
		run.Status = StatusFailed
		run.ErrorMessage = fmt.Sprintf("aggregation failed: %v", err)
		now := time.Now()
		run.CompletedAt = &now
		w.repo.UpdatePipelineRun(ctx, run)
		return fmt.Errorf("failed to finalize aggregation: %w", err)
	}

	// Mark run as completed
	run.Status = StatusCompleted
	now := time.Now()
	run.CompletedAt = &now
	if err := w.repo.UpdatePipelineRun(ctx, run); err != nil {
		return fmt.Errorf("failed to complete pipeline run: %w", err)
	}

	log.Printf("[%s] Batch processing completed: %d files, %d rows",
		w.pipeline.Name(), run.ProcessedFiles, run.TotalRows)

	return nil
}

// processFilesParallel processes files using a worker pool
func (w *Worker) processFilesParallel(ctx context.Context, run *PipelineRun, jobs []*FileJob) error {
	workerCount := w.config.WorkerCount
	if workerCount < 1 {
		workerCount = 1
	}

	jobChan := make(chan *FileJob, len(jobs))
	errChan := make(chan error, workerCount)
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for job := range jobChan {
				if err := w.processFile(ctx, run, job); err != nil {
					log.Printf("[%s] Worker %d failed to process %s: %v",
						w.pipeline.Name(), workerID, job.FilePath, err)
					select {
					case errChan <- err:
					default:
					}
				}
			}
		}(i)
	}

	// Enqueue jobs
	for _, job := range jobs {
		select {
		case <-ctx.Done():
			close(jobChan)
			return ctx.Err()
		case jobChan <- job:
		}
	}
	close(jobChan)

	// Wait for all workers
	wg.Wait()
	close(errChan)

	// Check for errors
	if err := <-errChan; err != nil {
		return err
	}

	return nil
}

// processFile processes a single file
func (w *Worker) processFile(ctx context.Context, run *PipelineRun, job *FileJob) error {
	startTime := time.Now()

	// Update job status to processing
	job.Status = FileStatusProcessing
	if err := w.repo.UpdateFileJob(ctx, job); err != nil {
		return err
	}

	log.Printf("[%s] Processing file: %s", w.pipeline.Name(), job.FilePath)

	// Validate file
	if err := w.pipeline.Validate(job.FilePath); err != nil {
		return w.markJobFailed(ctx, job, fmt.Errorf("validation failed: %w", err))
	}

	// Transform file
	rows, err := w.pipeline.Transform(ctx, job.FilePath)
	if err != nil {
		return w.markJobFailed(ctx, job, fmt.Errorf("transformation failed: %w", err))
	}

	// Add to aggregator buffer
	if err := w.aggregator.AddFileData(ctx, rows); err != nil {
		return w.markJobFailed(ctx, job, fmt.Errorf("aggregation failed: %w", err))
	}

	// Mark job as completed
	job.Status = FileStatusCompleted
	now := time.Now()
	job.ProcessedAt = &now
	if err := w.repo.UpdateFileJob(ctx, job); err != nil {
		return err
	}

	// Update run statistics
	if err := w.repo.IncrementProcessedFiles(ctx, run.ID); err != nil {
		log.Printf("[%s] Warning: failed to increment processed files: %v", w.pipeline.Name(), err)
	}
	if err := w.repo.AddRowCount(ctx, run.ID, len(rows)); err != nil {
		log.Printf("[%s] Warning: failed to add row count: %v", w.pipeline.Name(), err)
	}

	duration := time.Since(startTime)
	log.Printf("[%s] Completed %s in %v (%d rows)",
		w.pipeline.Name(), job.FilePath, duration, len(rows))

	return nil
}

// markJobFailed marks a job as failed and handles retry logic
func (w *Worker) markJobFailed(ctx context.Context, job *FileJob, err error) error {
	job.Status = FileStatusFailed
	job.ErrorMessage = err.Error()
	job.RetryCount++

	if err := w.repo.UpdateFileJob(ctx, job); err != nil {
		log.Printf("[%s] Failed to update job status: %v", w.pipeline.Name(), err)
	}

	// Check if we should retry
	if job.RetryCount < w.config.RetryAttempts {
		log.Printf("[%s] Will retry %s (attempt %d/%d)",
			w.pipeline.Name(), job.FilePath, job.RetryCount, w.config.RetryAttempts)
		// Retry will be handled by a separate retry mechanism
	}

	return err
}

// getOrCreatePipelineRun gets or creates a pipeline run for the date
func (w *Worker) getOrCreatePipelineRun(ctx context.Context, date time.Time, totalFiles int) (*PipelineRun, error) {
	// Try to get existing run
	run, err := w.repo.GetPipelineRunByDate(ctx, w.pipeline.Name(), date)
	if err != nil {
		return nil, err
	}

	if run != nil {
		// Update total files if needed
		if run.TotalFiles != totalFiles {
			run.TotalFiles = totalFiles
			if err := w.repo.UpdatePipelineRun(ctx, run); err != nil {
				return nil, err
			}
		}
		return run, nil
	}

	// Create new run
	run = &PipelineRun{
		PipelineName: w.pipeline.Name(),
		Date:         date,
		Status:       StatusPending,
		TotalFiles:   totalFiles,
		StartedAt:    time.Now(),
	}

	if err := w.repo.CreatePipelineRun(ctx, run); err != nil {
		return nil, err
	}

	return run, nil
}

// RetryFailed retries all failed jobs for this pipeline
func (w *Worker) RetryFailed(ctx context.Context) error {
	jobs, err := w.repo.GetFailedFileJobs(ctx, w.pipeline.Name(), w.config.RetryAttempts)
	if err != nil {
		return fmt.Errorf("failed to get failed jobs: %w", err)
	}

	if len(jobs) == 0 {
		log.Printf("[%s] No failed jobs to retry", w.pipeline.Name())
		return nil
	}

	log.Printf("[%s] Retrying %d failed jobs", w.pipeline.Name(), len(jobs))

	// Group jobs by run ID
	jobsByRun := make(map[int64][]*FileJob)
	for _, job := range jobs {
		jobsByRun[job.PipelineRunID] = append(jobsByRun[job.PipelineRunID], job)
	}

	// Retry each run's failed jobs
	for runID, runJobs := range jobsByRun {
		run, err := w.repo.GetPipelineRun(ctx, runID)
		if err != nil {
			log.Printf("[%s] Failed to get run %d: %v", w.pipeline.Name(), runID, err)
			continue
		}

		// Initialize aggregator for this run
		w.aggregator = NewStreamingAggregator(
			w.pipeline,
			w.config,
			run.Date,
			func(ctx context.Context, csvPath string) error {
				return w.processor.ProcessFile(ctx, csvPath)
			},
		)

		// Process failed jobs
		if err := w.processFilesParallel(ctx, run, runJobs); err != nil {
			log.Printf("[%s] Failed to retry jobs for run %d: %v", w.pipeline.Name(), runID, err)
			continue
		}

		// Finalize if all jobs completed
		if run.ProcessedFiles == run.TotalFiles {
			if err := w.aggregator.Finalize(ctx); err != nil {
				log.Printf("[%s] Failed to finalize run %d: %v", w.pipeline.Name(), runID, err)
			}
		}
	}

	return nil
}
