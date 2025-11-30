// internal/analytics/processor.go
package analytics

import (
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// EntityIDResolver handles ID lookups for various entities
type EntityIDResolver struct {
	db *sql.DB
}

func NewEntityIDResolver(db *sql.DB) *EntityIDResolver {
	return &EntityIDResolver{db: db}
}

// ResolveBrandID looks up a brand ID by name
func (r *EntityIDResolver) ResolveBrandID(ctx context.Context, name string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM brands WHERE name = $1", name).Scan(&id)
	return id, err
}

// ResolveStoreID looks up a store ID by name
func (r *EntityIDResolver) ResolveStoreID(ctx context.Context, name string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM stores WHERE name = $1", name).Scan(&id)
	return id, err
}

// ResolveSupplierID looks up a supplier ID by name
func (r *EntityIDResolver) ResolveSupplierID(ctx context.Context, name string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM suppliers WHERE name = $1", name).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil // Return 0 if not found (foreign key will be NULL)
	}
	return id, err
}

// ResolveProductID looks up a product ID by SKU
func (r *EntityIDResolver) ResolveProductID(ctx context.Context, sku string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM products WHERE sku = $1", sku).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil // Return 0 if not found (foreign key will be NULL)
	}
	return id, err
}

// EnsureProduct ensures a product exists with the given SKU, creating it if necessary
func (r *EntityIDResolver) EnsureProduct(ctx context.Context, sku string) (int, error) {
	var id int
	log.Printf("Ensuring product with SKU: %s", sku)

	// First try to get existing product
	err := r.db.QueryRowContext(ctx,
		"WITH new_product AS ("+
			"  INSERT INTO products (sku, name, created_at, updated_at) "+
			"  VALUES ($1, $2, NOW(), NOW()) "+
			"  ON CONFLICT (sku) DO UPDATE SET sku = EXCLUDED.sku, name = EXCLUDED.name, updated_at = NOW() "+
			"  RETURNING id"+
			") SELECT id FROM new_product "+
			"UNION ALL "+
			"SELECT id FROM products WHERE sku = $1",
		sku, "Product "+sku,
	).Scan(&id)

	if err != nil {
		log.Printf("Error ensuring product with SKU %s: %v", sku, err)
		return 0, fmt.Errorf("failed to ensure product: %w", err)
	}
	log.Printf("Ensured product with SKU %s has ID %d", sku, id)
	return id, nil
}

// AnalyticsProcessor handles processing of analytics data
type AnalyticsProcessor struct {
	db       *sql.DB
	resolver *EntityIDResolver
}

func NewAnalyticsProcessor(db *sql.DB) *AnalyticsProcessor {
	return &AnalyticsProcessor{
		db:       db,
		resolver: NewEntityIDResolver(db),
	}
}

// ProcessFile processes either stock health or PO snapshot files based on the file path
func (p *AnalyticsProcessor) ProcessFile(ctx context.Context, filePath string) error {
	log.Printf("Processing file: %s, directory: %s", filePath, filepath.Base(filepath.Dir(filePath)))

	// Determine file type from path
	dir := filepath.Base(filepath.Dir(filePath))

	switch dir {
	case "stock_health":
		return p.processStockHealthFile(ctx, filePath)
	case "po_snapshots":
		return p.processPOSnapshotFile(ctx, filePath)
	default:
		return fmt.Errorf("unknown file type in directory: %s", dir)
	}
}

