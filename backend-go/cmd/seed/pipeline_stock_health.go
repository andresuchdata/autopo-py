package main

import (
	"context"
	"database/sql"
	"encoding/csv"
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
	"github.com/andresuchdata/autopo-py/backend-go/internal/legacydb"
	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
	stockhealth "github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/urfave/cli/v2"
	"github.com/xuri/excelize/v2"
)

// rewrite using format StoreContribution for mapping below

var STORE_CONTRIBUTIONS = map[string]float64{
	"PADANG":           100,
	"PEKANBARU":        60,
	"JAMBI":            33,
	"BUKITTINGGI":      45,
	"PANAM":            46,
	"MUARO BUNGO":      42,
	"LAMPUNG":          18,
	"BENGKULU":         14,
	"MEDAN":            46,
	"PALEMBANG":        26,
	"DAMAR":            91,
	"BANGKA":           28,
	"PAYAKUMBUH":       47,
	"SOLOK":            37,
	"TEMBILAHAN":       27,
	"LUBUK LINGGAU":    26,
	"DUMAI":            36,
	"KEDATON":          18,
	"RANTAU PRAPAT":    27,
	"TANJUNG PINANG":   19,
	"SUTOMO":           49,
	"PASAMAN BARAT":    17,
	"HALAT":            31,
	"DURI":             28,
	"SUDIRMAN":         44,
	"DR. MANSYUR":      25,
	"DR.MANSYUR":       25,
	"MANSYUR":          25,
	"PADANG SIDIMPUAN": 31,
	"P. SIDIMPUAN":     31,
	"P.SIDIMPUAN":      31,
	"ACEH":             15,
	"MARPOYAN":         30,
	"SEI PENUH":        21,
	"MAYANG":           18,
}

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
			Value:   "./data/pipeline/stock_health/raw",
			EnvVars: []string{"STOCK_HEALTH_DOWNLOAD_DIR"},
		},
		&cli.StringFlag{
			Name:    "intermediate-dir",
			Usage:   "Root directory for stock health intermediate outputs",
			Value:   "./data/pipeline/stock_health/intermediate",
			EnvVars: []string{"STOCK_HEALTH_INTERMEDIATE_DIR"},
		},
		&cli.StringFlag{
			Name:    "output-dir",
			Usage:   "Directory for final consolidated stock health CSVs",
			Value:   "./data/pipeline/stock_health/output",
			EnvVars: []string{"STOCK_HEALTH_OUTPUT_DIR"},
		},
		&cli.StringFlag{
			Name:    "snapshot-date",
			Usage:   "Specific date to process (YYYYMMDD)",
			Value:   "",
			EnvVars: []string{"STOCK_HEALTH_SNAPSHOT_DATE"},
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
		&cli.BoolFlag{
			Name:    "reuse-local",
			Usage:   "Skip Drive download and use existing files in download-dir",
			EnvVars: []string{"STOCK_HEALTH_REUSE_LOCAL"},
		},
		&cli.BoolFlag{
			Name:    "cloud-storage-enabled",
			Usage:   "Store pipeline raw/intermediate/output data in S3-compatible storage",
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
			Usage:   "Number of concurrent workers for stock health pipeline",
			Value:   runtime.NumCPU(),
			EnvVars: []string{"PIPELINE_WORKERS"},
		},
		&cli.StringFlag{
			Name:    "supplier-file",
			Usage:   "Path to supplier master file (CSV or XLSX). If empty, falls back to suppliers.xlsx or suppliers.csv in data/pipeline/stock_health",
			EnvVars: []string{"STOCK_HEALTH_SUPPLIER_FILE"},
		},
		&cli.StringFlag{
			Name:    "top100-sku-dir",
			Usage:   "Directory containing per-store top 100 SKU files (xlsx/csv). If empty, defaults to data/pipeline/stock_health/top_100_sku",
			EnvVars: []string{"STOCK_HEALTH_TOP100_SKU_DIR"},
		},
		&cli.StringFlag{
			Name:    "legacy-db-host",
			Usage:   "Legacy CI3 MySQL database host (enables DB mode when provided)",
			EnvVars: []string{"LEGACY_DB_HOST"},
		},
		&cli.StringFlag{
			Name:    "legacy-db-port",
			Usage:   "Legacy database port",
			Value:   "3306",
			EnvVars: []string{"LEGACY_DB_PORT"},
		},
		&cli.StringFlag{
			Name:    "legacy-db-user",
			Usage:   "Legacy database user",
			EnvVars: []string{"LEGACY_DB_USER"},
		},
		&cli.StringFlag{
			Name:    "legacy-db-password",
			Usage:   "Legacy database password",
			EnvVars: []string{"LEGACY_DB_PASSWORD"},
		},
		&cli.StringFlag{
			Name:    "legacy-db-name",
			Usage:   "Legacy database name",
			EnvVars: []string{"LEGACY_DB_NAME"},
		},
		&cli.StringFlag{
			Name:    "legacy-db-timezone",
			Usage:   "Legacy database timezone",
			Value:   "Asia/Jakarta",
			EnvVars: []string{"LEGACY_DB_TIMEZONE"},
		},
		&cli.StringSliceFlag{
			Name:    "legacy-store-ids",
			Usage:   "Comma-separated list of store IDs to fetch from legacy DB (e.g. 7,8,9). If empty, fetches all active stores",
			EnvVars: []string{"LEGACY_STORE_IDS"},
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

	didReset, err := maybeResetDatabase(c, db)
	if err != nil {
		return err
	}

	// Optionally run migrations (reusing runMigrations from main.go)
	migrationsDir := c.String("migrations-dir")
	if !didReset && migrationsDir != "" {
		if _, err := os.Stat(migrationsDir); err == nil {
			if err := runMigrations(ctx, db, migrationsDir); err != nil {
				return err
			}
		}
	}

	downloadDir := c.String("download-dir")
	intermediateDir := c.String("intermediate-dir")
	outputDir := c.String("output-dir")
	inputDateFormat := c.String("input-date-format")
	persistDebug := c.Bool("persist-debug-layers")
	snapshotDate := c.String("snapshot-date")
	reuseLocal := c.Bool("reuse-local")

	// Check if legacy DB mode is enabled
	legacyDBHost := c.String("legacy-db-host")
	useLegacyDB := legacyDBHost != ""

	var localFiles []string

	if useLegacyDB {
		// Legacy DB mode: fetch data directly from CI3 MySQL database
		if snapshotDate == "" {
			return fmt.Errorf("snapshot-date is required when using legacy DB mode")
		}

		log.Printf("Legacy DB mode enabled: fetching stock health data from MySQL database")

		// Build legacy DB config
		legacyCfg := config.LegacyDatabaseConfig{
			Host:     legacyDBHost,
			Port:     c.String("legacy-db-port"),
			User:     c.String("legacy-db-user"),
			Password: c.String("legacy-db-password"),
			DBName:   c.String("legacy-db-name"),
			Timezone: c.String("legacy-db-timezone"),
		}

		// Connect to legacy database
		legacyDB, err := legacydb.NewClient(legacyCfg)
		if err != nil {
			return fmt.Errorf("failed to connect to legacy database: %w", err)
		}
		defer legacyDB.Close()

		repo := legacydb.NewStockHealthRepository(legacyDB)

		// Parse snapshot date
		parsedDate, err := time.Parse(inputDateFormat, snapshotDate)
		if err != nil {
			return fmt.Errorf("failed to parse snapshot date %s: %w", snapshotDate, err)
		}

		// Determine which stores to fetch
		storeIDsFlag := c.StringSlice("legacy-store-ids")
		var storeIDs []int

		if len(storeIDsFlag) > 0 {
			// Parse provided store IDs
			for _, idStr := range storeIDsFlag {
				var id int
				if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
					return fmt.Errorf("invalid store ID %s: %w", idStr, err)
				}
				storeIDs = append(storeIDs, id)
			}
			log.Printf("Fetching data for %d specified stores", len(storeIDs))
		} else {
			// Fetch all active stores
			storeIDs, err = repo.GetActiveStoreIDs(ctx)
			if err != nil {
				return fmt.Errorf("failed to get active store IDs: %w", err)
			}
			log.Printf("Fetching data for %d active stores", len(storeIDs))
		}

		// Create download directory for this snapshot date
		dateDownloadDir := filepath.Join(downloadDir, snapshotDate)
		if err := os.MkdirAll(dateDownloadDir, 0755); err != nil {
			return fmt.Errorf("failed to create download directory: %w", err)
		}

		// Fetch and write CSV for each store
		for _, storeID := range storeIDs {
			log.Printf("Fetching data for store ID %d...", storeID)

			rows, storeName, err := repo.FetchStoreSnapshot(ctx, storeID, parsedDate)
			if err != nil {
				log.Printf("Warning: failed to fetch store %d: %v (skipping)", storeID, err)
				continue
			}

			if len(rows) == 0 {
				log.Printf("Warning: no data found for store %d on %s (skipping)", storeID, snapshotDate)
				continue
			}

			// Write CSV file
			csvPath, err := legacydb.WriteStoreCSV(rows, storeName, snapshotDate, dateDownloadDir)
			if err != nil {
				log.Printf("Warning: failed to write CSV for store %d: %v (skipping)", storeID, err)
				continue
			}

			localFiles = append(localFiles, csvPath)
			log.Printf("Generated CSV for store %d (%s): %d rows -> %s", storeID, storeName, len(rows), filepath.Base(csvPath))
		}

		if len(localFiles) == 0 {
			return fmt.Errorf("no data fetched from legacy database")
		}

		log.Printf("Successfully generated %d CSV files from legacy database", len(localFiles))

	} else if reuseLocal {
		// Reuse existing local files
		log.Printf("Reusing existing files in %s (skip Drive download)", downloadDir)
		var err error
		localFiles, err = filepath.Glob(filepath.Join(downloadDir, "*.csv"))
		if err != nil {
			return fmt.Errorf("failed to list local files: %w", err)
		}
	} else {
		// Drive mode: download from Google Drive
		folderID := c.String("drive-folder-id")
		if folderID == "" {
			return fmt.Errorf("drive-folder-id is required (or use legacy DB mode with --legacy-db-host)")
		}

		credsJSON := os.Getenv("GOOGLE_DRIVE_CREDENTIALS_JSON")
		if strings.TrimSpace(credsJSON) == "" {
			return fmt.Errorf("GOOGLE_DRIVE_CREDENTIALS_JSON env is required")
		}

		driveSvc, err := drive.NewService(credsJSON)
		if err != nil {
			return fmt.Errorf("failed to create Drive service: %w", err)
		}
		downloader := drive.NewDownloader(driveSvc)

		if snapshotDate != "" {
			log.Printf("Downloading stock health of date '%s' from Drive folder %s to %s", snapshotDate, folderID, downloadDir)
		} else {
			log.Printf("Downloading stock health files from Drive folder %s to %s", folderID, downloadDir)
		}

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
		log.Println("No CSV files found in Drive folder; nothing to process")
		return nil
	}

	if snapshotDate != "" {
		filtered := make([]string, 0, len(localFiles))
		for _, path := range localFiles {
			base := filepath.Base(path)
			if strings.HasPrefix(base, snapshotDate) {
				filtered = append(filtered, path)
			}
		}
		if len(filtered) == 0 {
			log.Printf("No downloaded files matched snapshot date %s; nothing to process", snapshotDate)
			return nil
		}
		localFiles = filtered
	}

	log.Printf("Downloaded %d files from Google Drive", len(localFiles))

	// Load special SKUs that are top 100 per store
	dataRoot := filepath.Join("data", "pipeline", "stock_health")
	top100Dir := c.String("top100-sku-dir")
	if strings.TrimSpace(top100Dir) == "" {
		top100Dir = filepath.Join(dataRoot, "top_100_sku")
	}

	// Load supplier master data (optional). Source can be specified via flag/env,
	// otherwise we fall back to suppliers.xlsx or suppliers.csv under dataRoot.
	supplierFile := c.String("supplier-file")
	if strings.TrimSpace(supplierFile) == "" {
		// Prefer XLSX, then CSV
		defaultXLSX := filepath.Join(dataRoot, "suppliers.xlsx")
		defaultCSV := filepath.Join(dataRoot, "suppliers.csv")
		if _, err := os.Stat(defaultXLSX); err == nil {
			supplierFile = defaultXLSX
		} else if _, err := os.Stat(defaultCSV); err == nil {
			supplierFile = defaultCSV
		}
	}

	var supplierData []stockhealth.SupplierData
	if strings.TrimSpace(supplierFile) != "" {
		loaded, err := loadSupplierData(supplierFile)
		if err != nil {
			log.Printf("warning: failed to load supplier data from %s: %v (continuing without supplier merge)", supplierFile, err)
		} else {
			supplierData = loaded
			log.Printf("Loaded %d supplier rows from %s", len(supplierData), supplierFile)
		}
	} else {
		log.Printf("No supplier file specified and no default suppliers.xlsx/csv found under %s; continuing without supplier merge", dataRoot)
	}

	// Build stock health pipeline
	stockCfg := stockhealth.Config{
		SupplierData:        supplierData,
		StoreContributions:  STORE_CONTRIBUTIONS,
		PadangStoreName:     "Miss Glam Padang",
		InputDateFormat:     inputDateFormat,
		OutputDir:           outputDir,
		DownloadDir:         downloadDir,
		Top100SKUDir:        top100Dir,
		IntermediateDir:     intermediateDir,
		PersistMergedOnly:   true,
		PersistDebugLayers:  persistDebug,
		CloudStorageEnabled: c.Bool("cloud-storage-enabled"),
		CloudBucket:         c.String("cloud-storage-bucket"),
		CloudEndpoint:       c.String("cloud-storage-endpoint"),
		CloudRegion:         c.String("cloud-storage-region"),
		CloudAccessKey:      c.String("cloud-storage-access-key"),
		CloudSecretKey:      c.String("cloud-storage-secret-key"),
		CloudUseSSL:         c.Bool("cloud-storage-use-ssl"),
		CloudPrefix:         c.String("cloud-storage-prefix"),
	}

	pipelineImpl, err := stockhealth.NewStockHealthPipeline(stockCfg)
	if err != nil {
		return fmt.Errorf("failed to create stock health pipeline: %w", err)
	}

	// Upload raw files to cloud storage concurrently with processing
	var uploadErr error
	uploadDone := make(chan struct{})
	if stockCfg.CloudStorageEnabled && snapshotDate != "" {
		go func() {
			defer close(uploadDone)
			log.Printf("Starting concurrent upload of %d raw files to cloud storage...", len(localFiles))
			parsedDate, err := time.Parse(inputDateFormat, snapshotDate)
			if err != nil {
				log.Printf("warning: failed to parse snapshot date %s: %v (skipping raw upload)", snapshotDate, err)
				uploadErr = err
				return
			}

			uploadedCount := 0
			for _, localPath := range localFiles {
				if _, err := pipelineImpl.UploadRawFile(ctx, parsedDate, localPath); err != nil {
					log.Printf("warning: failed to upload raw file %s: %v", localPath, err)
				} else {
					uploadedCount++
				}
			}
			log.Printf("Successfully uploaded %d/%d raw files to cloud storage", uploadedCount, len(localFiles))
		}()
	} else {
		close(uploadDone)
	}

	// Configure generic pipeline config
	pCfg := pipeline.DefaultPipelineConfig(pipelineImpl.Name())
	pCfg.OutputDir = outputDir
	pCfg.IntermediateDir = intermediateDir
	pCfg.WorkerCount = c.Int("pipeline-workers")

	// generate orchestrator
	orch := pipeline.NewOrchestrator(db, pCfg)
	if err := orch.Run(ctx, pipelineImpl, localFiles); err != nil {
		return fmt.Errorf("stock health pipeline run failed: %w", err)
	}

	// Invalidate cached stock health responses so the API doesn't serve stale
	// data (e.g. previously cached empty summaries) after the pipeline seeds.
	cfg := config.Load()
	if cfg.Cache.Enabled {
		stockHealthCache, err := cache.NewStockHealthCache(cfg.Cache)
		if err != nil {
			log.Printf("warning: failed to create stock health cache for invalidation: %v", err)
		} else if err := stockHealthCache.InvalidateAll(ctx); err != nil {
			log.Printf("warning: failed to invalidate stock health cache: %v", err)
		} else {
			log.Printf("Invalidated stock health cache")
		}
	}

	// Wait for raw file uploads to complete
	<-uploadDone
	if uploadErr != nil {
		log.Printf("warning: raw file upload encountered errors: %v", uploadErr)
	}

	log.Println("Stock health pipeline completed successfully")
	return nil
}

