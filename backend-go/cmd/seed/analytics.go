package main

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log"
	"os"
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
	stockHealthFile := c.String("stock-health-file")
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
		// Build reset query based on what's being processed
		var resetQueries []string
		var tableNames []string

		if processStockHealth {
			resetQueries = append(resetQueries, "TRUNCATE TABLE daily_stock_data RESTART IDENTITY CASCADE;")
			tableNames = append(tableNames, "daily_stock_data")
		}
		if processPOSnapshots {
			resetQueries = append(resetQueries, "TRUNCATE TABLE po_snapshots RESTART IDENTITY CASCADE;")
			tableNames = append(tableNames, "po_snapshots")
		}

		if len(resetQueries) == 0 {
			return fmt.Errorf("no tables to reset")
		}

		log.Printf("Resetting analytics tables: %v...", tableNames)

		// Execute all reset queries in a single transaction
		tx, err := db.BeginTx(c.Context, nil)
		if err != nil {
			return fmt.Errorf("failed to begin transaction: %w", err)
		}
		defer tx.Rollback()

		for i, query := range resetQueries {
			if _, err := tx.ExecContext(c.Context, query); err != nil {
				return fmt.Errorf("failed to reset table %s: %w", tableNames[i], err)
			}
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit reset transaction: %w", err)
		}

		log.Printf("Successfully reset tables: %v", tableNames)
	}

	// Initialize the analytics processor
	processor := analytics.NewAnalyticsProcessor(db)

	tasks := make([]analyticsTask, 0, 2)

	if processStockHealth {
		stockFiles, err := resolveStockHealthFiles(stockHealthDir, stockHealthFile)
		if err != nil {
			return fmt.Errorf("error preparing stock health files: %w", err)
		}
		tasks = append(tasks, analyticsTask{
			name:       "stock health",
			dir:        stockHealthDir,
			files:      stockFiles,
			maxWorkers: 1,
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
	name       string
	dir        string
	files      []string
	handler    func(context.Context, string) error
	maxWorkers int
}

func runAnalyticsTasks(ctx context.Context, tasks []analyticsTask, defaultWorkers int) error {
	if len(tasks) == 0 {
		return nil
	}
	if defaultWorkers < 1 {
		defaultWorkers = 1
	}

	for _, task := range tasks {
		workers := defaultWorkers
		if task.maxWorkers > 0 && task.maxWorkers < workers {
			workers = task.maxWorkers
		}
		log.Printf("Processing %d %s file(s) with %d worker(s)...", len(task.files), task.name, workers)
		if err := runTaskWithWorkers(ctx, task, workers); err != nil {
			return err
		}
	}
	return nil
}

func runTaskWithWorkers(ctx context.Context, task analyticsTask, workers int) error {
	if len(task.files) == 0 {
		return nil
	}
	if workers < 1 {
		workers = 1
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	jobs := make(chan string)
	errCh := make(chan error, 1)
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
					if err := task.handler(ctx, path); err != nil {
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

	for _, file := range task.files {
		select {
		case <-ctx.Done():
			wg.Wait()
			select {
			case err := <-errCh:
				return err
			default:
				if err := ctx.Err(); err != nil && err != context.Canceled {
					return err
				}
				return context.Canceled
			}
		case jobs <- file:
		}
	}

	close(jobs)
	wg.Wait()

	select {
	case err := <-errCh:
		return err
	default:
		if err := ctx.Err(); err != nil && err != context.Canceled {
			return err
		}
		return nil
	}
}

func resolveStockHealthFiles(root, override string) ([]string, error) {
	if override == "" {
		return collectCSVFiles(root)
	}

	target := override
	if !filepath.IsAbs(target) {
		target = filepath.Join(root, override)
	}
	info, err := os.Stat(target)
	if err != nil {
		return nil, fmt.Errorf("stock health file %s: %w", target, err)
	}

	if info.IsDir() {
		return collectCSVFiles(target)
	}

	return []string{target}, nil
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
