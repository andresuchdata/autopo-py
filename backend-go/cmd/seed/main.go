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

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/urfave/cli/v2"
)

// nullIfEmpty returns NULL if the string is empty, otherwise returns the string
func nullIfEmpty(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func main() {
	app := &cli.App{
		Name:  "seed",
		Usage: "Seed the database with initial data",
		Flags: []cli.Flag{
			&cli.StringFlag{
				Name:     "db-url",
				Usage:    "Database connection string",
				Required: true,
				EnvVars:  []string{"DATABASE_URL"},
			},
			&cli.StringFlag{
				Name:    "data-dir",
				Usage:   "Directory containing seed data",
				Value:   "./data/seeds/master_data",
				EnvVars: []string{"SEED_DATA_DIR"},
			},
		},
		Action: runSeeder,
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

	// First, load the mapping data
	file, err := os.Open(filepath.Join(dataDir, "product_brand_store_supplier_mappings.csv"))
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

	// Prepare the query
	query := `
		WITH new_product AS (
			INSERT INTO products (name, sku, created_at, updated_at)
			VALUES ($1, $2, NOW(), NOW())
			ON CONFLICT (sku) DO UPDATE 
			SET name = EXCLUDED.name, updated_at = NOW()
			RETURNING id, sku
		)
		INSERT INTO product_mappings (
			product_id, sku, original_product_name, brand_id, store_id, supplier_id
		) SELECT 
			np.id, np.sku, $3, b.id, st.id, s.id
		FROM 
			new_product np,
			brands b, 
			stores st, 
			suppliers s
		WHERE 
			b.original_id = $4 AND
			st.original_id = $5 AND
			s.original_id = $6
		ON CONFLICT (product_id, brand_id, store_id, supplier_id) 
		DO UPDATE SET
			sku = EXCLUDED.sku,
			original_product_name = EXCLUDED.original_product_name,
			updated_at = NOW()
	`

	// Process each record
	for {
		record, err := reader.Read()
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return fmt.Errorf("failed to read record: %w", err)
		}

		// Execute the query
		_, err = tx.ExecContext(ctx, query,
			record[3], // $1 product_name
			record[2], // $2 sku
			record[3], // $3 original_product_name
			record[0], // $4 brand_id (original_id)
			record[4], // $5 store_id (original_id)
			record[6], // $6 supplier_id (original_id)
		)

		if err != nil {
			return fmt.Errorf("failed to insert product mapping: %w", err)
		}
	}

	log.Println("Successfully seeded product_mappings")
	return nil
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
