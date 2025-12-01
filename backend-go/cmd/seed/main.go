package main

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/types"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"github.com/urfave/cli/v2"
)

func newDBURLFlag() *cli.StringFlag {
	return &cli.StringFlag{
		Name:     "db-url",
		Usage:    "Database connection string",
		Required: true,
		EnvVars:  []string{"DATABASE_URL"},
	}
}

// nullIfEmpty returns NULL if the string is empty, otherwise returns the string
func nullIfEmpty(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func initDB(c *cli.Context) error {
	// Initialize database connection
	db, err := sql.Open("pgx", c.String("db-url"))
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	// Test the connection
	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	// Store the database connection in the context
	c.Context = context.WithValue(c.Context, types.DBKey, db)
	return nil
}

func closeDB(c *cli.Context) error {
	// Close the database connection when done
	if db, ok := c.Context.Value(types.DBKey).(*sql.DB); ok && db != nil {
		return db.Close()
	}
	return nil
}

func main() {
	if err := godotenv.Load(".env"); err != nil {
		log.Printf("warning: could not load .env file: %v", err)
	}

	app := &cli.App{
		Name:  "seed",
		Usage: "Seed the database with initial data",
		Flags: []cli.Flag{
			newDBURLFlag(),
		},
		Commands: []*cli.Command{
			{
				Name:  "master",
				Usage: "Seed master data (brands, suppliers, stores, etc.)",
				Flags: []cli.Flag{
					newDBURLFlag(),
					&cli.StringFlag{
						Name:    "data-dir",
						Usage:   "Directory containing master seed data",
						Value:   "./data/seeds/master_data",
						EnvVars: []string{"SEED_DATA_DIR"},
					},
				},
				Before: initDB,
				After:  closeDB,
				Action: runSeeder,
			},
			{
				Name:  "analytics",
				Usage: "Seed analytics data (stock health and PO snapshots)",
				Flags: []cli.Flag{
					newDBURLFlag(),
					&cli.StringFlag{
						Name:    "stock-health-dir",
						Usage:   "Directory containing stock health CSV files",
						Value:   "./data/seeds/stock_health",
						EnvVars: []string{"STOCK_HEALTH_DIR"},
					},
					&cli.StringFlag{
						Name:    "po-snapshots-dir",
						Usage:   "Directory containing PO snapshot CSV files",
						Value:   "./data/seeds/po_snapshots",
						EnvVars: []string{"PO_SNAPSHOTS_DIR"},
					},
					&cli.BoolFlag{
						Name:  "stock-health-only",
						Usage: "Only process stock health files, skip PO snapshots",
						Value: false,
					},
					&cli.BoolFlag{
						Name:  "po-snapshots-only",
						Usage: "Only process PO snapshot files, skip stock health",
						Value: false,
					},
				},
				Before: initDB,
				After:  closeDB,
				Action: SeedAnalyticsData,
			},
			{
				Name:  "all",
				Usage: "Seed both master data and analytics data",
				Flags: []cli.Flag{
					newDBURLFlag(),
					&cli.StringFlag{
						Name:    "data-dir",
						Usage:   "Directory containing master seed data",
						Value:   "./data/seeds/master_data",
						EnvVars: []string{"SEED_DATA_DIR"},
					},
					&cli.StringFlag{
						Name:    "stock-health-dir",
						Usage:   "Directory containing stock health CSV files",
						Value:   "./data/seeds/stock_health",
						EnvVars: []string{"STOCK_HEALTH_DIR"},
					},
					&cli.StringFlag{
						Name:    "po-snapshots-dir",
						Usage:   "Directory containing PO snapshot CSV files",
						Value:   "./data/seeds/po_snapshots",
						EnvVars: []string{"PO_SNAPSHOTS_DIR"},
					},
				},
				Before: initDB,
				After:  closeDB,
				Action: func(c *cli.Context) error {
					// First run master seed
					if err := runSeeder(c); err != nil {
						return fmt.Errorf("error running master seed: %w", err)
					}
					// Then run analytics seed
					if err := SeedAnalyticsData(c); err != nil {
						return fmt.Errorf("error running analytics seed: %w", err)
					}
					return nil
				},
			},
		},
	}

	if err := app.Run(os.Args); err != nil {
		log.Fatal(err)
	}
}

func runSeeder(c *cli.Context) error {
	dbURL := c.String("db-url")
	dataDir := c.String("data-dir")

	// Initialize database connection
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer db.Close()

	ctx := context.Background()

	// Start a transaction
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	// Defer a rollback in case anything fails.
	defer tx.Rollback()

	log.Println("Starting database seeding...")

	// Seed master data
	if err := seedMasterData(ctx, tx, dataDir); err != nil {
		return fmt.Errorf("failed to seed master data: %w", err)
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Println("Database seeding completed successfully!")
	return nil
}

func seedMasterData(ctx context.Context, tx *sql.Tx, dataDir string) error {
	// Seed brands
	if err := seedTable(ctx, tx, "brands", []string{"name", "original_id"}, filepath.Join(dataDir, "brands.csv")); err != nil {
		return fmt.Errorf("failed to seed brands: %w", err)
	}

	// Seed suppliers
	if err := seedTable(ctx, tx, "suppliers",
		[]string{"name", "original_id"},
		filepath.Join(dataDir, "suppliers.csv")); err != nil {
		return fmt.Errorf("failed to seed suppliers: %w", err)
	}

	// Seed stores
	if err := seedTable(ctx, tx, "stores", []string{"name", "original_id"}, filepath.Join(dataDir, "stores.csv")); err != nil {
		return fmt.Errorf("failed to seed stores: %w", err)
	}

	// Seed supplier_brand_mappings
	if err := seedSupplierBrandMappings(ctx, tx, dataDir); err != nil {
		return fmt.Errorf("failed to seed supplier brand mappings: %w", err)
	}

	// Seed product_mappings
	if err := seedProductMappings(ctx, tx, dataDir); err != nil {
		return fmt.Errorf("failed to seed product mappings: %w", err)
	}

	return nil
}

func seedTable(ctx context.Context, tx *sql.Tx, tableName string, columns []string, filePath string) error {
	log.Printf("Seeding %s from %s\n", tableName, filePath)

	// Open CSV file
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file %s: %w", filePath, err)
	}
	defer file.Close()

	// Read CSV header
	reader := csv.NewReader(file)
	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read CSV header: %w", err)
	}

	// Build the SQL query
	placeholders := make([]string, len(columns))
	for i := range columns {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (original_id) DO UPDATE SET %s",
		tableName,
		buildColumnList(columns),
		buildPlaceholders(placeholders),
		buildUpdateClause(columns),
	)

	// Read and process records
	for {
		record, err := reader.Read()
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return fmt.Errorf("failed to read CSV record: %w", err)
		}

		// Convert record to interface{} slice for Exec
		args := make([]interface{}, len(columns))
		for i, col := range columns {
			idx := getColumnIndex(header, col)

			if idx >= len(record) {
				return fmt.Errorf("column index %d out of bounds for column '%s' (record has %d columns)", idx, col, len(record))
			}
			args[i] = record[idx]
		}

		// Execute the query
		_, err = tx.ExecContext(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("failed to insert record: %w", err)
		}
	}

	log.Printf("Successfully seeded %s\n", tableName)
	return nil
}

