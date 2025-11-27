// backend-go/cmd/server/main.go
package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	"github.com/yourusername/autopo/internal/api"
	"github.com/yourusername/autopo/internal/config"
	"github.com/yourusername/autopo/internal/repository"
	"github.com/yourusername/autopo/internal/service"
	"github.com/yourusername/autopo/pkg/logger"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize logger
	logger.Init(cfg.Env == "production")

	// Initialize database connection
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("Failed to connect to database", "error", err)
	}
	defer db.Close()

	// Test database connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		logger.Fatal("Failed to ping database", "error", err)
	}

	// Initialize repositories
	storeRepo := repository.NewStoreRepository(db)
	brandRepo := repository.NewBrandRepository(db)
	skuRepo := repository.NewSKURepository(db)
	stockHealthRepo := repository.NewStockHealthRepository(db)

	// Initialize services
	services := &service.Services{
		Store:       service.NewStoreService(storeRepo),
		Brand:       service.NewBrandService(brandRepo),
		SKU:         service.NewSKUService(skuRepo, brandRepo),
		StockHealth: service.NewStockHealthService(stockHealthRepo, storeRepo, brandRepo, skuRepo),
	}

	// Initialize HTTP server
	router := api.SetupRouter(services)
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// Start server in a goroutine
	go func() {
		logger.Info("Starting server", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Failed to start server", "error", err)
		}
	}()

	// Wait for interrupt signal to gracefully shut down the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Shutting down server...")

	// The context is used to inform the server it has 5 seconds to finish
	// the request it is currently handling
	ctx, cancel = context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", "error", err)
	}

	logger.Info("Server exiting")
}
