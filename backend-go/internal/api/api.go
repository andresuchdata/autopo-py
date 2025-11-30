// internal/api/api.go
package api

import (
	"github.com/andresuchdata/autopo-py/backend-go/internal/api/handlers"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Services struct {
	POService          *service.POService
	StockHealthService *service.StockHealthService
}

func NewRouter(services *Services) *gin.Engine {
	router := gin.New()

	// Add middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

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
				poGroup.GET("/stores/:store/results", poHandler.GetStoreResults)
			}
		}
	}

	return router
}

func errorResponse(c *gin.Context, statusCode int, message string) {
	log.Error().Msg(message)
	c.JSON(statusCode, gin.H{"error": message})
}
