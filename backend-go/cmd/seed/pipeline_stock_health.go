package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"runtime"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/drive"
	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
	stockhealth "github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/urfave/cli/v2"
)

func stockHealthPipelineFlags() []cli.Flag {
	return []cli.Flag{
		newDBURLFlag(),
		&cli.StringFlag{
			Name:    "migrations-dir",
			Usage:   "Directory containing SQL migrations for reset (optional)",
			Value:   "./backend-go/scripts/migrations",
			EnvVars: []string{"MIGRATIONS_DIR"},
		},
		&cli.BoolFlag{
			Name:    "reset-db",
			Usage:   "Drop schema and re-run migrations before pipeline run (development only)",
			EnvVars: []string{"RESET_DB"},
		},
		&cli.StringFlag{
			Name:    "drive-folder-id",
			Usage:   "Google Drive folder ID containing stock health source files",
			EnvVars: []string{"STOCK_HEALTH_DRIVE_FOLDER_ID"},
		},
		&cli.StringFlag{
			Name:    "download-dir",
			Usage:   "Local directory where source files from Drive will be downloaded",
			Value:   "./data/uploads/stock_health/raw",
			EnvVars: []string{"STOCK_HEALTH_DOWNLOAD_DIR"},
		},
		&cli.StringFlag{
			Name:    "intermediate-dir",
			Usage:   "Root directory for stock health intermediate outputs",
			Value:   "./data/intermediate/stock_health",
			EnvVars: []string{"STOCK_HEALTH_INTERMEDIATE_DIR"},
		},
		&cli.StringFlag{
			Name:    "output-dir",
			Usage:   "Directory for final consolidated stock health CSVs",
			Value:   "./data/seeds/stock_health",
			EnvVars: []string{"STOCK_HEALTH_OUTPUT_DIR"},
		},
		&cli.StringFlag{
			Name:    "input-date-format",
			Usage:   "Date format used in filenames to extract snapshot date (Go layout)",
			Value:   "20060102",
			EnvVars: []string{"STOCK_HEALTH_INPUT_DATE_FORMAT"},
		},
		&cli.BoolFlag{
			Name:    "persist-debug-layers",
			Usage:   "Persist cleaned_base (1) intermediate layer for debugging",
			EnvVars: []string{"STOCK_HEALTH_PERSIST_DEBUG_LAYERS"},
		},
		&cli.IntFlag{
			Name:    "pipeline-workers",
			Usage:   "Number of concurrent workers for stock health pipeline",
			Value:   runtime.NumCPU(),
			EnvVars: []string{"PIPELINE_WORKERS"},
		},
	}
}

func runStockHealthPipeline(c *cli.Context) error {
	ctx := c.Context
	if ctx == nil {
		ctx = context.Background()
	}

	// Database connection
	db, err := sql.Open("pgx", c.String("db-url"))
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer db.Close()

	if err := maybeResetDatabase(c, db); err != nil {
		return err
	}

	// Optionally run migrations (reusing runMigrations from main.go)
	migrationsDir := c.String("migrations-dir")
	if migrationsDir != "" {
		if _, err := os.Stat(migrationsDir); err == nil {
			if err := runMigrations(ctx, db, migrationsDir); err != nil {
				return err
			}
		}
	}

	folderID := c.String("drive-folder-id")
	if folderID == "" {
		return fmt.Errorf("drive-folder-id is required")
	}

	downloadDir := c.String("download-dir")
	intermediateDir := c.String("intermediate-dir")
	outputDir := c.String("output-dir")
	inputDateFormat := c.String("input-date-format")
	persistDebug := c.Bool("persist-debug-layers")

	// Initialize Drive service from GOOGLE_DRIVE_CREDENTIALS_JSON env
	credsJSON := os.Getenv("GOOGLE_DRIVE_CREDENTIALS_JSON")
	if strings.TrimSpace(credsJSON) == "" {
		return fmt.Errorf("GOOGLE_DRIVE_CREDENTIALS_JSON env is required")
	}

	driveSvc, err := drive.NewService(credsJSON)
	if err != nil {
		return fmt.Errorf("failed to create Drive service: %w", err)
	}
	downloader := drive.NewDownloader(driveSvc)

	log.Printf("Downloading stock health files from Drive folder %s to %s", folderID, downloadDir)
	localFiles, err := downloader.DownloadFolderCSV(ctx, drive.DownloadOptions{
		FolderID:    folderID,
		DownloadDir: downloadDir,
	})
	if err != nil {
		return fmt.Errorf("failed to download files from Drive: %w", err)
	}

	if len(localFiles) == 0 {
		log.Println("No CSV files found in Drive folder; nothing to process")
		return nil
	}

	// Build stock health pipeline
	stockCfg := stockhealth.Config{
		SpecialSKUs:        map[string]bool{}, // can be configured later
		SupplierData:       nil,               // TODO: wire supplier data in a later iteration
		StoreContributions: nil,               // TODO: wire contribution data in a later iteration
		PadangStoreName:    "Miss Glam Padang",
		InputDateFormat:    inputDateFormat,
		OutputDir:          outputDir,
		IntermediateDir:    intermediateDir,
		PersistMergedOnly:  true,
		PersistDebugLayers: persistDebug,
	}

	pipelineImpl := stockhealth.NewStockHealthPipeline(stockCfg)

	// Configure generic pipeline config
	pCfg := pipeline.DefaultPipelineConfig(pipelineImpl.Name())
	pCfg.OutputDir = outputDir
	pCfg.IntermediateDir = intermediateDir
	pCfg.WorkerCount = c.Int("pipeline-workers")

	orch := pipeline.NewOrchestrator(db, pCfg)
	if err := orch.Run(ctx, pipelineImpl, localFiles); err != nil {
		return fmt.Errorf("stock health pipeline run failed: %w", err)
	}

	log.Println("Stock health pipeline completed successfully")
	return nil
}
