package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/andresuchdata/autopo-py/backend-go/internal/analytics"
	"github.com/andresuchdata/autopo-py/backend-go/internal/types"

	"github.com/urfave/cli/v2"
)

type contextKey string

const (
	DBKey contextKey = "db"
)

// SeedAnalyticsData handles the analytics data seeding
func SeedAnalyticsData(c *cli.Context) error {
	// Get database connection from context
	db, ok := c.Context.Value(types.DBKey).(*sql.DB)
	if !ok || db == nil {
		return fmt.Errorf("database connection not found in context")
	}

	stockHealthDir := c.String("stock-health-dir")
	poSnapshotsDir := c.String("po-snapshots-dir")

	// Initialize the analytics processor
	processor := analytics.NewAnalyticsProcessor(db)

	// Process stock health files
	if err := filepath.Walk(stockHealthDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if filepath.Ext(path) == ".csv" {
			log.Printf("Processing stock health file: %s\n", path)
			if err := processor.ProcessFile(c.Context, path); err != nil {
				return fmt.Errorf("error processing %s: %w", path, err)
			}
		}
		return nil
	}); err != nil {
		return fmt.Errorf("error walking stock health directory: %w", err)
	}

	// Process PO snapshot files
	if err := filepath.Walk(poSnapshotsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if filepath.Ext(path) == ".csv" {
			log.Printf("Processing PO snapshot file: %s\n", path)
			if err := processor.ProcessFile(c.Context, path); err != nil {
				return fmt.Errorf("error processing %s: %w", path, err)
			}
		}
		return nil
	}); err != nil {
		return fmt.Errorf("error walking PO snapshots directory: %w", err)
	}

	return nil
}