func seedSupplierBrandMappings(ctx context.Context, tx *sql.Tx, dataDir string) error {
	log.Printf("Seeding supplier_brand_mappings\n")

	// First, load the mapping data
	file, err := os.Open(filepath.Join(dataDir, "supplier_brand_mappings.csv"))
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = ';' // Set the delimiter to semicolon

	// Skip header
	if _, err := reader.Read(); err != nil {
		return fmt.Errorf("failed to read header: %w", err)
	}

	// Prepare the query to join with suppliers, brands, and stores tables
	query := `
        INSERT INTO supplier_brand_mappings (
            supplier_id, brand_id, store_id, order_day, min_purchase, 
            trading_term, promo_factor, delay_factor
        ) 
        SELECT 
            s.id, b.id, st.id, $1, $2, $3, $4, $5
        FROM 
            suppliers s, brands b, stores st
        WHERE 
            ($6 = '' OR s.original_id = $6) AND 
            b.original_id = $7 AND
            st.original_id = $8
        ON CONFLICT (supplier_id, brand_id, store_id) 
        DO UPDATE SET
            order_day = EXCLUDED.order_day,
            min_purchase = EXCLUDED.min_purchase,
            trading_term = EXCLUDED.trading_term,
            promo_factor = EXCLUDED.promo_factor,
            delay_factor = EXCLUDED.delay_factor,
            updated_at = CURRENT_TIMESTAMP
    `

	// Process each record
	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("failed to read record: %w", err)
		}

		// Parse values with empty string handling
		orderDay := 0
		if record[4] != "" {
			orderDay, _ = strconv.Atoi(record[4])
		}

		minPurchase := 0.0
		if record[5] != "" {
			minPurchase, _ = strconv.ParseFloat(record[5], 64)
		}

		// Handle empty supplier_id (NULL in database)
		var supplierID sql.NullString
		if record[1] != "" {
			supplierID = sql.NullString{String: record[1], Valid: true}
		}

		// Execute the query
		_, err = tx.ExecContext(ctx, query,
			orderDay,               // $1 order_day
			minPurchase,            // $2 min_purchase
			nullIfEmpty(record[6]), // $3 trading_term
			nullIfEmpty(record[7]), // $4 promo_factor
			nullIfEmpty(record[8]), // $5 delay_factor
			supplierID,             // $6 supplier_original_id (can be empty)
			record[2],              // $7 brand_original_id
			record[3],              // $8 store_original_id
		)

		if err != nil {
			return fmt.Errorf("failed to insert mapping: %w", err)
		}
	}

	log.Println("Successfully seeded supplier_brand_mappings")
	return nil
}

