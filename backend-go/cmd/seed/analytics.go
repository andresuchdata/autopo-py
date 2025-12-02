package main

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log"
	"path/filepath"
	"sort"
	"sync"

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
	workerCount := c.Int("analytics-workers")
	if workerCount < 1 {
		workerCount = 1
	}

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
		stockFiles, err := collectCSVFiles(stockHealthDir)
		if err != nil {
			return fmt.Errorf("error walking stock health directory: %w", err)
		}
		if len(stockFiles) == 0 {
			log.Printf("No stock health CSV files found in %s", stockHealthDir)
		} else {
			log.Printf("Processing %d stock health file(s) with %d worker(s)...", len(stockFiles), workerCount)
			if err := processFilesWithWorkers(c.Context, stockFiles, workerCount, func(path string) error {
				log.Printf("Processing stock health file: %s", path)
				if err := processor.ProcessFile(c.Context, path); err != nil {
					return fmt.Errorf("error processing %s: %w", path, err)
				}
				return nil
			}); err != nil {
				return err
			}
		}
	}

	// Process PO snapshot files if enabled
	if processPOSnapshots {
		poFiles, err := collectCSVFiles(poSnapshotsDir)
		if err != nil {
			return fmt.Errorf("error walking PO snapshots directory: %w", err)
		}
		if len(poFiles) == 0 {
			log.Printf("No PO snapshot CSV files found in %s", poSnapshotsDir)
		} else {
			log.Printf("Processing %d PO snapshot file(s) with %d worker(s)...", len(poFiles), workerCount)
			if err := processFilesWithWorkers(c.Context, poFiles, workerCount, func(path string) error {
				log.Printf("Processing PO snapshot file: %s", path)
				if err := processor.ProcessFile(c.Context, path); err != nil {
					return fmt.Errorf("error processing %s: %w", path, err)
				}
				return nil
			}); err != nil {
				return err
			}
		}
	}

	return nil
}

func collectCSVFiles(root string) ([]string, error) {
	files := make([]string, 0)
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if filepath.Ext(path) == ".csv" {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	return files, nil
}

func processFilesWithWorkers(ctx context.Context, files []string, workers int, fn func(string) error) error {
	if len(files) == 0 {
		return nil
	}
	if workers < 1 {
		workers = 1
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	jobs := make(chan string)
	errCh := make(chan error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case path, ok := <-jobs:
					if !ok {
						return
					}
					if err := fn(path); err != nil {
						select {
						case errCh <- err:
						default:
						}
						cancel()
						return
					}
				}
			}
		}()
	}
loop:
	for _, path := range files {
		select {
		case <-ctx.Done():
			break loop
		case jobs <- path:
		}
	}
	close(jobs)
	wg.Wait()
	select {
	case err := <-errCh:
		return err
	default:
		if ctx.Err() != nil && ctx.Err() != context.Canceled {
			return ctx.Err()
		}
	}
	return nil
}
