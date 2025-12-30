package models

import (
	"encoding/json"
	"time"
)

// DataSource represents the source of pipeline input data
type DataSource string

const (
	DataSourceGoogleDrive DataSource = "google_drive"
	DataSourceLegacyDB    DataSource = "legacy_db"
)

// PipelineStage represents the current processing stage of a file job
type PipelineStage string

const (
	StageQueued      PipelineStage = "queued"
	StageDownloading PipelineStage = "downloading"
	StageCleaning    PipelineStage = "cleaning"
	StageCalculating PipelineStage = "calculating"
	StageFinishing   PipelineStage = "finishing"
	StageCompleted   PipelineStage = "completed"
	StageFailed      PipelineStage = "failed"
)

// PipelineStatus represents the overall status of a pipeline run
type PipelineStatus string

const (
	StatusPending    PipelineStatus = "pending"
	StatusProcessing PipelineStatus = "processing"
	StatusCompleted  PipelineStatus = "completed"
	StatusFailed     PipelineStatus = "failed"
	StatusPaused     PipelineStatus = "paused"
)

// RetryConfig defines retry behavior for failed jobs
type RetryConfig struct {
	Enabled           bool    `json:"enabled"`
	MaxAttempts       int     `json:"max_attempts"`
	InitialBackoffSec int     `json:"initial_backoff_sec"`
	MaxBackoffSec     int     `json:"max_backoff_sec"`
	BackoffMultiplier float64 `json:"backoff_multiplier"`
}

// DefaultRetryConfig returns sensible defaults for retry configuration
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		Enabled:           true,
		MaxAttempts:       3,
		InitialBackoffSec: 5,
		MaxBackoffSec:     300,
		BackoffMultiplier: 2.0,
	}
}

// PipelineConfig holds configuration for a pipeline run
type PipelineConfig struct {
	DataSource      DataSource  `json:"data_source"`
	RunDate         string      `json:"run_date"`            // YYYY-MM-DD format
	StoreIDs        []int       `json:"store_ids,omitempty"` // Empty means all stores
	DriveFolderID   string      `json:"drive_folder_id,omitempty"`
	LegacyDBEnabled bool        `json:"legacy_db_enabled"`
	RetryConfig     RetryConfig `json:"retry_config"`
	ScheduledAt     *time.Time  `json:"scheduled_at,omitempty"`
	Priority        int         `json:"priority"`
}

// Validate checks if the configuration is valid
func (c *PipelineConfig) Validate() error {
	if c.RunDate == "" {
		return ErrInvalidRunDate
	}

	if c.DataSource == DataSourceGoogleDrive && c.DriveFolderID == "" {
		return ErrMissingDriveFolderID
	}

	if c.DataSource == DataSourceLegacyDB && !c.LegacyDBEnabled {
		return ErrLegacyDBNotConfigured
	}

	return nil
}

// ToJSON serializes the config to JSON
func (c *PipelineConfig) ToJSON() (json.RawMessage, error) {
	data, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(data), nil
}

// FromJSON deserializes the config from JSON
func (c *PipelineConfig) FromJSON(data json.RawMessage) error {
	return json.Unmarshal(data, c)
}

// PipelineRun represents a pipeline execution
type PipelineRun struct {
	ID             int64           `json:"id"`
	PipelineName   string          `json:"pipeline_name"`
	Date           time.Time       `json:"date"`
	Status         PipelineStatus  `json:"status"`
	TotalFiles     int             `json:"total_files"`
	ProcessedFiles int             `json:"processed_files"`
	TotalRows      int             `json:"total_rows"`
	StartedAt      time.Time       `json:"started_at"`
	CompletedAt    *time.Time      `json:"completed_at,omitempty"`
	ErrorMessage   *string         `json:"error_message,omitempty"`
	Config         json.RawMessage `json:"config"`
	Priority       int             `json:"priority"`
	IsPaused       bool            `json:"is_paused"`
	ScheduledAt    *time.Time      `json:"scheduled_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// PipelineFileJob represents processing of a single file
type PipelineFileJob struct {
	ID              int64          `json:"id"`
	PipelineRunID   int64          `json:"pipeline_run_id"`
	FilePath        string         `json:"file_path"`
	StoreID         *int           `json:"store_id,omitempty"`
	Status          PipelineStatus `json:"status"`
	Stage           PipelineStage  `json:"stage"`
	ProgressPercent int            `json:"progress_percent"`
	ErrorMessage    *string        `json:"error_message,omitempty"`
	ProcessedAt     *time.Time     `json:"processed_at,omitempty"`
	RetryCount      int            `json:"retry_count"`
	LastRetryAt     *time.Time     `json:"last_retry_at,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

// StoreProgress aggregates progress for a specific store
type StoreProgress struct {
	StoreID         int            `json:"store_id"`
	StoreName       string         `json:"store_name"`
	Status          PipelineStatus `json:"status"`
	Stage           PipelineStage  `json:"stage"`
	ProgressPercent int            `json:"progress_percent"`
	ErrorMessage    *string        `json:"error_message,omitempty"`
	RetryCount      int            `json:"retry_count"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

// PipelineRunSummary provides an overview of a pipeline run
type PipelineRunSummary struct {
	Run             PipelineRun     `json:"run"`
	StoreProgress   []StoreProgress `json:"store_progress"`
	QueuedCount     int             `json:"queued_count"`
	ProcessingCount int             `json:"processing_count"`
	CompletedCount  int             `json:"completed_count"`
	FailedCount     int             `json:"failed_count"`
}
