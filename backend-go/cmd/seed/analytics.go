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

	tasks := make([]analyticsTask, 0, 2)

	if processStockHealth {
		stockFiles, err := collectCSVFiles(stockHealthDir)
		if err != nil {
			return fmt.Errorf("error walking stock health directory: %w", err)
		}
		tasks = append(tasks, analyticsTask{
			name:  "stock health",
			dir:   stockHealthDir,
			files: stockFiles,
			handler: func(ctx context.Context, path string) error {
				log.Printf("Processing stock health file: %s", path)
				if err := processor.ProcessFile(ctx, path); err != nil {
					return fmt.Errorf("error processing %s: %w", path, err)
				}
				return nil
			},
		})
	}

	if processPOSnapshots {
		poFiles, err := collectCSVFiles(poSnapshotsDir)
		if err != nil {
			return fmt.Errorf("error walking PO snapshots directory: %w", err)
		}
		tasks = append(tasks, analyticsTask{
			name:  "PO snapshot",
			dir:   poSnapshotsDir,
			files: poFiles,
			handler: func(ctx context.Context, path string) error {
				log.Printf("Processing PO snapshot file: %s", path)
				if err := processor.ProcessFile(ctx, path); err != nil {
					return fmt.Errorf("error processing %s: %w", path, err)
				}
				return nil
			},
		})
	}

	return runAnalyticsTasks(c.Context, tasks, workerCount)
}

type analyticsTask struct {
	name    string
	dir     string
	files   []string
	handler func(context.Context, string) error
}

func runAnalyticsTasks(ctx context.Context, tasks []analyticsTask, workers int) error {
	if len(tasks) == 0 {
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
					if err := processFile(ctx, path, tasks); err != nil {
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
	var enqueueErr error
outer:
	for _, task := range tasks {
		log.Printf("Processing %d %s file(s) with %d worker(s)...", len(task.files), task.name, workers)
		for _, file := range task.files {
			select {
			case <-ctx.Done():
				enqueueErr = ctx.Err()
				break outer
			case jobs <- file:
			}
		}
	}
	close(jobs)
	wg.Wait()
	select {
	case err := <-errCh:
		return err
	default:
		if enqueueErr != nil && enqueueErr != context.Canceled {
			return enqueueErr
		}
		if ctx.Err() != nil && ctx.Err() != context.Canceled {
			return ctx.Err()
		}
	}
	return nil
}

func processFile(ctx context.Context, path string, tasks []analyticsTask) error {
	for _, task := range tasks {
		for _, file := range task.files {
			if file == path {
				return task.handler(ctx, path)
			}
		}
	}
	return fmt.Errorf("unknown file: %s", path)
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
