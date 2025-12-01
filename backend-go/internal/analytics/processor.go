// internal/analytics/processor.go
package analytics

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
		return 0, nil
	}
	return id, err
}

// ResolveProductID looks up a product ID by SKU
func (r *EntityIDResolver) ResolveProductID(ctx context.Context, sku string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM products WHERE sku = $1", sku).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return id, err
}

// EnsureProduct ensures a product exists with the given SKU, creating it if necessary
func (r *EntityIDResolver) EnsureProduct(ctx context.Context, sku string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx,
		"WITH new_product AS ("+
			"  INSERT INTO products (sku, name, created_at, updated_at) "+
			"  VALUES ($1, $2, NOW(), NOW()) "+
			"  ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW() "+
			"  RETURNING id"+
			") SELECT id FROM new_product "+
			"UNION ALL "+
			"SELECT id FROM products WHERE sku = $1",
		sku, "Product "+sku,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("failed to ensure product: %w", err)
	}
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

const analyticsBatchSize = 1000

type stockHealthRecord struct {
	snapshotTime      time.Time
	storeID           int
	productID         int
	brandID           sql.NullInt64
	sku               string
	stock             int
	dailySales        float64
	maxDailySales     float64
	origDailySales    float64
	origMaxDailySales float64
}

type poSnapshotRecord struct {
	snapshotTime     time.Time
	poNumber         string
	productID        int
	sku              string
	productName      string
	brandID          int
	storeID          int
	supplierID       sql.NullInt64
	quantityOrdered  int
	unitPrice        float64
	totalAmount      float64
	status           int
	releasedAt       *time.Time
	sentAt           *time.Time
	approvedAt       *time.Time
	arrivedAt        *time.Time
	receivedAt       *time.Time
	quantityReceived int
}

type stockHealthKey struct {
	snapshotTime time.Time
	sku          string
	storeID      int
	productID    int
	brandID      int64
	brandValid   bool
}

type poSnapshotKey struct {
	snapshotTime  time.Time
	poNumber      string
	sku           string
	productID     int
	brandID       int
	supplierID    int64
	supplierValid bool
}

// ProcessFile processes either stock health or PO snapshot files based on the file path
func (p *AnalyticsProcessor) ProcessFile(ctx context.Context, filePath string) error {
	log.Printf("Processing file: %s, directory: %s", filePath, filepath.Base(filepath.Dir(filePath)))

	switch filepath.Base(filepath.Dir(filePath)) {
	case "stock_health":
		return p.processStockHealthFile(ctx, filePath)
	case "po_snapshots":
		return p.processPOSnapshotFile(ctx, filePath)
	default:
		return fmt.Errorf("unknown file type in directory: %s", filepath.Dir(filePath))
	}
}

