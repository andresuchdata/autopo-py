package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/datasource"
	"github.com/andresuchdata/autopo-py/backend-go/internal/models"
	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

const (
	PipelineStockHealth = "stock_health"
	PipelinePOSnapshot  = "po_snapshot"
)

// PipelineService manages pipeline executions
type PipelineService struct {
	repo            *repository.PipelineRepository
	storeRepo       *repository.StoreRepository
	stockHealthPipe *stock_health.StockHealthPipeline
	defaultConfig   pipeline.PipelineConfig
	inputDir        string
	storage         storage.ObjectStorage
	credentials     string
	dsFactory       *datasource.Factory
}

// NewPipelineService creates a new pipeline service
func NewPipelineService(db *sql.DB, repo *repository.PipelineRepository, storeRepo *repository.StoreRepository, config pipeline.PipelineConfig, inputDir string, storageClient storage.ObjectStorage, credentials string, legacyDBConfig config.LegacyDatabaseConfig) *PipelineService {
	// Initialize stock health pipeline
	shConfig := stock_health.Config{
		// Set defaults or load from env if needed
		TempDir: filepath.Join(inputDir, "temp"),
	}
	shPipe, _ := stock_health.NewStockHealthPipeline(shConfig)

	return &PipelineService{
		repo:            repo,
		storeRepo:       storeRepo,
		stockHealthPipe: shPipe,
		defaultConfig:   config,
		inputDir:        inputDir,
		storage:         storageClient,
		credentials:     credentials,
		dsFactory:       datasource.NewFactory(legacyDBConfig, credentials),
	}
}

// TriggerPipeline starts a pipeline run in the background
func (s *PipelineService) TriggerPipeline(ctx context.Context, name string, date time.Time, inputFiles []string) (int64, error) {
	// 1. Check if a run already exists for this pipeline and date
	existingRun, err := s.repo.GetRunByPipelineAndDate(ctx, name, date)
	if err != nil && err != models.ErrPipelineNotFound {
		return 0, fmt.Errorf("failed to check for existing run: %w", err)
	}

	var run *models.PipelineRun
	if existingRun != nil {
		// Upsert: Reset existing run to pending state
		run = existingRun
		run.Status = models.StatusPending
		run.StartedAt = time.Now()
		run.TotalFiles = len(inputFiles)
		run.ProcessedFiles = 0
		run.TotalRows = 0
		run.CompletedAt = nil
		run.ErrorMessage = nil

		if err := s.repo.UpdateRun(ctx, run); err != nil {
			return 0, fmt.Errorf("failed to update existing run: %w", err)
		}

		logger.Log.Info().
			Int64("run_id", run.ID).
			Str("pipeline", name).
			Str("date", date.Format("2006-01-02")).
			Msg("Resetting existing pipeline run (upsert)")
	} else {
		// Create new pipeline run record
		emptyConfig := json.RawMessage("{}")
		run = &models.PipelineRun{
			PipelineName: name,
			Date:         date,
			Status:       models.StatusPending,
			StartedAt:    time.Now(),
			TotalFiles:   len(inputFiles),
			Config:       emptyConfig,
		}

		if err := s.repo.CreateRun(ctx, run); err != nil {
			return 0, fmt.Errorf("failed to create pipeline run: %w", err)
		}

		logger.Log.Info().
			Int64("run_id", run.ID).
			Str("pipeline", name).
			Str("date", date.Format("2006-01-02")).
			Msg("Created new pipeline run")
	}

	runID := run.ID

	// 2. Resolve pipeline implementation
	var pipe pipeline.Pipeline
	switch name {
	case PipelineStockHealth:
		pipe = s.stockHealthPipe
	case PipelinePOSnapshot:
		return runID, fmt.Errorf("po snapshot pipeline not yet implemented")
	default:
		return runID, fmt.Errorf("unknown pipeline: %s", name)
	}

	worker := pipeline.NewWorkerWithRepo(pipe, s.defaultConfig, s.repo)

	// Fire and forget
	go func() {
		bgCtx := context.Background()

		// 3. Auto-discovery of files if none provided (Background)
		if len(inputFiles) == 0 {
			if s.inputDir != "" {
				dateDir := filepath.Join(s.inputDir, date.Format("20060102"))
				matches, err := filepath.Glob(filepath.Join(dateDir, "*.csv"))
				if err == nil && len(matches) > 0 {
					inputFiles = matches
					logger.Log.Info().Str("pipeline", name).Int("count", len(matches)).Msg("Auto-discovered input files")
				} else {
					pattern := filepath.Join(s.inputDir, fmt.Sprintf("*%s*.csv", date.Format("2006-01-02")))
					matches, err = filepath.Glob(pattern)
					if err == nil && len(matches) > 0 {
						inputFiles = matches
					} else {
						pattern = filepath.Join(s.inputDir, fmt.Sprintf("*%s*.csv", date.Format("20060102")))
						matches, err = filepath.Glob(pattern)
						if err == nil && len(matches) > 0 {
							inputFiles = matches
						}
					}
				}
			}

			if len(inputFiles) == 0 && s.storage != nil {
				prefix := fmt.Sprintf("%s/raw/%s", name, date.Format("2006/01/02"))
				logger.Log.Info().Str("pipeline", name).Str("prefix", prefix).Msg("Checking cloud storage for inputs")

				result, err := s.storage.ListObjects(bgCtx, prefix, 1000, "")
				if err == nil && len(result.Objects) > 0 {
					for _, obj := range result.Objects {
						if filepath.Ext(obj.Key) == ".csv" {
							inputFiles = append(inputFiles, obj.Key)
						}
					}
					logger.Log.Info().Str("pipeline", name).Int("count", len(inputFiles)).Msg("Auto-discovered cloud files")
				}
			}
		}

		// Update run with discovered file count
		if len(inputFiles) > 0 {
			run.TotalFiles = len(inputFiles)
			s.repo.UpdateRun(bgCtx, run)
		} else {
			errMsg := "no input files found for pipeline run"
			run.Status = models.StatusFailed
			run.ErrorMessage = &errMsg
			run.CompletedAt = &[]time.Time{time.Now()}[0]
			s.repo.UpdateRun(bgCtx, run)
			logger.Log.Error().Str("pipeline", name).Int64("run_id", runID).Msg(errMsg)
			return
		}

		// 4. Execute worker
		if err := worker.ProcessBatchWithRun(bgCtx, run, inputFiles); err != nil {
			logger.Log.Error().Err(err).Str("pipeline", name).Int64("run_id", runID).Msg("Pipeline background run failed")
		}
	}()

	return runID, nil
}

