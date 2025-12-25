package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/cache"
	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/legacydb"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type ETLHandler struct {
	stockHealthCache cache.StockHealthCache
	dashboardCache   cache.DashboardCache
	legacyDBConfig   config.LegacyDatabaseConfig
}

func NewETLHandler(stockHealthCache cache.StockHealthCache, dashboardCache cache.DashboardCache, legacyDBConfig config.LegacyDatabaseConfig) *ETLHandler {
	return &ETLHandler{
		stockHealthCache: stockHealthCache,
		dashboardCache:   dashboardCache,
		legacyDBConfig:   legacyDBConfig,
	}
}

// InvalidateStockHealthCache invalidates all stock health related cache entries
func (h *ETLHandler) InvalidateStockHealthCache(c *gin.Context) {
	ctx := c.Request.Context()

	if err := h.stockHealthCache.InvalidateAll(ctx); err != nil {
		log.Error().Err(err).Msg("Failed to invalidate stock health cache")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to invalidate stock health cache",
			"details": err.Error(),
		})
		return
	}

	log.Info().Msg("Stock health cache invalidated successfully")
	c.JSON(http.StatusOK, gin.H{
		"message": "stock health cache invalidated successfully",
	})
}

// InvalidatePOSnapshotCache invalidates all PO snapshot related cache entries
func (h *ETLHandler) InvalidatePOSnapshotCache(c *gin.Context) {
	ctx := c.Request.Context()

	if err := h.dashboardCache.InvalidateAll(ctx); err != nil {
		log.Error().Err(err).Msg("Failed to invalidate PO snapshot cache")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to invalidate PO snapshot cache",
			"details": err.Error(),
		})
		return
	}

	log.Info().Msg("PO snapshot cache invalidated successfully")
	c.JSON(http.StatusOK, gin.H{
		"message": "PO snapshot cache invalidated successfully",
	})
}

// TriggerStockDataETL triggers the stock data ETL job from M2 (legacy CI3) database
// Request body:
//
//	{
//	  "generate_date": "2024-01-15",  // mandatory, format: YYYY-MM-DD
//	  "store_name": "Padang",         // optional
//	  "store_id": 7                   // optional
//	}
func (h *ETLHandler) TriggerStockDataETL(c *gin.Context) {
	var req struct {
		GenerateDate string `json:"generate_date" binding:"required"`
		StoreName    string `json:"store_name"`
		StoreID      *int   `json:"store_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request body",
			"details": err.Error(),
		})
		return
	}

	// Validate generate_date format (YYYY-MM-DD)
	generateDate, err := time.Parse("2006-01-02", req.GenerateDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid generate_date format, expected YYYY-MM-DD",
			"details": err.Error(),
		})
		return
	}

	// Check if legacy DB is configured
	if h.legacyDBConfig.Host == "" || h.legacyDBConfig.User == "" || h.legacyDBConfig.DBName == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "legacy database is not configured",
		})
		return
	}

	// Start ETL job asynchronously
	go h.runStockDataETL(context.Background(), generateDate, req.StoreName, req.StoreID)

	log.Info().
		Str("generate_date", req.GenerateDate).
		Str("store_name", req.StoreName).
		Interface("store_id", req.StoreID).
		Msg("Stock data ETL job triggered")

	c.JSON(http.StatusAccepted, gin.H{
		"message":       "stock data ETL job triggered successfully",
		"generate_date": req.GenerateDate,
		"store_name":    req.StoreName,
		"store_id":      req.StoreID,
		"status":        "processing",
	})
}

func (h *ETLHandler) runStockDataETL(ctx context.Context, generateDate time.Time, storeName string, storeID *int) {
	log.Info().
		Time("generate_date", generateDate).
		Str("store_name", storeName).
		Interface("store_id", storeID).
		Msg("Starting stock data ETL job")

	// Connect to legacy database
	legacyDB, err := legacydb.NewClient(h.legacyDBConfig)
	if err != nil {
		log.Error().Err(err).Msg("Failed to connect to legacy database")
		return
	}
	defer legacyDB.Close()

	repo := legacydb.NewStockHealthRepository(legacyDB)

	// Determine which stores to fetch
	var storeIDs []int
	if storeID != nil {
		// Specific store ID provided
		storeIDs = []int{*storeID}
	} else if storeName != "" {
		// Store name provided - need to look up store ID
		// For now, fetch all stores and filter by name
		allStoreIDs, err := repo.GetActiveStoreIDs(ctx)
		if err != nil {
			log.Error().Err(err).Msg("Failed to get active store IDs")
			return
		}

		// Filter by store name
		normalizedName := strings.ToUpper(strings.TrimSpace(storeName))
		for _, id := range allStoreIDs {
			name, err := repo.GetStoreNameByID(ctx, id)
			if err != nil {
				continue
			}
			if strings.Contains(strings.ToUpper(name), normalizedName) {
				storeIDs = append(storeIDs, id)
			}
		}

		if len(storeIDs) == 0 {
			log.Warn().Str("store_name", storeName).Msg("No stores found matching the provided name")
			return
		}
	} else {
		// No filter - fetch all active stores
		storeIDs, err = repo.GetActiveStoreIDs(ctx)
		if err != nil {
			log.Error().Err(err).Msg("Failed to get active store IDs")
			return
		}
	}

	log.Info().Int("store_count", len(storeIDs)).Msg("Fetching stock data for stores")

	successCount := 0
	failCount := 0

	for _, id := range storeIDs {
		rows, storeName, err := repo.FetchStoreSnapshot(ctx, id, generateDate)
		if err != nil {
			log.Error().Err(err).Int("store_id", id).Msg("Failed to fetch store snapshot")
			failCount++
			continue
		}

		if len(rows) == 0 {
			log.Warn().Int("store_id", id).Msg("No data found for store")
			continue
		}

		log.Info().
			Int("store_id", id).
			Str("store_name", storeName).
			Int("row_count", len(rows)).
			Msg("Fetched stock data for store")

		successCount++
	}

	log.Info().
		Int("success_count", successCount).
		Int("fail_count", failCount).
		Int("total_stores", len(storeIDs)).
		Msg("Stock data ETL job completed")
}

// GetETLStatus returns the status of ETL operations (placeholder for future implementation)
func (h *ETLHandler) GetETLStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "ETL status endpoint - to be implemented",
		"status":  "available",
	})
}
