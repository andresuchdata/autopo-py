package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/cache"
	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/drive"
	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
	posnapshot "github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/po_snapshot"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/urfave/cli/v2"
)

func poSnapshotPipelineFlags() []cli.Flag {
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
			Usage:   "Google Drive folder ID containing PO snapshot source files",
			EnvVars: []string{"PO_SNAPSHOT_DRIVE_FOLDER_ID"},
		},
		&cli.StringFlag{
			Name:    "download-dir",
			Usage:   "Local directory where source files from Drive will be downloaded",
			Value:   "./data/pipeline/po_snapshots/raw",
			EnvVars: []string{"PO_SNAPSHOT_DOWNLOAD_DIR"},
		},
		&cli.StringFlag{
			Name:    "intermediate-dir",
			Usage:   "Root directory for PO snapshot intermediate outputs",
			Value:   "./data/pipeline/po_snapshots/intermediate",
			EnvVars: []string{"PO_SNAPSHOT_INTERMEDIATE_DIR"},
		},
		&cli.StringFlag{
			Name:    "output-dir",
			Usage:   "Directory for final consolidated PO snapshot CSVs",
			Value:   "./data/pipeline/po_snapshots/output",
			EnvVars: []string{"PO_SNAPSHOT_OUTPUT_DIR"},
		},
		&cli.StringFlag{
			Name:    "snapshot-date",
			Usage:   "Specific date to process (YYYYMMDD)",
			Value:   "",
			EnvVars: []string{"PO_SNAPSHOT_SNAPSHOT_DATE"},
		},
		&cli.StringFlag{
			Name:    "input-date-format",
			Usage:   "Date format used in filenames to extract snapshot date (Go layout)",
			Value:   "20060102",
			EnvVars: []string{"PO_SNAPSHOT_INPUT_DATE_FORMAT"},
		},
		&cli.BoolFlag{
			Name:    "reuse-local",
			Usage:   "Skip Drive download and use existing files in download-dir",
			EnvVars: []string{"PO_SNAPSHOT_REUSE_LOCAL"},
		},
		&cli.BoolFlag{
			Name:    "cloud-storage-enabled",
			Usage:   "Store pipeline raw/output data in S3-compatible storage",
			EnvVars: []string{"CLOUD_STORAGE_ENABLED"},
		},
		&cli.StringFlag{
			Name:    "cloud-storage-endpoint",
			Usage:   "S3-compatible storage endpoint (e.g. https://storage.example.com)",
			EnvVars: []string{"CLOUD_STORAGE_ENDPOINT"},
		},
		&cli.StringFlag{
			Name:    "cloud-storage-bucket",
			Usage:   "Bucket name for pipeline data",
			EnvVars: []string{"CLOUD_STORAGE_BUCKET"},
		},
		&cli.StringFlag{
			Name:    "cloud-storage-region",
			Usage:   "Bucket region (defaults to us-east-1)",
			EnvVars: []string{"CLOUD_STORAGE_REGION"},
		},
		&cli.StringFlag{
			Name:    "cloud-storage-access-key",
			Usage:   "Access key ID for the storage endpoint",
			EnvVars: []string{"CLOUD_STORAGE_ACCESS_KEY"},
		},
		&cli.StringFlag{
			Name:    "cloud-storage-secret-key",
			Usage:   "Secret access key for the storage endpoint",
			EnvVars: []string{"CLOUD_STORAGE_SECRET_KEY"},
		},
		&cli.StringFlag{
			Name:    "cloud-storage-prefix",
			Usage:   "Prefix inside the bucket for pipeline data (optional)",
			EnvVars: []string{"CLOUD_STORAGE_PREFIX"},
		},
		&cli.BoolFlag{
			Name:    "cloud-storage-use-ssl",
			Usage:   "Use HTTPS when connecting to cloud storage",
			Value:   true,
			EnvVars: []string{"CLOUD_STORAGE_USE_SSL"},
		},
		&cli.IntFlag{
			Name:    "pipeline-workers",
			Usage:   "Number of concurrent workers for PO snapshot pipeline",
			Value:   runtime.NumCPU(),
			EnvVars: []string{"PIPELINE_WORKERS"},
		},
	}
}