// TriggerPipelineWithConfig starts a pipeline run with full configuration
func (s *PipelineService) TriggerPipelineWithConfig(ctx context.Context, name string, date time.Time, config *models.PipelineConfig) (int64, error) {
	if config == nil {
		return s.TriggerPipeline(ctx, name, date, nil)
	}

	// 1. Create or Reset pipeline run record (Sync)
	existingRun, err := s.repo.GetRunByPipelineAndDate(ctx, name, date)
	if err != nil && err != models.ErrPipelineNotFound {
		return 0, fmt.Errorf("failed to check for existing run: %w", err)
	}

	var run *models.PipelineRun
	if existingRun != nil {
		run = existingRun
		run.Status = models.StatusPending
		run.StartedAt = time.Now()
		run.ProcessedFiles = 0
		run.TotalRows = 0
		run.CompletedAt = nil
		run.ErrorMessage = nil

		// Optional: Store the new config
		if config != nil {
			if jsonCfg, err := config.ToJSON(); err == nil {
				run.Config = jsonCfg
			}
		}

		if err := s.repo.UpdateRun(ctx, run); err != nil {
			return 0, fmt.Errorf("failed to update existing run: %w", err)
		}
	} else {
		jsonCfg, _ := config.ToJSON()
		run = &models.PipelineRun{
			PipelineName: name,
			Date:         date,
			Status:       models.StatusPending,
			StartedAt:    time.Now(),
			Config:       jsonCfg,
		}

		if err := s.repo.CreateRun(ctx, run); err != nil {
			return 0, fmt.Errorf("failed to create pipeline run: %w", err)
		}
	}

	runID := run.ID

	// 2. Resolve pipeline implementation
	var pipe pipeline.Pipeline
	switch name {
	case PipelineStockHealth:
		pipe = s.stockHealthPipe
	case PipelinePOSnapshot:
		return runID, fmt.Errorf("po snapshot pipeline not yet implemented")
	default:
		return runID, fmt.Errorf("unknown pipeline: %s", name)
	}

	// 3. Start background processing (Async)
	go func() {
		bgCtx := context.Background()

		// 3.1 Initialize data source
		localDir := filepath.Join(s.inputDir, name, date.Format("20060102"))
		ds, err := s.dsFactory.Create(datasource.DataSourceConfig{
			Type:          string(config.DataSource),
			DriveFolderID: config.DriveFolderID,
		}, localDir)
		if err != nil {
			logger.Log.Error().Err(err).Int64("run_id", runID).Msg("Failed to create data source")
			s.markRunFailed(bgCtx, run, fmt.Errorf("failed to create data source: %w", err))
			return
		}

		// 3.2 Resolve store names for filtering
		var storeNames []string
		if len(config.StoreIDs) > 0 {
			stores, err := s.storeRepo.GetStoresByIDs(bgCtx, config.StoreIDs)
			if err == nil && len(stores) > 0 {
				storeNames = make([]string, len(stores))
				for i, st := range stores {
					storeNames[i] = st.Name
				}
			} else if err != nil {
				logger.Log.Error().Err(err).Msg("Failed to resolve store IDs")
			}
		}

		// 3.3 Fetch data (optimized with storeNames)
		inputFiles, err := ds.FetchData(bgCtx, date, config.StoreIDs, storeNames)
		if err != nil {
			logger.Log.Error().Err(err).Int64("run_id", runID).Msg("Failed to fetch data")
			s.markRunFailed(bgCtx, run, fmt.Errorf("failed to fetch data: %w", err))
			return
		}

		// 3.4 Trigger worker
		if len(inputFiles) == 0 {
			s.markRunFailed(bgCtx, run, fmt.Errorf("no input files found in data source"))
			return
		}

		run.TotalFiles = len(inputFiles)
		s.repo.UpdateRun(bgCtx, run)

		worker := pipeline.NewWorkerWithRepo(pipe, s.defaultConfig, s.repo)

		// 3.5 Apply row filter if store names are available
		if len(storeNames) > 0 {
			filter := pipeline.NewRowFilterFromEnv()
			if filter == nil {
				filter = pipeline.NewRowFilter()
			}
			filter.SetIncludeStores(storeNames)
			worker.SetRowFilter(filter)
			logger.Log.Info().Int("count", len(storeNames)).Msg("Applying store filters to worker")
		}

		if err := worker.ProcessBatchWithRun(bgCtx, run, inputFiles); err != nil {
			logger.Log.Error().Err(err).Str("pipeline", name).Int64("run_id", runID).Msg("Pipeline background run failed")
		}
	}()

	return runID, nil
}

func (s *PipelineService) markRunFailed(ctx context.Context, run *models.PipelineRun, err error) {
	run.Status = models.StatusFailed
	errMsg := err.Error()
	run.ErrorMessage = &errMsg
	now := time.Now()
	run.CompletedAt = &now
	s.repo.UpdateRun(ctx, run)
}
