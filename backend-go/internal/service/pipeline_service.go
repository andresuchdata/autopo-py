package service

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

const (
	PipelineStockHealth = "stock_health"
	PipelinePOSnapshot  = "po_snapshot"
)

// PipelineService manages pipeline executions
type PipelineService struct {
	db              *sql.DB
	stockHealthPipe *stock_health.StockHealthPipeline
	defaultConfig   pipeline.PipelineConfig
	inputDir        string
	storage         storage.ObjectStorage
}

// NewPipelineService creates a new pipeline service
func NewPipelineService(db *sql.DB, config pipeline.PipelineConfig, inputDir string, storageClient storage.ObjectStorage) *PipelineService {
	// Initialize stock health pipeline
	// Note: We might need to inject dependencies properly here later or load config
	shConfig := stock_health.Config{
		// Set defaults or load from env if needed
	}
	shPipe, _ := stock_health.NewStockHealthPipeline(shConfig)

	return &PipelineService{
		db:              db,
		stockHealthPipe: shPipe,
		defaultConfig:   config,
		inputDir:        inputDir,
		storage:         storageClient,
	}
}

// TriggerPipeline starts a pipeline run in the background
func (s *PipelineService) TriggerPipeline(ctx context.Context, name string, date time.Time, inputFiles []string) (int64, error) {
	var pipe pipeline.Pipeline
	switch name {
	case PipelineStockHealth:
		pipe = s.stockHealthPipe
	case PipelinePOSnapshot:
		return 0, fmt.Errorf("po snapshot pipeline not yet implemented")
	default:
		return 0, fmt.Errorf("unknown pipeline: %s", name)
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

	worker := pipeline.NewWorker(pipe, s.defaultConfig, s.db)

	// Fire and forget
	go func() {
		bgCtx := context.Background()
		if err := worker.ProcessBatch(bgCtx, date, inputFiles); err != nil {
			logger.Log.Error().Err(err).Str("pipeline", name).Msg("Pipeline background run failed")
		}
	}()

	// TODO: Create the run record first if we want to return a real ID.
	// For now return 0 to indicate async accepted.
	return 0, nil
}
