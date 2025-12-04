package pipeline

import (
	"context"
	"time"
)

// Pipeline defines the interface that all data pipelines must implement
type Pipeline interface {
	// Name returns the unique identifier for this pipeline
	Name() string

	// Transform processes a single input file and returns the transformed data
	Transform(ctx context.Context, inputFile string) ([]TransformedRow, error)

	// GetOutputTable returns the target database table name
	GetOutputTable() string

	// GetSnapshotDate extracts the date from the filename
	GetSnapshotDate(filename string) (time.Time, error)

	// Validate checks if the input file is valid for this pipeline
	Validate(inputFile string) error
}

// TransformedRow represents a single row of transformed data
// Each pipeline can embed this with pipeline-specific fields
type TransformedRow struct {
	Data map[string]interface{}
}

// PipelineConfig holds configuration for a pipeline instance
type PipelineConfig struct {
	Name            string
	BatchSize       int           // Number of files to buffer before flushing
	BatchSizeBytes  int64         // Size in bytes to buffer before flushing
	FlushInterval   time.Duration // Max time to wait before flushing
	WorkerCount     int           // Number of concurrent workers
	OutputDir       string        // Directory for final aggregated CSVs
	IntermediateDir string        // Directory for per-file outputs
	RetryAttempts   int           // Number of retries on failure
	RetryBackoff    time.Duration // Backoff duration between retries
}

// DefaultPipelineConfig returns sensible defaults
func DefaultPipelineConfig(name string) PipelineConfig {
	return PipelineConfig{
		Name:            name,
		BatchSize:       5,
		BatchSizeBytes:  10 * 1024 * 1024, // 10MB
		FlushInterval:   5 * time.Minute,
		WorkerCount:     4,
		OutputDir:       "data/seeds/" + name,
		IntermediateDir: "data/intermediate/" + name,
		RetryAttempts:   3,
		RetryBackoff:    30 * time.Second,
	}
}

// PipelineStatus represents the current state of a pipeline run
type PipelineStatus string

const (
	StatusPending    PipelineStatus = "pending"
	StatusProcessing PipelineStatus = "processing"
	StatusCompleted  PipelineStatus = "completed"
	StatusFailed     PipelineStatus = "failed"
)

// FileJobStatus represents the state of a single file processing job
type FileJobStatus string

const (
	FileStatusQueued     FileJobStatus = "queued"
	FileStatusProcessing FileJobStatus = "processing"
	FileStatusCompleted  FileJobStatus = "completed"
	FileStatusFailed     FileJobStatus = "failed"
)

// PipelineRun tracks a single execution of a pipeline for a specific date
type PipelineRun struct {
	ID             int64
	PipelineName   string
	Date           time.Time
	Status         PipelineStatus
	TotalFiles     int
	ProcessedFiles int
	TotalRows      int
	StartedAt      time.Time
	CompletedAt    *time.Time
	ErrorMessage   string
}

// FileJob tracks the processing of a single file
type FileJob struct {
	ID            int64
	PipelineRunID int64
	FilePath      string
	StoreID       *int64 // Nullable for non-store files
	Status        FileJobStatus
	ErrorMessage  string
	ProcessedAt   *time.Time
	RetryCount    int
}

// PipelineMetrics holds metrics for monitoring
type PipelineMetrics struct {
	FilesProcessed  int64
	RowsProcessed   int64
	BytesProcessed  int64
	ErrorCount      int64
	AverageLatency  time.Duration
	LastProcessedAt time.Time
}
