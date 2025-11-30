// internal/api/api.go
package api

import (
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type Services struct {
	POService *service.POService
}

func NewRouter(services *Services) *gin.Engine {
	router := gin.New()

	// Add middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())

	// Add routes
	router.Group("/api/v1")
	{
		// Example: apiGroup.GET("/endpoint", handlers.YourHandler)
	}

	return router
}

func errorResponse(c *gin.Context, statusCode int, message string) {
	log.Error().Msg(message)
	c.JSON(statusCode, gin.H{"error": message})
}