// processStockHealthFile ingests stock health CSV data in batches with deduplication
func (p *AnalyticsProcessor) processStockHealthFile(ctx context.Context, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read CSV header: %w", err)
	}

	colMap := make(map[string]int)
	for i, col := range header {
		colMap[col] = i
	}

	snapshotTime, err := parseSnapshotTimeFromFilename(filePath)
	if err != nil {
		log.Printf("warning: defaulting stock snapshot time for %s: %v", filePath, err)
		snapshotTime = time.Now().UTC()
	}

	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	processedCount := 0
	batch := make([]stockHealthRecord, 0, analyticsBatchSize)

	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("error reading record: %w", err)
		}

		sku := strings.TrimSpace(record[colMap["sku"]])
		if sku == "" {
			continue
		}

		var productID int
		err = tx.QueryRowContext(ctx, "SELECT id FROM products WHERE sku = $1", sku).Scan(&productID)
		if err != nil && err != sql.ErrNoRows {
			return fmt.Errorf("failed to resolve product: %w", err)
		}
		if err == sql.ErrNoRows || productID == 0 {
			err = tx.QueryRowContext(ctx,
				"INSERT INTO products (sku, name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING id",
				sku, "Product "+sku,
			).Scan(&productID)
			if err != nil {
				return fmt.Errorf("failed to create product: %w", err)
			}
		}

		brandName := strings.TrimSpace(record[colMap["brand"]])
		var brandID sql.NullInt64
		if brandName != "" {
			err = tx.QueryRowContext(ctx, "SELECT id FROM brands WHERE name = $1", brandName).Scan(&brandID.Int64)
			if err != nil {
				if err == sql.ErrNoRows {
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

		storeID, err := resolveStoreID(ctx, tx, strings.TrimSpace(record[colMap["store"]]))
		if err != nil {
			return err
		}

		stock, _ := strconv.Atoi(record[colMap["stock"]])
		dailySales, _ := strconv.ParseFloat(record[colMap["Daily Sales"]], 64)
		maxDailySales, _ := strconv.ParseFloat(record[colMap["Max. Daily Sales"]], 64)

		rec := stockHealthRecord{
			snapshotTime:      snapshotTime,
			storeID:           storeID,
			productID:         productID,
			brandID:           brandID,
			sku:               sku,
			stock:             stock,
			dailySales:        dailySales,
			maxDailySales:     maxDailySales,
			origDailySales:    dailySales,
			origMaxDailySales: maxDailySales,
		}

		batch = append(batch, rec)
		processedCount++

		if len(batch) == analyticsBatchSize {
			if err := p.flushStockHealthBatch(ctx, tx, batch); err != nil {
				return err
			}
			batch = batch[:0]
		}
	}

	if err := p.flushStockHealthBatch(ctx, tx, batch); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Successfully processed %d stock health records from %s", processedCount, filePath)
	return nil
}

func (p *AnalyticsProcessor) flushStockHealthBatch(ctx context.Context, tx *sql.Tx, batch []stockHealthRecord) error {
	if len(batch) == 0 {
		return nil
	}

	seen := make(map[stockHealthKey]int, len(batch))
	unique := make([]stockHealthRecord, 0, len(batch))
	for _, rec := range batch {
		key := makeStockHealthKey(rec)
		if idx, exists := seen[key]; exists {
			unique[idx] = rec
			continue
		}
		seen[key] = len(unique)
		unique = append(unique, rec)
	}

	valueStrings := make([]string, 0, len(unique))
	args := make([]interface{}, 0, len(unique)*10)
	for i, rec := range unique {
		base := i*10 + 1
		valueStrings = append(valueStrings, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)", base, base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9))
		args = append(args,
			rec.snapshotTime,
			rec.storeID,
			rec.productID,
			toNullableInt64(rec.brandID),
			rec.sku,
			rec.stock,
			rec.dailySales,
			rec.maxDailySales,
			rec.origDailySales,
			rec.origMaxDailySales,
		)
	}

	query := fmt.Sprintf(`
		INSERT INTO daily_stock_data (
			time, store_id, product_id, brand_id, sku,
			stock, daily_sales, max_daily_sales,
			orig_daily_sales, orig_max_daily_sales
		) VALUES %s
		ON CONFLICT (time, store_id, sku, brand_id)
		DO UPDATE SET
			product_id = EXCLUDED.product_id,
			stock = EXCLUDED.stock,
			daily_sales = EXCLUDED.daily_sales,
			max_daily_sales = EXCLUDED.max_daily_sales,
			orig_daily_sales = EXCLUDED.orig_daily_sales,
			orig_max_daily_sales = EXCLUDED.orig_max_daily_sales,
			updated_at = NOW()
	`, strings.Join(valueStrings, ","))

	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("failed to upsert stock health batch: %w", err)
	}
	return nil
}