// processStockHealthFile processes a stock health CSV file
// processStockHealthFile processes a stock health CSV file
func (p *AnalyticsProcessor) processStockHealthFile(ctx context.Context, filePath string) error {
	log.Printf("Starting to process stock health file: %s", filePath)

	file, err := os.Open(filePath)
	if err != nil {
		log.Printf("Error opening file %s: %v", filePath, err)
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read CSV header: %w", err)
	}

	// Create a map of column indices
	colMap := make(map[string]int)
	for i, col := range header {
		colMap[col] = i
	}

	// Start transaction
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Prepare the upsert query
	query := `
        INSERT INTO daily_stock_data (
            time, store_id, product_id, brand_id, sku, 
            stock, daily_sales, max_daily_sales,
            orig_daily_sales, orig_max_daily_sales,
            updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
        ) 
        ON CONFLICT (time, store_id, sku, brand_id) 
        DO UPDATE SET
            product_id = EXCLUDED.product_id,
            stock = EXCLUDED.stock,
            daily_sales = EXCLUDED.daily_sales,
            max_daily_sales = EXCLUDED.max_daily_sales,
            orig_daily_sales = EXCLUDED.orig_daily_sales,
            orig_max_daily_sales = EXCLUDED.orig_max_daily_sales,
            updated_at = NOW()
    `

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	processedCount := 0

	// Process records
	for {
		record, err := reader.Read()
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return fmt.Errorf("error reading record: %w", err)
		}

		// Get SKU from record
		sku := record[colMap["sku"]]

		// First try to get existing product
		var productID int
		err = tx.QueryRowContext(ctx, "SELECT id FROM products WHERE sku = $1", sku).Scan(&productID)
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("failed to resolve product: %w", err)
		}

		// If product doesn't exist, create it
		if err == sql.ErrNoRows || productID == 0 {
			log.Printf("Product with SKU %s not found, creating new product", sku)

			// Create product within the same transaction
			err = tx.QueryRowContext(ctx,
				"INSERT INTO products (sku, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id",
				sku, "Product "+sku,
			).Scan(&productID)
			if err != nil {
				return fmt.Errorf("failed to create product: %w", err)
			}
			log.Printf("Created new product with ID: %d, SKU: %s", productID, sku)
		} else {
			log.Printf("Found existing product with ID: %d, SKU: %s", productID, sku)
		}

		// Lookup other IDs (brand, store)
		brandNameRaw := record[colMap["brand"]]
		brandName := strings.TrimSpace(brandNameRaw)
		var brandID sql.NullInt64
		if brandName != "" {
			// Try to find existing brand by trimmed name
			err = tx.QueryRowContext(ctx, "SELECT id FROM brands WHERE name = $1", brandName).Scan(&brandID.Int64)
			if err != nil {
				if err == sql.ErrNoRows {
					log.Printf("Brand %q not found, creating new brand", brandName)
					// Create brand within the same transaction
					err = tx.QueryRowContext(ctx,
						"INSERT INTO brands (name, created_at, updated_at) VALUES ($1, NOW(), NOW()) RETURNING id",
						brandName,
					).Scan(&brandID.Int64)
					if err != nil {
						return fmt.Errorf("failed to create brand: %w", err)
					}
					brandID.Valid = true
				} else {
					return fmt.Errorf("failed to resolve brand: %w", err)
				}
			} else {
				brandID.Valid = true
			}
		}

		var storeID int
		err = tx.QueryRowContext(ctx, "SELECT id FROM stores WHERE name = $1", record[colMap["store"]]).Scan(&storeID)
		if err != nil {
			return fmt.Errorf("failed to resolve store: %w", err)
		}

		// Parse numeric values
		stock, _ := strconv.Atoi(record[colMap["stock"]])
		dailySales, _ := strconv.ParseFloat(record[colMap["Daily Sales"]], 64)
		maxDailySales, _ := strconv.ParseFloat(record[colMap["Max. Daily Sales"]], 64)

		log.Printf("Executing query with values - time: %v, store_id: %d, product_id: %d, brand_id: %v, sku: %s",
			time.Now(), storeID, productID, brandID, sku)

		// Execute the query
		_, err = stmt.ExecContext(
			ctx,
			time.Now(), // Or parse from filename
			storeID,
			productID,
			brandID,
			sku,
			stock,
			dailySales,
			maxDailySales,
			dailySales,    // orig_daily_sales
			maxDailySales, // orig_max_daily_sales
		)
		if err != nil {
			return fmt.Errorf("failed to insert record: %w", err)
		}

		processedCount++
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Successfully processed %d stock health records from %s", processedCount, filePath)

	return nil
}

