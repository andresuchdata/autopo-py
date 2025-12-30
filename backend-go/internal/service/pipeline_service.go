package service

import (
	"context"
	"database/sql"
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
	stockHealthPipe *stock_health.StockHealthPipeline
	defaultConfig   pipeline.PipelineConfig
	inputDir        string
	storage         storage.ObjectStorage
	credentials     string
	dsFactory       *datasource.Factory
}

// NewPipelineService creates a new pipeline service
func NewPipelineService(db *sql.DB, repo *repository.PipelineRepository, config pipeline.PipelineConfig, inputDir string, storageClient storage.ObjectStorage, credentials string, legacyDBConfig config.LegacyDatabaseConfig) *PipelineService {
	// Initialize stock health pipeline
	shConfig := stock_health.Config{
		// Set defaults or load from env if needed
		TempDir: filepath.Join(inputDir, "temp"),
	}
	shPipe, _ := stock_health.NewStockHealthPipeline(shConfig)

	return &PipelineService{
		repo:            repo,
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
	// 1. Create pipeline run record
	run := &models.PipelineRun{
		PipelineName: name,
		Date:         date,
		Status:       models.StatusPending,
		StartedAt:    time.Now(),
		TotalFiles:   len(inputFiles),
	}

	if err := s.repo.CreateRun(ctx, run); err != nil {
		return 0, fmt.Errorf("failed to create pipeline run: %w", err)
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

	// Auto-discovery of files if none provided
	if len(inputFiles) == 0 { // Changed condition to allow cloud discovery even if inputDir is empty
		if s.inputDir != "" {
			// Expect minimal structure: inputDir/YYYYMMDD/*.csv
			// Or inputDir/*.csv matching date?
			// Based on notebook structure: notebook/data/input/20251229/*.csv
			dateDir := filepath.Join(s.inputDir, date.Format("20060102"))
			matches, err := filepath.Glob(filepath.Join(dateDir, "*.csv"))
			if err == nil && len(matches) > 0 {
				inputFiles = matches
				logger.Log.Info().Str("pipeline", name).Int("count", len(matches)).Msg("Auto-discovered input files")
			} else {
				// Fallback: try searching in root of inputDir with date pattern
				// This matches validate.py behavior if files are flat
				pattern := filepath.Join(s.inputDir, fmt.Sprintf("*%s*.csv", date.Format("2006-01-02"))) // Try YYYY-MM-DD
				matches, err = filepath.Glob(pattern)
				if err == nil && len(matches) > 0 {
					inputFiles = matches
				} else {
					// Try Compact date
					pattern = filepath.Join(s.inputDir, fmt.Sprintf("*%s*.csv", date.Format("20060102")))
					matches, err = filepath.Glob(pattern)
					if err == nil && len(matches) > 0 {
						inputFiles = matches
					}
				}
			}
		}

		// If still no local files found, try cloud storage
		if len(inputFiles) == 0 && s.storage != nil {
			// Pattern: stock_health/raw/YYYY/MM/DD
			prefix := fmt.Sprintf("%s/raw/%s", name, date.Format("2006/01/02"))
			logger.Log.Info().Str("pipeline", name).Str("prefix", prefix).Msg("Checking cloud storage for inputs")

			// List objects
			result, err := s.storage.ListObjects(ctx, prefix, 1000, "")
			if err == nil && len(result.Objects) > 0 {
				for _, obj := range result.Objects {
					if filepath.Ext(obj.Key) == ".csv" {
						inputFiles = append(inputFiles, obj.Key)
					}
				}
				logger.Log.Info().Str("pipeline", name).Int("count", len(inputFiles)).Msg("Auto-discovered cloud files")
			} else if err != nil {
				logger.Log.Error().Err(err).Str("pipeline", name).Msg("Failed to list cloud objects")
			}
		}
	}

	worker := pipeline.NewWorkerWithRepo(pipe, s.defaultConfig, s.repo)

	// Fire and forget
	go func() {
		bgCtx := context.Background()
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

	// 1. Initialize data source
	dsCfg := datasource.DataSourceConfig{
		Type:          string(config.DataSource),
		DriveFolderID: config.DriveFolderID,
	}

	ds, err := s.dsFactory.Create(dsCfg, s.inputDir)
	if err != nil {
		return 0, fmt.Errorf("failed to create data source: %w", err)
	}

	// 2. Fetch data
	inputFiles, err := ds.FetchData(ctx, date, config.StoreIDs)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch data: %w", err)
	}

	// 3. Trigger pipeline with fetched files
	return s.TriggerPipeline(ctx, name, date, inputFiles)
}