// loadSupplierData reads supplier master data from a CSV or XLSX file.
// Supported headers (case/space/underscore insensitive):
//   - SKU
//   - Brand
//   - Nama Store / Store / Toko
//   - Nama Supplier / Supplier
//   - No HP / Phone / Telepon
func loadSupplierData(path string) ([]stockhealth.SupplierData, error) {
	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".csv" {
		return loadSupplierDataCSV(path)
	}
	if ext == ".xlsx" {
		return loadSupplierDataXLSX(path)
	}
	return nil, fmt.Errorf("unsupported supplier file extension %s (expected .csv or .xlsx)", ext)
}

func loadSupplierDataCSV(path string) ([]stockhealth.SupplierData, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	r := csv.NewReader(f)
	r.TrimLeadingSpace = true

	header, err := r.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read header from %s: %w", path, err)
	}

	idxSKU, idxBrand, idxStore, idxSupplier, idxPhone := supplierHeaderIndexes(header)

	var out []stockhealth.SupplierData
	for {
		record, err := r.Read()
		if err != nil {
			break
		}
		get := func(idx int) string {
			if idx < 0 || idx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[idx])
		}
		row := stockhealth.SupplierData{
			SKU:          get(idxSKU),
			Brand:        get(idxBrand),
			NamaStore:    get(idxStore),
			NamaSupplier: get(idxSupplier),
			NoHP:         get(idxPhone),
		}
		if strings.TrimSpace(row.SKU) == "" && strings.TrimSpace(row.NamaStore) == "" {
			continue
		}
		out = append(out, row)
	}
	return out, nil
}