func seedProductMappings(ctx context.Context, tx *sql.Tx, dataDir string) error {
	log.Printf("Seeding product_mappings\n")

	brandIDs, err := loadOriginalIDMap(ctx, tx, "brands")
	if err != nil {
		return err
	}
	storeIDs, err := loadOriginalIDMap(ctx, tx, "stores")
	if err != nil {
		return err
	}
	supplierIDs, err := loadOriginalIDMap(ctx, tx, "suppliers")
	if err != nil {
		return err
	}

	file, err := os.Open(filepath.Join(dataDir, "product_brand_store_supplier_mappings.csv"))
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = ';'
	reader.FieldsPerRecord = -1

	if _, err := reader.Read(); err != nil {
		return fmt.Errorf("failed to read header: %w", err)
	}

	const query = `
		WITH new_product AS (
			INSERT INTO products (name, sku, hpp, created_at, updated_at)
			VALUES ($1, $2, $3, NOW(), NOW())
			ON CONFLICT (sku) DO UPDATE 
			SET name = EXCLUDED.name,
				hpp = EXCLUDED.hpp,
				updated_at = NOW()
			RETURNING id, sku
		)
		INSERT INTO product_mappings (
			product_id, sku, original_product_name, brand_id, store_id, supplier_id
		)
		SELECT 
			np.id, np.sku, $4, $5, $6, $7
		FROM new_product np
		ON CONFLICT (product_id, brand_id, store_id, supplier_id) 
		DO UPDATE SET
			sku = EXCLUDED.sku,
			original_product_name = EXCLUDED.original_product_name,
			updated_at = NOW()
	`

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare product mapping statement: %w", err)
	}
	defer stmt.Close()

	rowCount := 0
	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("failed to read record: %w", err)
		}

		if len(record) < 7 {
			return fmt.Errorf("invalid record (expected at least 7 columns): %v", record)
		}

		brandKey := strings.TrimSpace(record[0])
		storeKey := strings.TrimSpace(record[4])
		supplierKey := strings.TrimSpace(record[6])

		brandID, ok := brandIDs[brandKey]
		if !ok {
			return fmt.Errorf("brand original_id %s not found", brandKey)
		}
		storeID, ok := storeIDs[storeKey]
		if !ok {
			return fmt.Errorf("store original_id %s not found", storeKey)
		}
		supplierID, ok := supplierIDs[supplierKey]
		if !ok {
			return fmt.Errorf("supplier original_id %s not found", supplierKey)
		}

		productName := strings.TrimSpace(record[3])
		sku := strings.TrimSpace(record[2])
		hppValue, err := parseNullableFloat(record[8])
		if err != nil {
			return fmt.Errorf("invalid hpp for sku %s: %w", sku, err)
		}

		if _, err := stmt.ExecContext(ctx,
			productName, // $1 product_name
			sku,         // $2 sku
			hppValue,    // $3 hpp
			productName, // $4 original_product_name
			brandID,     // $5 brand_id
			storeID,     // $6 store_id
			supplierID,  // $7 supplier_id
		); err != nil {
			return fmt.Errorf("failed to upsert product mapping for sku %s: %w", sku, err)
		}

		rowCount++
		if rowCount%5000 == 0 {
			log.Printf("Seeded %d product mappings...", rowCount)
		}
	}

	log.Printf("Successfully seeded product_mappings (%d records)\n", rowCount)
	return nil
}