// processPOSnapshotFile processes a PO snapshot CSV file
func (p *AnalyticsProcessor) processPOSnapshotFile(ctx context.Context, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Read CSV with semicolon delimiter
	reader := csv.NewReader(file)
	reader.Comma = ';'

	// Read header
	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read CSV header: %w", err)
	}

	// Create a map of column indices
	colMap := make(map[string]int)
	for i, col := range header {
		colMap[col] = i
	}

	// Start transaction
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Prepare the upsert query
	query := `
		INSERT INTO po_snapshots (
			time, po_number, product_id, sku, product_name,
			brand_id, store_id, supplier_id, quantity_ordered, unit_price, 
			total_amount, status, po_released_at, po_sent_at, po_approved_at, 
			po_arrived_at, po_received_at, quantity_received, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
		) ON CONFLICT (time, po_number, sku) 
		DO UPDATE SET
			quantity_ordered = EXCLUDED.quantity_ordered,
			unit_price = EXCLUDED.unit_price,
			total_amount = EXCLUDED.total_amount,
			status = EXCLUDED.status,
			po_released_at = EXCLUDED.po_released_at,
			po_sent_at = EXCLUDED.po_sent_at,
			po_approved_at = EXCLUDED.po_approved_at,
			po_arrived_at = EXCLUDED.po_arrived_at,
			po_received_at = EXCLUDED.po_received_at,
			quantity_received = EXCLUDED.quantity_received,
			updated_at = NOW()
	`

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to prepare statement: %w", err)
	}
	defer stmt.Close()

	processedCount := 0

	// Process records
	for {
		record, err := reader.Read()
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return fmt.Errorf("error reading record: %w", err)
		}

		// Skip if not enough fields
		if len(record) < len(colMap) {
			continue
		}

		// Ensure product exists (create if missing)
		sku := strings.TrimSpace(record[colMap["SKU"]])
		if sku == "" {
			log.Printf("Skipping record without SKU in file %s", filePath)
			continue
		}

		productName := strings.TrimSpace(record[colMap["Nama Produk"]])
		if productName == "" {
			productName = "Product " + sku
		}

		var productID int
		err = tx.QueryRowContext(ctx, "SELECT id FROM products WHERE sku = $1", sku).Scan(&productID)
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("failed to resolve product: %w", err)
		}

		if err == sql.ErrNoRows || productID == 0 {
			err = tx.QueryRowContext(ctx,
				"INSERT INTO products (sku, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id",
				sku, productName,
			).Scan(&productID)
			if err != nil {
				return fmt.Errorf("failed to create product: %w", err)
			}
		}

		// Lookup IDs
		brandName := strings.TrimSpace(record[colMap["Brand"]])
		if brandName == "" {
			return fmt.Errorf("record missing brand name")
		}

		var brandID int
		err = tx.QueryRowContext(ctx, "SELECT id FROM brands WHERE LOWER(name) = LOWER($1)", brandName).Scan(&brandID)
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("failed to resolve brand: %w", err)
		}

		if err == sql.ErrNoRows || brandID == 0 {
			err = tx.QueryRowContext(ctx,
				"INSERT INTO brands (name, created_at, updated_at) VALUES ($1, NOW(), NOW()) RETURNING id",
				brandName,
			).Scan(&brandID)
			if err != nil {
				return fmt.Errorf("failed to create brand: %w", err)
			}
		}

		storeName := strings.TrimSpace(record[colMap["Store"]])
		if storeName == "" {
			return fmt.Errorf("record missing store name")
		}

		var storeID int
		err = tx.QueryRowContext(ctx, "SELECT id FROM stores WHERE LOWER(name) = LOWER($1)", storeName).Scan(&storeID)
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("failed to resolve store: %w", err)
		}

		if err == sql.ErrNoRows || storeID == 0 {
			err = tx.QueryRowContext(ctx,
				"INSERT INTO stores (name, created_at, updated_at) VALUES ($1, NOW(), NOW()) RETURNING id",
				storeName,
			).Scan(&storeID)
			if err != nil {
				return fmt.Errorf("failed to create store: %w", err)
			}
		}

		supplierName := strings.TrimSpace(record[colMap["Supplier"]])
		var supplierID sql.NullInt64
		if supplierName != "" {
			err = tx.QueryRowContext(ctx, "SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1)", supplierName).Scan(&supplierID.Int64)
			if err != nil {
				if err == sql.ErrNoRows {
					err = tx.QueryRowContext(ctx,
						"INSERT INTO suppliers (name, created_at, updated_at) VALUES ($1, NOW(), NOW()) RETURNING id",
						supplierName,
					).Scan(&supplierID.Int64)
					if err != nil {
						return fmt.Errorf("failed to create supplier: %w", err)
					}
					supplierID.Valid = true
				} else {
					return fmt.Errorf("failed to resolve supplier: %w", err)
				}
			} else {
				supplierID.Valid = true
			}
		}

		// Parse dates
		parseDate := func(dateStr string) *time.Time {
			if dateStr == "" || dateStr == "0000-00-00 00:00:00" {
				return nil
			}
			// Try multiple date formats
			formats := []string{
				"2/1/06 15:04",
				"2/1/2006 15:04",
				time.RFC3339,
			}
			for _, format := range formats {
				if t, err := time.Parse(format, dateStr); err == nil {
					return &t
				}
			}
			return nil
		}

		// Parse numeric values
		quantityOrdered, _ := strconv.Atoi(record[colMap["Qty PO"]])
		unitPrice, _ := strconv.ParseFloat(record[colMap["Harga"]], 64)
		totalAmount, _ := strconv.ParseFloat(record[colMap["Amount"]], 64)
		status, _ := strconv.Atoi(record[colMap["Status"]])
		quantityReceived, _ := strconv.Atoi(record[colMap["Qty Received"]])

		// Parse dates
		releasedAt := parseDate(record[colMap["PO Released"]])
		sentAt := parseDate(record[colMap["PO Sent"]])
		approvedAt := parseDate(record[colMap["PO Approved"]])
		arrivedAt := parseDate(record[colMap["PO Arrived"]])
		receivedAt := parseDate(record[colMap["PO Received"]])

		// Get snapshot time from filename (format: YYYYMMDD.csv)
		dateStr := filepath.Base(filePath)[:8]
		snapshotTime, err := time.Parse("20060102", dateStr)
		if err != nil {
			return fmt.Errorf("invalid date in filename: %w", err)
		}

		// Execute the query with nullable time values
		_, err = stmt.ExecContext(
			ctx,
			snapshotTime,                // time
			record[colMap["No PO"]],     // po_number
			productID,                   // product_id
			sku,                         // sku
			productName,                 // product_name
			brandID,                     // brand_id
			storeID,                     // store_id
			toNullableInt64(supplierID), // supplier_id
			quantityOrdered,             // quantity_ordered
			unitPrice,                   // unit_price
			totalAmount,                 // total_amount
			status,                      // status
			toNullTime(releasedAt),      // po_released_at
			toNullTime(sentAt),          // po_sent_at
			toNullTime(approvedAt),      // po_approved_at
			toNullTime(arrivedAt),       // po_arrived_at
			toNullTime(receivedAt),      // po_received_at
			quantityReceived,            // quantity_received
		)
		if err != nil {
			return fmt.Errorf("failed to insert record: %w", err)
		}

		processedCount++
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	log.Printf("Successfully processed %d PO snapshot records from %s", processedCount, filePath)

	return nil
}

// toNullTime converts a *time.Time to a NullTime for SQL
func toNullTime(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return *t
}

func toNullableInt64(v sql.NullInt64) interface{} {
	if v.Valid {
		return v.Int64
	}
	return nil
}
