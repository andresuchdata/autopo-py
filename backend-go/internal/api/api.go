// internal/api/api.go
package api

import (
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/api/handlers"
	"github.com/andresuchdata/autopo-py/backend-go/internal/cache"
	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/andresuchdata/autopo-py/backend-go/internal/validation"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Services struct {
	POService            *service.POService
	StockHealthService   *service.StockHealthService
	StockHealthCache     cache.StockHealthCache
	DashboardCache       cache.DashboardCache
	LegacyDBConfig       config.LegacyDatabaseConfig
	Storage              storage.ObjectStorage
	PipelineService      *service.PipelineService
	PipelineManagement   *service.PipelineManagementService
	ValidationRunner     *validation.Runner
	DefaultDriveFolderID string
}

func NewRouter(services *Services, allowedOrigins []string) *gin.Engine {
	router := gin.New()

	// Add middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	defaultOrigins := []string{"http://localhost:3000", "http://127.0.0.1:3000"}
	corsConfig := cors.Config{
		AllowOrigins:     defaultOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "Range"},
		ExposeHeaders:    []string{"Content-Length", "Content-Range"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	if len(allowedOrigins) > 0 {
		normalizedOrigins, allowAll := normalizeAllowedOrigins(allowedOrigins)
		if allowAll {
			corsConfig.AllowOrigins = nil
			corsConfig.AllowOriginFunc = func(origin string) bool { return true }
		} else if len(normalizedOrigins) > 0 {
			corsConfig.AllowOrigins = normalizedOrigins
		}
	}
	router.Use(cors.New(corsConfig))

	apiGroup := router.Group("/api/v1")

	if services != nil {
		if services.StockHealthService != nil {
			stockHealthHandler := handlers.NewStockHealthHandler(services.StockHealthService)
			stockHealthGroup := apiGroup.Group("/analytics/stock_health")
			{
				stockHealthGroup.GET("/summary", stockHealthHandler.GetSummary)
				stockHealthGroup.GET("/items", stockHealthHandler.GetItems)
				stockHealthGroup.GET("/time_series", stockHealthHandler.GetTimeSeries)
				stockHealthGroup.GET("/dashboard", stockHealthHandler.GetDashboard)
				stockHealthGroup.GET("/available_dates", stockHealthHandler.GetAvailableDates)
				stockHealthGroup.GET("/kategori_brands", stockHealthHandler.GetKategoriBrands)
			}
		}

		if services.POService != nil {
			poHandler := handlers.NewPOHandler(services.POService)
			poGroup := apiGroup.Group("/po")
			{
				poGroup.POST("/upload", poHandler.UploadPO)
				poGroup.GET("/stores", poHandler.GetStores)
				poGroup.GET("/brands", poHandler.GetBrands)
				poGroup.GET("/suppliers", poHandler.GetSuppliers)
				poGroup.GET("/skus", poHandler.GetSkus)
				poGroup.GET("/stores/:store/results", poHandler.GetStoreResults)

				// Dashboard routes
				dashboardGroup := poGroup.Group("/analytics")
				{
					dashboardGroup.GET("/summary", poHandler.GetDashboardSummary)
					dashboardGroup.GET("/trend", poHandler.GetPOTrend)
					dashboardGroup.GET("/aging", poHandler.GetPOAging)
					dashboardGroup.GET("/performance", poHandler.GetSupplierPerformance)
					dashboardGroup.GET("/supplier-performance", poHandler.GetSupplierPerformance)
					dashboardGroup.GET("/items", poHandler.GetPOSnapshotItems)
					dashboardGroup.GET("/supplier_items", poHandler.GetSupplierPOItems)
				}
			}
		}

		// ETL operations endpoints
		if services.StockHealthCache != nil && services.DashboardCache != nil {
			etlHandler := handlers.NewETLHandler(services.StockHealthCache, services.DashboardCache, services.LegacyDBConfig)
			etlGroup := apiGroup.Group("/etl")
			{
				etlGroup.POST("/cache/invalidate/stock_health", etlHandler.InvalidateStockHealthCache)
				etlGroup.POST("/cache/invalidate/po_snapshot", etlHandler.InvalidatePOSnapshotCache)
				etlGroup.POST("/jobs/stock_data", etlHandler.TriggerStockDataETL)
				etlGroup.GET("/status", etlHandler.GetETLStatus)
			}
		}

		// Storage operations endpoints
		storageHandler := handlers.NewStorageHandler(services.Storage)
		csvStreamHandler := handlers.NewCSVStreamHandler(services.Storage)
		storageGroup := apiGroup.Group("/storage")
		{
			storageGroup.GET("/files", storageHandler.ListFiles)
			storageGroup.GET("/prefixes", storageHandler.ListPrefixes)
			storageGroup.GET("/download", storageHandler.DownloadFile)
			storageGroup.GET("/download_all", storageHandler.DownloadAll)
			storageGroup.GET("/download/bulk", storageHandler.BulkDownloadFiles)
			storageGroup.GET("/content", storageHandler.GetFileContent)
			storageGroup.GET("/stream_csv", csvStreamHandler.StreamCSV)
			storageGroup.DELETE("/file", storageHandler.DeleteFile)
			storageGroup.DELETE("/files/bulk", storageHandler.BulkDeleteFiles)
			storageGroup.DELETE("/prefix", storageHandler.DeletePrefix)
		}

		// Pipeline & Validation endpoints
		if services.PipelineService != nil && services.ValidationRunner != nil && services.PipelineManagement != nil {
			pipelineHandler := handlers.NewPipelineHandler(
				services.PipelineService,
				services.ValidationRunner,
				services.PipelineManagement,
				services.DefaultDriveFolderID,
			)
			sseHandler := handlers.NewSSEHandler(services.PipelineManagement)

			// Pipeline routes
			pipelineGroup := apiGroup.Group("/pipelines")
			{
				// Legacy endpoint for backward compatibility
				pipelineGroup.POST("/:name/run", pipelineHandler.TriggerPipeline)

				// New configuration-based endpoint
				pipelineGroup.POST("/:name/configure", pipelineHandler.ConfigureAndRunPipeline)

				// Run management
				pipelineGroup.GET("/:name/runs", pipelineHandler.ListPipelineRuns)
				pipelineGroup.GET("/:name/runs/:id", pipelineHandler.GetPipelineRun)
				pipelineGroup.GET("/:name/runs/:id/summary", pipelineHandler.GetPipelineRunSummary)
				pipelineGroup.POST("/:name/runs/:id/stop", pipelineHandler.StopPipelineRun)
				pipelineGroup.POST("/stop-all", pipelineHandler.StopAllRuns)
				pipelineGroup.GET("/:name/runs/:id/stores", pipelineHandler.GetStoreProgress)

				// SSE streaming endpoint
				pipelineGroup.GET("/:name/runs/:id/stream", sseHandler.StreamPipelineProgress)

				// Control endpoints
				pipelineGroup.POST("/:name/runs/:id/pause", pipelineHandler.PausePipelineRun)
				pipelineGroup.POST("/:name/runs/:id/resume", pipelineHandler.ResumePipelineRun)
				pipelineGroup.POST("/:name/runs/:id/retry", pipelineHandler.RetryFailedStores)
			}

			// Store selection endpoint
			apiGroup.GET("/stores", pipelineHandler.GetAllStores)

			// Validation routes
			validationHandler := handlers.NewPipelineHandler(nil, services.ValidationRunner, nil, "") // Validation handler doesn't need folder ID
			reportHandler := handlers.NewValidationHandler(services.Storage)

			validationGroup := apiGroup.Group("/validation")
			{
				validationGroup.POST("/run", validationHandler.TriggerValidation)
				validationGroup.GET("/results", validationHandler.GetValidationResults)
				validationGroup.GET("/report-content", reportHandler.GetReportContent)
				// validationGroup.GET("/results/:date", pipelineHandler.GetValidationResults) // To implement later
			}
		}
	}

	return router
}

func errorResponse(c *gin.Context, statusCode int, message string) {
	log.Error().Msg(message)
	c.JSON(statusCode, gin.H{"error": message})
}

func normalizeAllowedOrigins(origins []string) ([]string, bool) {
	var (
		parsed   []string
		allowAll bool
	)
	for _, origin := range origins {
		parts := strings.Split(origin, ",")
		for _, part := range parts {
			trimmed := strings.TrimSpace(part)
			if trimmed == "" {
				continue
			}
			if trimmed == "*" {
				allowAll = true
				continue
			}
			parsed = append(parsed, trimmed)
		}
	}
	return parsed, allowAll
}
