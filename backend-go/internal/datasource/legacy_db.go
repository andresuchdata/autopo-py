package datasource

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/legacydb"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

// LegacyDBSource implements DataSource for legacy MySQL database
type LegacyDBSource struct {
	db       *sql.DB
	config   config.LegacyDatabaseConfig
	localDir string
}

// NewLegacyDBSource creates a new legacy database data source
func NewLegacyDBSource(cfg config.LegacyDatabaseConfig, localDir string) (*LegacyDBSource, error) {
	if !cfg.Enabled {
		return nil, fmt.Errorf("legacy database is not enabled")
	}

	db, err := legacydb.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to legacy database: %w", err)
	}

	// Create local directory if it doesn't exist
	if err := os.MkdirAll(localDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create local directory: %w", err)
	}

	return &LegacyDBSource{
		db:       db,
		config:   cfg,
		localDir: localDir,
	}, nil
}

// GetName returns the name of the data source
func (s *LegacyDBSource) GetName() string {
	return "legacy_db"
}

// FetchData queries the legacy database and exports data to CSV files
func (s *LegacyDBSource) FetchData(ctx context.Context, date time.Time, storeIDs []int) ([]string, error) {
	logger.Log.Info().
		Str("source", "legacy_db").
		Str("date", date.Format("2006-01-02")).
		Int("store_count", len(storeIDs)).
		Msg("Fetching data from legacy database")

	var exportedFiles []string

	// If no specific stores, get all stores
	if len(storeIDs) == 0 {
		stores, err := s.getAllStores(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to get stores: %w", err)
		}
		storeIDs = stores
	}

	// Export data for each store
	for _, storeID := range storeIDs {
		filePath, err := s.exportStoreData(ctx, date, storeID)
		if err != nil {
			logger.Log.Error().
				Err(err).
				Int("store_id", storeID).
				Msg("Failed to export store data")
			continue
		}

		exportedFiles = append(exportedFiles, filePath)
	}

	logger.Log.Info().
		Int("exported", len(exportedFiles)).
		Int("total", len(storeIDs)).
		Msg("Completed legacy database export")

	return exportedFiles, nil
}

// getAllStores retrieves all store IDs from the legacy database
func (s *LegacyDBSource) getAllStores(ctx context.Context) ([]int, error) {
	query := "SELECT DISTINCT store_id FROM stock_data WHERE store_id IS NOT NULL"

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var storeIDs []int
	for rows.Next() {
		var storeID int
		if err := rows.Scan(&storeID); err != nil {
			return nil, err
		}
		storeIDs = append(storeIDs, storeID)
	}

	return storeIDs, rows.Err()
}

// exportStoreData exports data for a single store to a CSV file
func (s *LegacyDBSource) exportStoreData(ctx context.Context, date time.Time, storeID int) (string, error) {
	logger.Log.Debug().
		Int("store_id", storeID).
		Str("date", date.Format("2006-01-02")).
		Msg("Exporting store data from legacy database")

	// Query data for the store and date
	query := `
		SELECT 
			sku, product_name, stock, daily_sales, 
			stock_cover_days, status, updated_at
		FROM stock_data
		WHERE store_id = ? AND DATE(updated_at) = ?
		ORDER BY sku
	`

	rows, err := s.db.QueryContext(ctx, query, storeID, date.Format("2006-01-02"))
	if err != nil {
		return "", fmt.Errorf("failed to query data: %w", err)
	}
	defer rows.Close()

	// Create CSV file
	filename := fmt.Sprintf("store_%d_%s.csv", storeID, date.Format("20060102"))
	filePath := filepath.Join(s.localDir, filename)

	file, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	// Write CSV header
	header := "SKU,Product Name,Stock,Daily Sales,Stock Cover Days,Status,Updated At\n"
	if _, err := file.WriteString(header); err != nil {
		return "", fmt.Errorf("failed to write header: %w", err)
	}

	// Write data rows
	rowCount := 0
	for rows.Next() {
		var sku, productName, status string
		var stock int
		var dailySales, stockCoverDays float64
		var updatedAt time.Time

		if err := rows.Scan(&sku, &productName, &stock, &dailySales, &stockCoverDays, &status, &updatedAt); err != nil {
			logger.Log.Error().Err(err).Msg("Failed to scan row")
			continue
		}

		line := fmt.Sprintf("%s,%s,%d,%.2f,%.2f,%s,%s\n",
			sku, productName, stock, dailySales, stockCoverDays, status, updatedAt.Format("2006-01-02 15:04:05"))

		if _, err := file.WriteString(line); err != nil {
			logger.Log.Error().Err(err).Msg("Failed to write row")
			continue
		}

		rowCount++
	}

	logger.Log.Info().
		Int("store_id", storeID).
		Int("rows", rowCount).
		Str("file", filename).
		Msg("Exported store data to CSV")

	return filePath, nil
}

// Validate checks if the legacy database source is properly configured
func (s *LegacyDBSource) Validate() error {
	if s.db == nil {
		return fmt.Errorf("database connection not initialized")
	}

	// Test database connection
	if err := s.db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	return nil
}

// Close cleans up database connection
func (s *LegacyDBSource) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}
