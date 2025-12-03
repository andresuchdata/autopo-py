// internal/api/api.go
package api

import (
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/api/handlers"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Services struct {
	POService          *service.POService
	StockHealthService *service.StockHealthService
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
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
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
			}
		}

		if services.POService != nil {
			poHandler := handlers.NewPOHandler(services.POService)
			poGroup := apiGroup.Group("/po")
			{
				poGroup.POST("/upload", poHandler.UploadPO)
				poGroup.GET("/stores", poHandler.GetStores)
				poGroup.GET("/brands", poHandler.GetBrands)
				poGroup.GET("/skus", poHandler.GetSkus)
				poGroup.GET("/stores/:store/results", poHandler.GetStoreResults)

				// Dashboard routes
				dashboardGroup := poGroup.Group("/analytics")
				{
					dashboardGroup.GET("/summary", poHandler.GetDashboardSummary)
					dashboardGroup.GET("/trend", poHandler.GetPOTrend)
					dashboardGroup.GET("/aging", poHandler.GetPOAging)
					dashboardGroup.GET("/performance", poHandler.GetSupplierPerformance)
				}
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
