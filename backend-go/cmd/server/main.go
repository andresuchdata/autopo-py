// backend-go/cmd/server/main.go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/yourusername/autopo/backend-go/internal/api/handlers"
	"github.com/yourusername/autopo/backend-go/internal/api/middleware"
	"github.com/yourusername/autopo/backend-go/internal/config"
	"github.com/yourusername/autopo/backend-go/internal/repository/postgres"
	"github.com/yourusername/autopo/backend-go/internal/service"
	"github.com/yourusername/autopo/backend-go/pkg/logger"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize logger
	logger.SetLevel(cfg.Server.Mode)
	if cfg.Server.Mode == "debug" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize database
	db, err := postgres.NewDB(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize services
	poService := service.NewPOService(db)

	// Initialize HTTP server
	router := setupRouter(poService)
	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router,
		ReadTimeout:  time.Duration(cfg.Server.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(cfg.Server.WriteTimeout) * time.Second,
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	logger.Log.Info().Msg("Server exiting")
}

func setupRouter(poService *service.POService) *gin.Engine {
	router := gin.New()

	// Middleware
	router.Use(
		middleware.Logger(),
		middleware.Recovery(),
		middleware.CORS(),
	)

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// API v1
	v1 := router.Group("/api/v1")
	{
		poHandler := handlers.NewPOHandler(poService)
		v1.POST("/upload", poHandler.UploadPO)
		v1.GET("/stores", poHandler.GetStores)
		v1.GET("/stores/:store/results", poHandler.GetStoreResults)
	}

	return router
}