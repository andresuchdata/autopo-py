package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/drive"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository/postgres"
	"github.com/andresuchdata/autopo-py/backend-go/internal/telemetry"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func main() {
	// Load environment variables from .env file if it exists
	_ = godotenv.Load()

	// Load configuration
	cfg := config.Load()

	// Initialize Google Drive service
	driveService, err := drive.NewService(os.Getenv("GOOGLE_DRIVE_CREDENTIALS_JSON"))
	if err != nil {
		log.Fatalf("Failed to initialize Google Drive service: %v", err)
	}

	// Initialize tracing if enabled
	var tp *sdktrace.TracerProvider
	if cfg.OTel.Enabled {
		var err error
		tp, err = telemetry.InitTracer(context.Background(), &cfg.OTel)
		if err != nil {
			log.Fatalf("Failed to initialize tracer: %v", err)
		}
		defer telemetry.ShutdownTracer(tp, context.Background())
	}

	// Create router
	r := mux.NewRouter()

	// Register routes
	// Initialize Database
	db, err := postgres.NewDB(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize Repositories
	ingestRepo := repository.NewIngestRepository(db.DB.DB)

	// Initialize Services
	ingestService := drive.NewIngestService(driveService, ingestRepo)

	// Register routes
	driveHandler := drive.NewHandler(driveService, ingestService)
	driveHandler.RegisterRoutes(r)

	// Health check endpoint
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	// Start server
	addr := fmt.Sprintf(":%s", cfg.Server.Port)
	log.Printf("Server starting on %s\n", addr)

	instrumentedRouter := telemetry.WrapMuxWithTracing(r, "api-server")
	log.Fatal(http.ListenAndServe(addr, instrumentedRouter))
}
