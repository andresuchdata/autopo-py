// backend-go/cmd/server/main.go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/api"
	"github.com/andresuchdata/autopo-py/backend-go/internal/cache"
	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository/postgres"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/andresuchdata/autopo-py/backend-go/internal/validation"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
	_ "github.com/lib/pq"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database connection
	db, err := sql.Open("postgres", fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host, cfg.Database.Port, cfg.Database.User,
		cfg.Database.Password, cfg.Database.DBName, cfg.Database.SSLMode))
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	// Test database connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		logger.Log.Fatal().Err(err).Msg("Failed to ping database")
	}

	// Initialize repository
	dbConn, err := postgres.NewDB(&config.DatabaseConfig{
		Host:     cfg.Database.Host,
		Port:     cfg.Database.Port,
		User:     cfg.Database.User,
		Password: cfg.Database.Password,
		DBName:   cfg.Database.DBName,
		SSLMode:  cfg.Database.SSLMode,
	})
	if err != nil {
		logger.Log.Fatal().Err(err).Msg("Failed to initialize database connection")
	}

	// Initialize repository
	poRepo := postgres.NewPORepository(dbConn)
	stockHealthRepo := repository.NewStockHealthRepository(dbConn.DB)
	pipelineRepo := repository.NewPipelineRepository(dbConn.DB.DB)
	storeRepo := repository.NewStoreRepository(dbConn.DB.DB)

	// Initialize caches
	dashboardCache, err := cache.NewDashboardCache(cfg.Cache)
	if err != nil {
		logger.Log.Warn().Err(err).Msg("Falling back to noop dashboard cache")
		dashboardCache = cache.NewNoopDashboardCache()
	}

	stockHealthCache, err := cache.NewStockHealthCache(cfg.Cache)
	if err != nil {
		logger.Log.Warn().Err(err).Msg("Falling back to noop stock health cache")
		stockHealthCache = cache.NewNoopStockHealthCache()
	}

	// Initialize services
	poService := service.NewPOService(poRepo, dashboardCache)
	stockHealthService := service.NewStockHealthService(stockHealthRepo, stockHealthCache)

	// Initialize storage
	var storageClient storage.ObjectStorage
	if cfg.CloudStorage.Enabled {
		s3Config := storage.Config{
			Endpoint:  cfg.CloudStorage.Endpoint,
			AccessKey: cfg.CloudStorage.AccessKey,
			SecretKey: cfg.CloudStorage.SecretKey,
			Bucket:    cfg.CloudStorage.Bucket,
			Region:    cfg.CloudStorage.Region,
			UseSSL:    cfg.CloudStorage.UseSSL,
			Prefix:    cfg.CloudStorage.Prefix,
		}
		var s3Err error // Use a new error variable to avoid shadowing the main `err`
		storageClient, s3Err = storage.NewS3Client(s3Config)
		if s3Err != nil {
			logger.Log.Fatal().Err(s3Err).Msg("Failed to initialize cloud storage")
		}
		logger.Log.Info().Msg("Cloud storage initialized")
	}

	// Determine notebook directory
	notebookDir := os.Getenv("NOTEBOOK_DIR")
	if notebookDir == "" {
		// Default assumption: backend-go and notebook are siblings
		cwd, _ := os.Getwd() // e.g. .../autopo/backend-go
		notebookDir = filepath.Clean(filepath.Join(cwd, "..", "notebook"))
	}

	// Initialize pipeline service
	pipelineConfig := pipeline.DefaultPipelineConfig("stock_health")
	// TODO: Load pipeline config from centralized application config
	// Pipeline input directory (e.g. notebook/data/input)
	pipelineInputDir := filepath.Join(notebookDir, "data", "input")
	credsJSON := os.Getenv("GOOGLE_DRIVE_CREDENTIALS_JSON")
	pipelineService := service.NewPipelineService(dbConn.DB.DB, pipelineRepo, storeRepo, pipelineConfig, pipelineInputDir, storageClient, credsJSON, cfg.LegacyDatabase)

	// Initialize pipeline management service
	pipelineManagement := service.NewPipelineManagementService(db)

	// Initialize validation runner
	validationRunner := validation.NewRunner(notebookDir, storageClient)
	// Configure workers from environment variable (default: 5)
	if workersStr := os.Getenv("VALIDATION_WORKERS"); workersStr != "" {
		if workers, err := strconv.Atoi(workersStr); err == nil && workers > 0 {
			validationRunner.Workers = workers
		}
	}
	if validationRunner.Workers == 0 {
		validationRunner.Workers = 5 // Default to 5 workers
	}

	// Sync top100 SKU files from cloud storage on startup
	top100LocalDir := filepath.Join(notebookDir, "data", "top_100_sku")
	if err := validation.SyncTop100FromCloud(context.Background(), storageClient, top100LocalDir); err != nil {
		logger.Log.Warn().Err(err).Msg("Failed to sync top100 files, continuing without them")
	}

	// Initialize HTTP server
	router := api.NewRouter(&api.Services{
		POService:            poService,
		StockHealthService:   stockHealthService,
		PipelineService:      pipelineService,
		PipelineManagement:   pipelineManagement,
		ValidationRunner:     validationRunner,
		Storage:              storageClient,
		LegacyDBConfig:       cfg.LegacyDatabase,
		StockHealthCache:     stockHealthCache,
		DashboardCache:       dashboardCache,
		DefaultDriveFolderID: cfg.GoogleDrive.FolderID,
	}, cfg.Server.AllowedOrigins)

	srv := &http.Server{
		Addr:    ":" + cfg.Server.Port,
		Handler: router,
	}

	// Start server in a goroutine
	go func() {
		logger.Log.Info().Str("port", cfg.Server.Port).Msg("Starting server")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Log.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Wait for interrupt signal to gracefully shut down the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Log.Info().Msg("Shutting down server...")

	// The context is used to inform the server it has 5 seconds to finish
	// the request it is currently handling
	ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	logger.Log.Info().Msg("Server exiting")
}
