package datasource

import (
	"context"
	"time"
)

// DataSource defines the interface for pipeline data sources
type DataSource interface {
	// GetName returns the name of the data source
	GetName() string

	// FetchData retrieves data for the given date and stores
	// Returns a list of file paths or data identifiers
	FetchData(ctx context.Context, date time.Time, storeIDs []int) ([]string, error)

	// Validate checks if the data source is properly configured
	Validate() error

	// Close cleans up any resources
	Close() error
}

// DataSourceConfig holds configuration for data sources
type DataSourceConfig struct {
	Type            string // "google_drive" or "legacy_db"
	DriveFolderID   string
	LegacyDBEnabled bool
}

// StoreData represents data for a single store
type StoreData struct {
	StoreID   int
	StoreName string
	FilePath  string
	RowCount  int
}
