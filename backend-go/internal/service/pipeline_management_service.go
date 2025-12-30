package service

import (
	"context"
	"database/sql"

	"github.com/andresuchdata/autopo-py/backend-go/internal/models"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
)

// PipelineManagementService handles pipeline run management operations
type PipelineManagementService struct {
	pipelineRepo *repository.PipelineRepository
	storeRepo    *repository.StoreRepository
}

// NewPipelineManagementService creates a new pipeline management service
func NewPipelineManagementService(db *sql.DB) *PipelineManagementService {
	return &PipelineManagementService{
		pipelineRepo: repository.NewPipelineRepository(db),
		storeRepo:    repository.NewStoreRepository(db),
	}
}

// GetPipelineRepo returns the pipeline repository
func (s *PipelineManagementService) GetPipelineRepo() *repository.PipelineRepository {
	return s.pipelineRepo
}

// GetStoreRepo returns the store repository
func (s *PipelineManagementService) GetStoreRepo() *repository.StoreRepository {
	return s.storeRepo
}

// GetRun retrieves a pipeline run by ID
func (s *PipelineManagementService) GetRun(ctx context.Context, id int64) (*models.PipelineRun, error) {
	return s.pipelineRepo.GetRun(ctx, id)
}

// GetRunSummary retrieves a complete summary of a pipeline run
func (s *PipelineManagementService) GetRunSummary(ctx context.Context, runID int64) (*models.PipelineRunSummary, error) {
	return s.pipelineRepo.GetRunSummary(ctx, runID)
}

// GetStoreProgress retrieves store-level progress for a pipeline run
func (s *PipelineManagementService) GetStoreProgress(ctx context.Context, runID int64) ([]models.StoreProgress, error) {
	return s.pipelineRepo.GetStoreProgress(ctx, runID)
}

// ListRuns lists pipeline runs with pagination
func (s *PipelineManagementService) ListRuns(ctx context.Context, pipelineName string, limit, offset int) ([]models.PipelineRun, error) {
	return s.pipelineRepo.ListRuns(ctx, pipelineName, limit, offset)
}

// PauseRun pauses a running pipeline
func (s *PipelineManagementService) PauseRun(ctx context.Context, id int64) error {
	return s.pipelineRepo.PauseRun(ctx, id)
}

// ResumeRun resumes a paused pipeline
func (s *PipelineManagementService) ResumeRun(ctx context.Context, id int64) error {
	return s.pipelineRepo.ResumeRun(ctx, id)
}

// RetryFailedJobs resets failed jobs to queued status for retry
func (s *PipelineManagementService) RetryFailedJobs(ctx context.Context, runID int64) error {
	return s.pipelineRepo.ResetFailedJobs(ctx, runID)
}

// UpdateRunStatus updates the status of a pipeline run
func (s *PipelineManagementService) UpdateRunStatus(ctx context.Context, id int64, status models.PipelineStatus, errorMsg *string) error {
	return s.pipelineRepo.UpdateRunStatus(ctx, id, status, errorMsg)
}

// CancelRun cancels a running or pending pipeline
func (s *PipelineManagementService) CancelRun(ctx context.Context, id int64) error {
	return s.pipelineRepo.CancelRun(ctx, id)
}

// CancelAllRuns cancels all running or pending pipelines
func (s *PipelineManagementService) CancelAllRuns(ctx context.Context) error {
	return s.pipelineRepo.CancelAllActiveRuns(ctx)
}

// GetAllStores retrieves all stores
func (s *PipelineManagementService) GetAllStores(ctx context.Context) ([]repository.Store, error) {
	return s.storeRepo.GetAllStores(ctx)
}

// SearchStores searches for stores by name
func (s *PipelineManagementService) SearchStores(ctx context.Context, query string) ([]repository.Store, error) {
	return s.storeRepo.SearchStores(ctx, query)
}