// processPOSnapshotFile ingests PO snapshot CSV data in batches with deduplication
func (p *AnalyticsProcessor) processPOSnapshotFile(ctx context.Context, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = ';'

	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read CSV header: %w", err)
	}

	colMap := make(map[string]int)
	for i, col := range header {
		colMap[col] = i
	}

	snapshotTime, err := parseSnapshotTimeFromFilename(filePath)
	if err != nil {
		return fmt.Errorf("invalid date in filename %s: %w", filePath, err)
	}

	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	processedCount := 0
	batch := make([]poSnapshotRecord, 0, analyticsBatchSize)

	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("error reading record: %w", err)
		}

		if len(record) < len(colMap) {
			continue
		}

		sku := strings.TrimSpace(record[colMap["SKU"]])
		if sku == "" {
			log.Printf("Skipping record without SKU in file %s", filePath)
			continue
		}

		productName := strings.TrimSpace(record[colMap["Nama Produk"]])
		if productName == "" {
			productName = "Product " + sku
		}

		poNumber := strings.TrimSpace(record[colMap["No PO"]])
		if poNumber == "" {
			return fmt.Errorf("record missing PO number")
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

		storeID, err := resolveStoreID(ctx, tx, strings.TrimSpace(record[colMap["Store"]]))
		if err != nil {
			return err
		}

		supplierName := strings.TrimSpace(record[colMap["Supplier"]])
		supplierID, err := resolveSupplierID(ctx, tx, supplierName)
		if err != nil {
			return err
		}

		quantityOrdered, _ := strconv.Atoi(record[colMap["Qty PO"]])
		unitPrice, _ := strconv.ParseFloat(record[colMap["Harga"]], 64)
		totalAmount, _ := strconv.ParseFloat(record[colMap["Amount"]], 64)
		status, _ := strconv.Atoi(record[colMap["Status"]])
		quantityReceived, _ := strconv.Atoi(record[colMap["Qty Received"]])

		rec := poSnapshotRecord{
			snapshotTime:     snapshotTime,
			poNumber:         poNumber,
			productID:        productID,
			sku:              sku,
			productName:      productName,
			brandID:          brandID,
			storeID:          storeID,
			supplierID:       supplierID,
			quantityOrdered:  quantityOrdered,
			unitPrice:        unitPrice,
			totalAmount:      totalAmount,
			status:           status,
			releasedAt:       parseNullableTime(record[colMap["PO Released"]]),
			sentAt:           parseNullableTime(record[colMap["PO Sent"]]),
			approvedAt:       parseNullableTime(record[colMap["PO Approved"]]),
			arrivedAt:        parseNullableTime(record[colMap["PO Arrived"]]),
			receivedAt:       parseNullableTime(record[colMap["PO Received"]]),
			quantityReceived: quantityReceived,
		}

		batch = append(batch, rec)
		processedCount++

		if len(batch) == analyticsBatchSize {
			if err := p.flushPOSnapshotBatch(ctx, tx, batch); err != nil {
				return err
			}
			batch = batch[:0]
		}
	}

	if err := p.flushPOSnapshotBatch(ctx, tx, batch); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Successfully processed %d PO snapshot records from %s", processedCount, filePath)
	return nil
}

func (p *AnalyticsProcessor) flushPOSnapshotBatch(ctx context.Context, tx *sql.Tx, batch []poSnapshotRecord) error {
	if len(batch) == 0 {
		return nil
	}

	seen := make(map[poSnapshotKey]int, len(batch))
	unique := make([]poSnapshotRecord, 0, len(batch))
	for _, rec := range batch {
		key := makePOSnapshotKey(rec)
		if idx, exists := seen[key]; exists {
			unique[idx] = rec
			continue
		}
		seen[key] = len(unique)
		unique = append(unique, rec)
	}

	valueStrings := make([]string, 0, len(unique))
	args := make([]interface{}, 0, len(unique)*18)
	for i, rec := range unique {
		base := i*18 + 1
		valueStrings = append(valueStrings, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
			base, base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10, base+11, base+12, base+13, base+14, base+15, base+16, base+17))
		args = append(args,
			rec.snapshotTime,
			rec.poNumber,
			rec.productID,
			rec.sku,
			rec.productName,
			rec.brandID,
			rec.storeID,
			toNullableInt64(rec.supplierID),
			rec.quantityOrdered,
			rec.unitPrice,
			rec.totalAmount,
			rec.status,
			toNullTime(rec.releasedAt),
			toNullTime(rec.sentAt),
			toNullTime(rec.approvedAt),
			toNullTime(rec.arrivedAt),
			toNullTime(rec.receivedAt),
			rec.quantityReceived,
		)
	}

	query := fmt.Sprintf(`
		INSERT INTO po_snapshots (
			time, po_number, product_id, sku, product_name,
			brand_id, store_id, supplier_id, quantity_ordered, unit_price,
			total_amount, status, po_released_at, po_sent_at, po_approved_at,
			po_arrived_at, po_received_at, quantity_received
		) VALUES %s
		ON CONFLICT (time, po_number, sku)
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
	`, strings.Join(valueStrings, ","))

	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("failed to upsert po snapshots batch: %w", err)
	}
	return nil
}

