package datasource

import (
	"fmt"
	"os"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
)

// Factory creates data sources based on configuration
type Factory struct {
	legacyDBConfig config.LegacyDatabaseConfig
	driveCredsJSON string
}

// NewFactory creates a new data source factory
func NewFactory(legacyDBConfig config.LegacyDatabaseConfig, driveCredsJSON string) *Factory {
	return &Factory{
		legacyDBConfig: legacyDBConfig,
		driveCredsJSON: driveCredsJSON,
	}
}

// Create creates a data source based on the configuration
func (f *Factory) Create(cfg DataSourceConfig, localDir string) (DataSource, error) {
	switch cfg.Type {
	case "google_drive":
		return f.createGoogleDriveSource(cfg, localDir)
	case "legacy_db":
		return f.createLegacyDBSource(localDir)
	default:
		return nil, fmt.Errorf("unknown data source type: %s", cfg.Type)
	}
}

// createGoogleDriveSource creates a Google Drive data source
func (f *Factory) createGoogleDriveSource(cfg DataSourceConfig, localDir string) (DataSource, error) {
	// Use provided folder ID or fall back to environment variable
	folderID := cfg.DriveFolderID
	if folderID == "" {
		folderID = os.Getenv("STOCK_HEALTH_DRIVE_FOLDER_ID")
	}

	if folderID == "" {
		return nil, fmt.Errorf("Google Drive folder ID not provided")
	}

	return NewGoogleDriveSource(f.driveCredsJSON, folderID, localDir)
}

// createLegacyDBSource creates a legacy database data source
func (f *Factory) createLegacyDBSource(localDir string) (DataSource, error) {
	if !f.legacyDBConfig.Enabled {
		return nil, fmt.Errorf("legacy database is not enabled in configuration")
	}

	return NewLegacyDBSource(f.legacyDBConfig, localDir)
}
