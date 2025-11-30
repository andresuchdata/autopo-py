// cmd/analytics/main.go
package main

import (
	"context"
	"database/sql"
	"flag"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/analytics"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	// Parse command line flags
	dbURL := flag.String("db-url", "", "Database connection string")
	dataDir := flag.String("data-dir", "./data/seeds", "Directory containing seed data")
	processType := flag.String("type", "", "Type of data to process (stock_health, po_snapshots, or all)")
	dateStr := flag.String("date", time.Now().Format("20060102"), "Date in YYYYMMDD format")
	flag.Parse()

	if *dbURL == "" {
		log.Fatal("Database URL is required (use -db-url flag)")
	}

	// Initialize database connection
	db, err := sql.Open("pgx", *dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Create analytics processor
	processor := analytics.NewAnalyticsProcessor(db)

	// Determine which files to process
	filesToProcess := make(map[string]string)
	switch *processType {
	case "stock_health":
		filesToProcess["stock_health"] = filepath.Join(*dataDir, "stock_health", *dateStr+".csv")
	case "po_snapshots":
		filesToProcess["po_snapshots"] = filepath.Join(*dataDir, "purchase_orders_snapshots", *dateStr+".csv")
	case "all", "":
		filesToProcess["stock_health"] = filepath.Join(*dataDir, "stock_health", *dateStr+".csv")
		filesToProcess["po_snapshots"] = filepath.Join(*dataDir, "purchase_orders_snapshots", *dateStr+".csv")
	default:
		log.Fatalf("Unknown process type: %s", *processType)
	}

	// Process each file
	for fileType, filePath := range filesToProcess {
		log.Printf("Processing %s file: %s", fileType, filePath)

		// Check if file exists
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			log.Printf("File not found, skipping: %s", filePath)
			continue
		}

		// Process the file
		start := time.Now()
		if err := processor.ProcessFile(context.Background(), filePath); err != nil {
			log.Printf("Error processing %s: %v", filePath, err)
			continue
		}

		log.Printf("Successfully processed %s in %v", filePath, time.Since(start))
	}
}
