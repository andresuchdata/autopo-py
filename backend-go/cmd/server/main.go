// backend-go/cmd/server/main.go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/api"
	"github.com/andresuchdata/autopo-py/backend-go/internal/cache"
	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository/postgres"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
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

	// Initialize HTTP server
	router := api.NewRouter(&api.Services{
		POService:          poService,
		StockHealthService: stockHealthService,
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