func loadOriginalIDMap(ctx context.Context, tx *sql.Tx, tableName string) (map[string]int64, error) {
	query := fmt.Sprintf("SELECT original_id, id FROM %s", tableName)
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to load %s original IDs: %w", tableName, err)
	}
	defer rows.Close()

	result := make(map[string]int64)
	for rows.Next() {
		var (
			originalID sql.NullString
			id         int64
		)
		if err := rows.Scan(&originalID, &id); err != nil {
			return nil, fmt.Errorf("failed to scan %s IDs: %w", tableName, err)
		}
		if !originalID.Valid {
			continue
		}
		result[originalID.String] = id
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate %s IDs: %w", tableName, err)
	}

	return result, nil
}

func parseNullableFloat(value string) (sql.NullFloat64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return sql.NullFloat64{}, nil
	}

	cleaned := strings.ReplaceAll(value, ",", "")
	num, err := strconv.ParseFloat(cleaned, 64)
	if err != nil {
		return sql.NullFloat64{}, fmt.Errorf("invalid float value %s: %w", value, err)
	}

	return sql.NullFloat64{Float64: num, Valid: true}, nil
}

func buildColumnList(columns []string) string {
	return `"` + stringJoin(columns, `", "`) + `"`
}

func buildPlaceholders(placeholders []string) string {
	return stringJoin(placeholders, ", ")
}

func buildUpdateClause(columns []string) string {
	updates := make([]string, 0, len(columns))
	for _, col := range columns {
		if col != "original_id" { // Skip the unique constraint column
			updates = append(updates, fmt.Sprintf(`"%s" = EXCLUDED."%s"`, col, col))
		}
	}
	return stringJoin(updates, ", ")
}

func getColumnIndex(header []string, column string) int {
	for i, h := range header {
		if h == column {
			return i
		}
	}

	panic(fmt.Sprintf("column '%s' not found in header: %v", column, header))
}

func stringJoin(slice []string, sep string) string {
	if len(slice) == 0 {
		return ""
	}
	result := slice[0]
	for _, s := range slice[1:] {
		result += sep + s
	}
	return result
}