func resolveStoreID(ctx context.Context, tx *sql.Tx, storeName string) (int, error) {
	if storeName == "" {
		return 0, fmt.Errorf("record missing store name")
	}
	var storeID int
	if err := tx.QueryRowContext(ctx, "SELECT id FROM stores WHERE LOWER(name) = LOWER($1)", storeName).Scan(&storeID); err != nil {
		if err != sql.ErrNoRows {
			return 0, fmt.Errorf("failed to resolve store: %w", err)
		}
		if err := tx.QueryRowContext(ctx,
			"INSERT INTO stores (name, created_at, updated_at) VALUES ($1, NOW(), NOW()) RETURNING id",
			storeName,
		).Scan(&storeID); err != nil {
			return 0, fmt.Errorf("failed to create store: %w", err)
		}
	}
	return storeID, nil
}

func resolveSupplierID(ctx context.Context, tx *sql.Tx, supplierName string) (sql.NullInt64, error) {
	var supplierID sql.NullInt64
	if supplierName == "" {
		return supplierID, nil
	}
	if err := tx.QueryRowContext(ctx, "SELECT id FROM suppliers WHERE LOWER(name) = LOWER($1)", supplierName).Scan(&supplierID.Int64); err != nil {
		if err != sql.ErrNoRows {
			return supplierID, fmt.Errorf("failed to resolve supplier: %w", err)
		}
		if err := tx.QueryRowContext(ctx,
			"INSERT INTO suppliers (name, created_at, updated_at) VALUES ($1, NOW(), NOW()) RETURNING id",
			supplierName,
		).Scan(&supplierID.Int64); err != nil {
			return supplierID, fmt.Errorf("failed to create supplier: %w", err)
		}
	}
	supplierID.Valid = supplierID.Int64 != 0
	return supplierID, nil
}

func parseSnapshotTimeFromFilename(path string) (time.Time, error) {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if len(base) < 8 {
		return time.Time{}, fmt.Errorf("filename %s does not contain yyyymmdd", path)
	}
	return time.Parse("20060102", base[:8])
}

func parseNullableTime(value string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" || value == "0000-00-00 00:00:00" {
		return nil
	}
	formats := []string{
		"2/1/06 15:04",
		"2/1/2006 15:04",
		"2006-01-02 15:04:05",
		time.RFC3339,
	}
	for _, layout := range formats {
		if t, err := time.Parse(layout, value); err == nil {
			return &t
		}
	}
	return nil
}

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

func makeStockHealthKey(rec stockHealthRecord) stockHealthKey {
	var brandID int64
	var valid bool
	if rec.brandID.Valid {
		brandID = rec.brandID.Int64
		valid = true
	}
	return stockHealthKey{
		snapshotTime: rec.snapshotTime,
		sku:          rec.sku,
		storeID:      rec.storeID,
		productID:    rec.productID,
		brandID:      brandID,
		brandValid:   valid,
	}
}

func makePOSnapshotKey(rec poSnapshotRecord) poSnapshotKey {
	var supplierID int64
	var supplierValid bool
	if rec.supplierID.Valid {
		supplierID = rec.supplierID.Int64
		supplierValid = true
	}
	return poSnapshotKey{
		snapshotTime:  rec.snapshotTime,
		poNumber:      rec.poNumber,
		sku:           rec.sku,
		productID:     rec.productID,
		brandID:       rec.brandID,
		supplierID:    supplierID,
		supplierValid: supplierValid,
	}
}