func runPOSnapshotPipeline(c *cli.Context) error {
	ctx := c.Context
	if ctx == nil {
		ctx = context.Background()
	}

	db, err := sql.Open("pgx", c.String("db-url"))
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer db.Close()

	didReset, err := maybeResetDatabase(c, db)
	if err != nil {
		return err
	}

	migrationsDir := c.String("migrations-dir")
	if !didReset && migrationsDir != "" {
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
	snapshotDate := c.String("snapshot-date")
	reuseLocal := c.Bool("reuse-local")

	var localFiles []string
	if reuseLocal {
		log.Printf("Reusing existing files in %s (skip Drive download)", downloadDir)
		localFiles, err = filepath.Glob(filepath.Join(downloadDir, "*.csv"))
		if err != nil {
			return fmt.Errorf("failed to list local files: %w", err)
		}
	} else {
		credsJSON := os.Getenv("GOOGLE_DRIVE_CREDENTIALS_JSON")
		if strings.TrimSpace(credsJSON) == "" {
			return fmt.Errorf("GOOGLE_DRIVE_CREDENTIALS_JSON env is required")
		}
		driveSvc, err := drive.NewService(credsJSON)
		if err != nil {
			return fmt.Errorf("failed to create Drive service: %w", err)
		}
		downloader := drive.NewDownloader(driveSvc)

		localFiles, err = downloader.DownloadFolderCSV(ctx, drive.DownloadOptions{
			FolderID:     folderID,
			DownloadDir:  downloadDir,
			DateLayout:   inputDateFormat,
			SnapshotDate: snapshotDate,
		})
		if err != nil {
			return fmt.Errorf("failed to download files from Drive: %w", err)
		}
	}

	if len(localFiles) == 0 {
		log.Println("No CSV files found; nothing to process")
		return nil
	}

	if snapshotDate != "" {
		filtered := make([]string, 0, len(localFiles))
		for _, p := range localFiles {
			base := filepath.Base(p)
			if strings.HasPrefix(base, snapshotDate) {
				filtered = append(filtered, p)
			}
		}
		if len(filtered) == 0 {
			log.Printf("No downloaded files matched snapshot date %s; nothing to process", snapshotDate)
			return nil
		}
		localFiles = filtered
	}

	cfg := posnapshot.Config{
		InputDateFormat: inputDateFormat,
		DownloadDir:     downloadDir,
		IntermediateDir: intermediateDir,
		OutputDir:       outputDir,

		CloudStorageEnabled: c.Bool("cloud-storage-enabled"),
		CloudBucket:         c.String("cloud-storage-bucket"),
		CloudEndpoint:       c.String("cloud-storage-endpoint"),
		CloudRegion:         c.String("cloud-storage-region"),
		CloudAccessKey:      c.String("cloud-storage-access-key"),
		CloudSecretKey:      c.String("cloud-storage-secret-key"),
		CloudUseSSL:         c.Bool("cloud-storage-use-ssl"),
		CloudPrefix:         c.String("cloud-storage-prefix"),
	}

	pipelineImpl, err := posnapshot.New(cfg)
	if err != nil {
		return fmt.Errorf("failed to create PO snapshot pipeline: %w", err)
	}

	var uploadErr error
	uploadDone := make(chan struct{})
	if cfg.CloudStorageEnabled && snapshotDate != "" {
		go func() {
			defer close(uploadDone)
			parsedDate, err := time.Parse(inputDateFormat, snapshotDate)
			if err != nil {
				uploadErr = err
				return
			}
			for _, localPath := range localFiles {
				if _, err := pipelineImpl.UploadRawFile(ctx, parsedDate, localPath); err != nil {
					log.Printf("warning: failed to upload raw file %s: %v", localPath, err)
				}
			}
		}()
	} else {
		close(uploadDone)
	}

	pCfg := pipeline.DefaultPipelineConfig(pipelineImpl.Name())
	pCfg.OutputDir = outputDir
	pCfg.IntermediateDir = intermediateDir
	pCfg.WorkerCount = c.Int("pipeline-workers")

	orch := pipeline.NewOrchestrator(db, pCfg)
	if err := orch.Run(ctx, pipelineImpl, localFiles); err != nil {
		return fmt.Errorf("PO snapshot pipeline run failed: %w", err)
	}

	// === Sync Normalized Tables ===
	log.Println("Syncing normalized purchase_orders and purchase_order_items tables from snapshots...")
	if err := syncNormalizedTables(ctx, db); err != nil {
		// We log error but don't fail the entire pipeline as partial success (ingestion) is still valuable
		log.Printf("error: failed to sync normalized tables: %v", err)
	} else {
		log.Println("Successfully synced normalized tables")
	}

	appCfg := config.Load()
	if appCfg.Cache.Enabled {
		dashboardCache, err := cache.NewDashboardCache(appCfg.Cache)
		if err != nil {
			log.Printf("warning: failed to create dashboard cache for invalidation: %v", err)
		} else if err := dashboardCache.InvalidateAll(ctx); err != nil {
			log.Printf("warning: failed to invalidate dashboard cache: %v", err)
		} else {
			log.Printf("Invalidated dashboard cache")
		}
	}

	<-uploadDone
	if uploadErr != nil {
		log.Printf("warning: raw file upload encountered errors: %v", uploadErr)
	}

	log.Println("PO snapshot pipeline completed successfully")
	return nil
}

func syncNormalizedTables(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Logic matches migration 010_backfill_normalized_from_snapshots.sql
	queries := []string{
		// 0. Disable triggers
		"ALTER TABLE purchase_order_items DISABLE TRIGGER log_new_po_item_trigger",
		"ALTER TABLE purchase_order_items DISABLE TRIGGER update_po_item_quantity_trigger",
		"ALTER TABLE purchase_orders DISABLE TRIGGER log_po_status_change_trigger",

		// 1. Insert missing Purchase Orders
		`INSERT INTO purchase_orders (
			po_number, supplier_id, brand_id, store_id, status, 
			po_qty, received_qty, 
			po_released_at, po_sent_at, po_approved_at, po_arrived_at, po_received_at, 
			min_purchase, trading_term, promo_factor, delay_factor,
			created_at, updated_at
		)
		SELECT DISTINCT ON (po_number)
			po_number, 
			supplier_id, 
			brand_id, 
			store_id, 
			status,
			0, 0, 
			po_released_at, po_sent_at, po_approved_at, po_arrived_at, po_received_at,
			min_purchase, trading_term, promo_factor, delay_factor,
			NOW(), NOW()
		FROM po_snapshots
		ORDER BY po_number, time DESC
		ON CONFLICT (po_number) DO NOTHING`,

		// 2. Insert/Update Purchase Order Items
		`INSERT INTO purchase_order_items (
			po_id, product_id, sku, product_name, quantity, 
			price, received_quantity, eta, created_at, updated_at
		)
		SELECT 
			po.id, 
			ps.product_id, 
			ps.sku, 
			ps.product_name, 
			ps.quantity_ordered,
			ps.unit_price, 
			ps.quantity_received, 
			ps.eta, 
			NOW(), NOW()
		FROM (
			SELECT DISTINCT ON (po_number, sku) *
			FROM po_snapshots
			ORDER BY po_number, sku, time DESC
		) ps
		JOIN purchase_orders po ON ps.po_number = po.po_number
		ON CONFLICT (po_id, product_id) DO UPDATE SET
			eta = EXCLUDED.eta,
			updated_at = NOW()`,

		// 3. Recalculate Aggregates
		`UPDATE purchase_orders po
		SET 
			po_qty = (SELECT COALESCE(SUM(quantity), 0) FROM purchase_order_items WHERE po_id = po.id),
			received_qty = (SELECT COALESCE(SUM(received_quantity), 0) FROM purchase_order_items WHERE po_id = po.id)`,

		// 4. Re-enable triggers
		"ALTER TABLE purchase_order_items ENABLE TRIGGER log_new_po_item_trigger",
		"ALTER TABLE purchase_order_items ENABLE TRIGGER update_po_item_quantity_trigger",
		"ALTER TABLE purchase_orders ENABLE TRIGGER log_po_status_change_trigger",
	}

	for _, query := range queries {
		if _, err := tx.ExecContext(ctx, query); err != nil {
			return fmt.Errorf("failed to execute query: %s, error: %w", query, err)
		}
	}

	return tx.Commit()
}