func loadSupplierDataXLSX(path string) ([]stockhealth.SupplierData, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to open supplier xlsx %s: %w", path, err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("supplier xlsx %s has no sheets", path)
	}
	sheet := sheets[0]

	rows, err := f.Rows(sheet)
	if err != nil {
		return nil, fmt.Errorf("failed to read rows from supplier sheet %s: %w", sheet, err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("supplier xlsx %s has no header row", path)
	}
	header, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("failed to read header from %s: %w", path, err)
	}
	idxSKU, idxBrand, idxStore, idxSupplier, idxPhone := supplierHeaderIndexes(header)

	var out []stockhealth.SupplierData
	for rows.Next() {
		record, err := rows.Columns()
		if err != nil {
			return nil, fmt.Errorf("failed to read row from %s: %w", path, err)
		}
		get := func(idx int) string {
			if idx < 0 || idx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[idx])
		}
		row := stockhealth.SupplierData{
			SKU:          get(idxSKU),
			Brand:        get(idxBrand),
			NamaStore:    get(idxStore),
			NamaSupplier: get(idxSupplier),
			NoHP:         get(idxPhone),
		}
		if strings.TrimSpace(row.SKU) == "" && strings.TrimSpace(row.NamaStore) == "" {
			continue
		}
		out = append(out, row)
	}
	if err := rows.Error(); err != nil {
		return nil, fmt.Errorf("error iterating rows in %s: %w", path, err)
	}
	return out, nil
}

// supplierHeaderIndexes maps normalized header names to SupplierData field indexes.
func supplierHeaderIndexes(header []string) (idxSKU, idxBrand, idxStore, idxSupplier, idxPhone int) {
	idxSKU, idxBrand, idxStore, idxSupplier, idxPhone = -1, -1, -1, -1, -1
	norm := func(s string) string {
		s = strings.ToLower(strings.TrimSpace(s))
		s = strings.ReplaceAll(s, " ", "")
		s = strings.ReplaceAll(s, "_", "")
		s = strings.ReplaceAll(s, ".", "")
		return s
	}
	for i, h := range header {
		key := norm(h)
		switch key {
		case "sku":
			if idxSKU == -1 {
				idxSKU = i
			}
		case "brand", "namabrand":
			if idxBrand == -1 {
				idxBrand = i
			}
		case "namastore", "store", "toko":
			if idxStore == -1 {
				idxStore = i
			}
		case "namasupplier", "supplier":
			if idxSupplier == -1 {
				idxSupplier = i
			}
		case "nohp", "nohp.", "phone", "telepon", "no.handphone", "nohandphone":
			if idxPhone == -1 {
				idxPhone = i
			}
		}
	}
	return
}
