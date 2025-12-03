package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/analytics"
	"github.com/andresuchdata/autopo-py/backend-go/internal/types"

	"github.com/urfave/cli/v2"
)

// SeedAnalyticsData handles the analytics data seeding
func SeedAnalyticsData(c *cli.Context) error {
	// Get database connection from context
	db, ok := c.Context.Value(types.DBKey).(*sql.DB)
	if !ok || db == nil {
		return fmt.Errorf("database connection not found in context")
	}

	stockHealthDir := c.String("stock-health-dir")
	stockHealthFile := strings.TrimSpace(c.String("stock-health-file"))
	poSnapshotsDir := c.String("po-snapshots-dir")
	stockHealthOnly := c.Bool("stock-health-only")
	poSnapshotsOnly := c.Bool("po-snapshots-only")
	resetAnalytics := c.Bool("reset-analytics")

	// If both flags are true, it's a conflict
	if stockHealthOnly && poSnapshotsOnly {
		return fmt.Errorf("cannot specify both --stock-health-only and --po-snapshots-only")
	}

	// Default to processing both if neither flag is set
	processStockHealth := !poSnapshotsOnly
	processPOSnapshots := !stockHealthOnly

	// Truncate analytics tables if reset flag is set
	if resetAnalytics {
		log.Println("Resetting analytics tables...")
		resetQuery := `
			TRUNCATE TABLE daily_stock_data RESTART IDENTITY CASCADE;
			TRUNCATE TABLE po_snapshots RESTART IDENTITY CASCADE;
		`
		if _, err := db.ExecContext(c.Context, resetQuery); err != nil {
			return fmt.Errorf("failed to reset analytics tables: %w", err)
		}
		log.Println("Analytics tables reset successfully")
	}

	// Initialize the analytics processor
	processor := analytics.NewAnalyticsProcessor(db)

	// Process stock health files if enabled
	if processStockHealth {
		log.Println("Processing stock health files...")
		if stockHealthFile != "" {
			targetPath := stockHealthFile
			if !filepath.IsAbs(targetPath) {
				targetPath = filepath.Join(stockHealthDir, targetPath)
			}
			info, err := os.Stat(targetPath)
			if err != nil {
				return fmt.Errorf("stock health file not accessible: %w", err)
			}
			if info.IsDir() {
				return fmt.Errorf("stock health file points to a directory: %s", targetPath)
			}
			if filepath.Ext(targetPath) != ".csv" {
				return fmt.Errorf("stock health file must be a .csv: %s", targetPath)
			}
			log.Printf("Processing stock health file: %s\n", targetPath)
			if err := processor.ProcessFile(c.Context, targetPath); err != nil {
				return fmt.Errorf("error processing %s: %w", targetPath, err)
			}
		} else {
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
		}
	}

	// Process PO snapshot files if enabled
	if processPOSnapshots {
		log.Println("Processing PO snapshot files...")
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
	}

	return nil
}
