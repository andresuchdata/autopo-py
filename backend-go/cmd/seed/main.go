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

	const batchSize = 1000
	type record struct {
		brandOriginal    string
		storeOriginal    string
		supplierOriginal string
		sku              string
		productName      string
		hpp              sql.NullFloat64
	}

	var (
		batch    []record
		rowCount int
	)

	flushBatch := func() error {
		if len(batch) == 0 {
			return nil
		}

		valueStrings := make([]string, 0, len(batch))
		args := make([]interface{}, 0, len(batch)*6)
		for i, rec := range batch {
			base := i*6 + 1
			valueStrings = append(valueStrings, fmt.Sprintf("($%d::text,$%d::text,$%d::text,$%d::text,$%d::text,$%d::numeric)", base, base+1, base+2, base+3, base+4, base+5))
			args = append(args,
				rec.brandOriginal,
				rec.sku,
				rec.productName,
				rec.storeOriginal,
				rec.supplierOriginal,
				nullFloatToInterface(rec.hpp),
			)
		}

		query := fmt.Sprintf(`
			WITH input_data (brand_original_id, sku, product_name, store_original_id, supplier_original_id, hpp) AS (
				VALUES %s
			),
			upserted_products AS (
				INSERT INTO products (name, sku, hpp, created_at, updated_at)
				SELECT DISTINCT product_name, sku, hpp, NOW(), NOW()
				FROM input_data
				ON CONFLICT (sku) DO UPDATE
				SET name = EXCLUDED.name,
					hpp = EXCLUDED.hpp,
					updated_at = NOW()
				RETURNING id, sku
			)
			INSERT INTO product_mappings (product_id, sku, original_product_name, brand_id, store_id, supplier_id)
			SELECT
				upserted_products.id,
				upserted_products.sku,
				input_data.product_name,
				b.id,
				st.id,
				s.id
			FROM input_data
			JOIN upserted_products ON upserted_products.sku = input_data.sku
			JOIN brands b ON b.original_id = input_data.brand_original_id
			JOIN stores st ON st.original_id = input_data.store_original_id
			JOIN suppliers s ON s.original_id = input_data.supplier_original_id
			ON CONFLICT (product_id, brand_id, store_id, supplier_id)
			DO UPDATE SET
				sku = EXCLUDED.sku,
				original_product_name = EXCLUDED.original_product_name,
				updated_at = NOW()
		`, strings.Join(valueStrings, ","))

		if _, err := tx.ExecContext(ctx, query, args...); err != nil {
			return fmt.Errorf("failed to bulk upsert product mappings: %w", err)
		}

		batch = batch[:0]
		return nil
	}

	for {
		recordData, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("failed to read record: %w", err)
		}

		if len(recordData) < 7 {
			return fmt.Errorf("invalid record (expected at least 7 columns): %v", recordData)
		}

		hppValue, err := parseNullableFloat(safeField(recordData, 8))
		if err != nil {
			return fmt.Errorf("invalid hpp for sku %s: %w", safeField(recordData, 2), err)
		}

		batch = append(batch, record{
			brandOriginal:    strings.TrimSpace(recordData[0]),
			storeOriginal:    strings.TrimSpace(recordData[4]),
			supplierOriginal: strings.TrimSpace(recordData[6]),
			sku:              strings.TrimSpace(recordData[2]),
			productName:      strings.TrimSpace(recordData[3]),
			hpp:              hppValue,
		})

		rowCount++
		if len(batch) == batchSize {
			if err := flushBatch(); err != nil {
				return err
			}
		}
		if rowCount%10000 == 0 {
			log.Printf("Queued %d product mappings...", rowCount)
		}
	}

	if err := flushBatch(); err != nil {
		return err
	}

	log.Printf("Successfully seeded product_mappings (%d records)\n", rowCount)
	return nil
}

func nullFloatToInterface(val sql.NullFloat64) interface{} {
	if val.Valid {
		return val.Float64
	}
	return nil
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

func safeField(record []string, idx int) string {
	if idx < len(record) {
		return record[idx]
	}
	return ""
}
