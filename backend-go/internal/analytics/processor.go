// internal/analytics/processor.go
package analytics

import (
	"bufio"
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
	"github.com/lib/pq"
)

type Locale string

const (
	LocaleID Locale = "id"
	LocaleUS Locale = "us"
)

type ParseConfig struct {
	Locale Locale
}

func ParseConfigFromOptions(localeStr string) ParseConfig {
	loc := LocaleID
	switch strings.ToLower(localeStr) {
	case "us":
		loc = LocaleUS
	case "id", "":
		loc = LocaleID
	default:
		log.Printf("unknown locale %q, defaulting to id", localeStr)
		loc = LocaleID
	}

	return ParseConfig{Locale: loc}
}

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
	cfg      ParseConfig
}

func NewAnalyticsProcessor(db *sql.DB, cfg ParseConfig) *AnalyticsProcessor {
	return &AnalyticsProcessor{
		db:       db,
		resolver: NewEntityIDResolver(db),
		cfg:      cfg,
	}
}

func (p *AnalyticsProcessor) poTimeLayouts() []string {
	var layouts []string

	switch p.cfg.Locale {
	case LocaleUS:
		// US-style mm/dd
		layouts = []string{
			"1/2/06 15:04",
			"1/2/2006 15:04",
			"01/02/06 15:04",
			"01/02/2006 15:04",
			"1/2/06",
			"1/2/2006",
			"01/02/06",
			"01/02/2006",
		}
	default:
		// ID-style dd/mm (existing behavior)
		layouts = []string{
			"2/1/06 15:04",
			"2/1/2006 15:04",
			"02/01/06 15:04",
			"02/01/2006 15:04",
			"2/1/06",
			"2/1/2006",
			"02/01/06",
			"02/01/2006",
		}
	}

	// Always also support ISO-like formats regardless of locale.
	iso := []string{
		"2006-01-02 15:04",
		"2006-01-02 15:04:05",
		"2006-01-02",
		time.RFC3339,
	}

	return append(layouts, iso...)
}

const analyticsBatchSize = 1000

type stockHealthRecord struct {
	snapshotTime      time.Time
	storeID           int
	productID         int
	brandID           sql.NullInt64
	sku               string
	kategoriBrand     string
	stock             int
	dailySales        float64
	maxDailySales     float64
	origDailySales    float64
	origMaxDailySales float64
	dailyStockCover   float64
	hpp               float64
}

type rawPOSnapshotRow struct {
	sku              string
	productName      string
	poNumber         string
	brandName        string
	storeName        string
	supplierName     string
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

type rawStockHealthRow struct {
	storeName         string
	sku               string
	brandName         string
	kategoriBrand     string
	stock             int
	dailySales        float64
	maxDailySales     float64
	origDailySales    float64
	origMaxDailySales float64
	dailyStockCover   float64
	hpp               float64
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
	brandID       int
	storeID       int
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

	rawRows := make([]rawStockHealthRow, 0)
	productSKUs := make(map[string]struct{})
	storeNames := make(map[string]string)
	brandNames := make(map[string]string)
	skuHPP := make(map[string]float64)

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

		hppValue := parseOptionalFloat(record, colMap, "hpp")
		if hppValue > 0 {
			if _, exists := skuHPP[sku]; !exists {
				skuHPP[sku] = hppValue
			}
		}

		brandName := strings.TrimSpace(record[colMap["brand"]])
		kategoriBrand := ""
		if idx, ok := colMap["Kategori Brand"]; ok && idx < len(record) {
			kategoriBrand = strings.TrimSpace(record[idx])
		}
		storeName := strings.TrimSpace(record[colMap["store"]])
		if storeName == "" {
			return fmt.Errorf("record missing store name")
		}

		stock := parseOptionalInt(record[colMap["stock"]])
		dailySales := parseOptionalFloat(record, colMap, "Daily Sales")
		maxDailySales := parseOptionalFloat(record, colMap, "Max. Daily Sales")
		origDailySales := parseOptionalFloat(record, colMap, "Orig Daily Sales")
		origMaxDailySales := parseOptionalFloat(record, colMap, "Orig Max. Daily Sales")

		var dailyStockCover float64
		if dailySales > 0 {
			dailyStockCover = float64(stock) / dailySales
		} else {
			dailyStockCover = -999999
		}

		productSKUs[sku] = struct{}{}
		storeNames[strings.ToLower(storeName)] = storeName
		if brandName != "" {
			brandNames[strings.ToLower(brandName)] = brandName
		}

		rawRows = append(rawRows, rawStockHealthRow{
			storeName:         storeName,
			sku:               sku,
			brandName:         brandName,
			kategoriBrand:     kategoriBrand,
			stock:             stock,
			dailySales:        dailySales,
			maxDailySales:     maxDailySales,
			origDailySales:    origDailySales,
			origMaxDailySales: origMaxDailySales,
			dailyStockCover:   dailyStockCover,
			hpp:               hppValue,
		})
	}

	productIDs, err := p.ensureProductsBulk(ctx, tx, productSKUs)
	if err != nil {
		return err
	}
	if err := p.updateProductHPPBulk(ctx, tx, skuHPP); err != nil {
		return err
	}
	storeIDs, err := ensureStoresBulk(ctx, tx, storeNames)
	if err != nil {
		return err
	}
	brandIDs, err := ensureBrandsBulk(ctx, tx, brandNames)
	if err != nil {
		return err
	}

	records := make([]stockHealthRecord, 0, len(rawRows))
	seen := make(map[stockHealthKey]int)
	for _, raw := range rawRows {
		storeID, ok := storeIDs[strings.ToLower(raw.storeName)]
		if !ok {
			return fmt.Errorf("store %s not resolved", raw.storeName)
		}
		productID, ok := productIDs[raw.sku]
		if !ok {
			return fmt.Errorf("product %s not resolved", raw.sku)
		}

		var brandID sql.NullInt64
		if raw.brandName != "" {
			if id, ok := brandIDs[strings.ToLower(raw.brandName)]; ok {
				brandID = sql.NullInt64{Int64: int64(id), Valid: true}
			} else {
				return fmt.Errorf("brand %s not resolved", raw.brandName)
			}
		}

		rec := stockHealthRecord{
			snapshotTime:      snapshotTime,
			storeID:           storeID,
			productID:         productID,
			brandID:           brandID,
			sku:               raw.sku,
			kategoriBrand:     raw.kategoriBrand,
			stock:             raw.stock,
			dailySales:        raw.dailySales,
			maxDailySales:     raw.maxDailySales,
			origDailySales:    raw.origDailySales,
			origMaxDailySales: raw.origMaxDailySales,
			dailyStockCover:   raw.dailyStockCover,
			hpp:               raw.hpp,
		}

		key := makeStockHealthKey(rec)
		if idx, exists := seen[key]; exists {
			records[idx] = rec
			continue
		}
		seen[key] = len(records)
		records = append(records, rec)
	}

	if err := p.insertStockHealthRecords(ctx, tx, records); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Successfully processed %d stock health records from %s", len(records), filePath)
	return nil
}

// processPOSnapshotFile ingests PO snapshot CSV data in batches with deduplication
func (p *AnalyticsProcessor) processPOSnapshotFile(ctx context.Context, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Auto-detect delimiter ("," vs ";") based on the header line so we can
	// handle both comma- and semicolon-separated exports.
	bufReader := bufio.NewReader(file)
	firstLine, err := bufReader.ReadString('\n')
	if err != nil && err != io.EOF {
		return fmt.Errorf("failed to read CSV header line: %w", err)
	}
	sep := ','
	if strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
		sep = ';'
	}

	restReader := io.MultiReader(strings.NewReader(firstLine), bufReader)
	reader := csv.NewReader(restReader)
	reader.Comma = sep

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

	rawRows := make([]rawPOSnapshotRow, 0)
	skuNames := make(map[string]string)
	brandNames := make(map[string]string)
	storeNames := make(map[string]string)
	supplierNames := make(map[string]string)

	rowNum := 1 // Track row number for logging (header is row 1)
	poTimeFormats := p.poTimeLayouts()
	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			// Handle CSV parse errors (e.g. wrong number of fields) gracefully
			if parseErr, ok := err.(*csv.ParseError); ok {
				log.Printf("Warning: skipping malformed CSV record in %s at line %d: %v", filePath, rowNum+1, parseErr)
				rowNum++ // Still increment row num as Read likely advanced
				continue
			}

			return fmt.Errorf("error reading record: %w", err)
		}
		rowNum++

		sku := normalizeSKU(record[colMap["SKU"]])
		if sku == "" {
			log.Printf("Skipping record without SKU in file %s", filePath)
			continue
		}

		productName := strings.TrimSpace(record[colMap["Nama Produk"]])
		if productName == "" {
			productName = "Product " + sku
		}

		if _, exists := skuNames[sku]; !exists || skuNames[sku] == "" {
			skuNames[sku] = productName
		}

		poNumber := strings.TrimSpace(record[colMap["No PO"]])
		if poNumber == "" {
			return fmt.Errorf("record missing PO number")
		}

		brandName := strings.TrimSpace(record[colMap["Brand"]])
		if brandName == "" {
			return fmt.Errorf("record missing brand name")
		}
		brandNames[strings.ToLower(brandName)] = brandName

		storeName := strings.TrimSpace(record[colMap["Store"]])
		if storeName == "" {
			return fmt.Errorf("record missing store name")
		}
		storeNames[strings.ToLower(storeName)] = storeName

		supplierName := strings.TrimSpace(record[colMap["Supplier"]])
		if supplierName != "" {
			supplierNames[strings.ToLower(supplierName)] = supplierName
		}

		unitPrice := parseOptionalFloat(record, colMap, "Harga")
		totalAmount := parseOptionalFloat(record, colMap, "Amount")

		// Log warning for extremely large values that might cause issues
		const maxReasonableAmount = 999999999999.99 // ~1 trillion
		if totalAmount > maxReasonableAmount {
			log.Printf("WARNING: Row %d has unusually large total_amount=%.2f (po=%s sku=%s). This may indicate data quality issues.",
				rowNum, totalAmount, poNumber, sku)
		}
		if unitPrice > maxReasonableAmount {
			log.Printf("WARNING: Row %d has unusually large unit_price=%.2f (po=%s sku=%s). This may indicate data quality issues.",
				rowNum, unitPrice, poNumber, sku)
		}

		rawRows = append(rawRows, rawPOSnapshotRow{
			sku:              sku,
			productName:      productName,
			poNumber:         poNumber,
			brandName:        brandName,
			storeName:        storeName,
			supplierName:     supplierName,
			quantityOrdered:  parseOptionalInt(record[colMap["Qty PO"]]),
			unitPrice:        unitPrice,
			totalAmount:      totalAmount,
			status:           parseOptionalInt(record[colMap["Status"]]),
			releasedAt:       parseNullableTime(record[colMap["PO Released"]], poTimeFormats),
			sentAt:           parseNullableTime(record[colMap["PO Sent"]], poTimeFormats),
			approvedAt:       parseNullableTime(record[colMap["PO Approved"]], poTimeFormats),
			arrivedAt:        parseNullableTime(record[colMap["PO Arrived"]], poTimeFormats),
			receivedAt:       parseNullableTime(record[colMap["PO Received"]], poTimeFormats),
			quantityReceived: parseOptionalInt(record[colMap["Qty Received"]]),
		})
	}

	productIDs, err := p.ensureProductsWithNamesBulk(ctx, tx, skuNames)
	if err != nil {
		return err
	}
	storeIDs, err := ensureStoresBulk(ctx, tx, storeNames)
	if err != nil {
		return err
	}
	brandIDs, err := ensureBrandsBulk(ctx, tx, brandNames)
	if err != nil {
		return err
	}
	supplierIDs, err := ensureSuppliersBulk(ctx, tx, supplierNames)
	if err != nil {
		return err
	}

	records := make([]poSnapshotRecord, 0, len(rawRows))
	for _, raw := range rawRows {
		productID, ok := productIDs[raw.sku]
		if !ok {
			return fmt.Errorf("product %s not resolved", raw.sku)
		}

		storeID, ok := storeIDs[strings.ToLower(raw.storeName)]
		if !ok {
			return fmt.Errorf("store %s not resolved", raw.storeName)
		}

		brandID, ok := brandIDs[strings.ToLower(raw.brandName)]
		if !ok {
			return fmt.Errorf("brand %s not resolved", raw.brandName)
		}

		var supplierID sql.NullInt64
		if raw.supplierName != "" {
			if id, ok := supplierIDs[strings.ToLower(raw.supplierName)]; ok {
				supplierID = sql.NullInt64{Int64: int64(id), Valid: true}
			} else {
				return fmt.Errorf("supplier %s not resolved", raw.supplierName)
			}
		}

		records = append(records, poSnapshotRecord{
			snapshotTime:     snapshotTime,
			poNumber:         raw.poNumber,
			productID:        productID,
			sku:              raw.sku,
			productName:      raw.productName,
			brandID:          brandID,
			storeID:          storeID,
			supplierID:       supplierID,
			quantityOrdered:  raw.quantityOrdered,
			unitPrice:        raw.unitPrice,
			totalAmount:      raw.totalAmount,
			status:           raw.status,
			releasedAt:       raw.releasedAt,
			sentAt:           raw.sentAt,
			approvedAt:       raw.approvedAt,
			arrivedAt:        raw.arrivedAt,
			receivedAt:       raw.receivedAt,
			quantityReceived: raw.quantityReceived,
		})
	}

	for start := 0; start < len(records); start += analyticsBatchSize {
		end := start + analyticsBatchSize
		if end > len(records) {
			end = len(records)
		}
		if err := p.flushPOSnapshotBatch(ctx, tx, records[start:end]); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Successfully processed %d PO snapshot records from %s", len(records), filePath)
	return nil
}

func (p *AnalyticsProcessor) flushPOSnapshotBatch(ctx context.Context, tx *sql.Tx, batch []poSnapshotRecord) error {
	if len(batch) == 0 {
		return nil
	}

	seen := make(map[poSnapshotKey]int, len(batch))
	unique := make([]poSnapshotRecord, 0, len(batch))
	duplicateCount := 0
	var lastDuplicate poSnapshotRecord

	for _, rec := range batch {
		key := makePOSnapshotKey(rec)
		if idx, exists := seen[key]; exists {
			duplicateCount++
			lastDuplicate = rec
			unique[idx] = rec
			continue
		}
		seen[key] = len(unique)
		unique = append(unique, rec)
	}

	if duplicateCount > 0 {
		log.Printf("Skipped %d duplicate PO snapshots in batch (keeping latest). Sample duplicate: upload %s (po=%s sku=%s brand_id=%d store_id=%d supplier_id=%s)",
			duplicateCount,
			lastDuplicate.snapshotTime.Format(time.RFC3339),
			lastDuplicate.poNumber,
			lastDuplicate.sku,
			lastDuplicate.brandID,
			lastDuplicate.storeID,
			formatSupplierID(lastDuplicate.supplierID))
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

func parseSnapshotTimeFromFilename(path string) (time.Time, error) {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if len(base) < 8 {
		return time.Time{}, fmt.Errorf("filename %s does not contain yyyymmdd", path)
	}
	return time.Parse("20060102", base[:8])
}

func parseNullableTime(value string, formats []string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" || value == "0000-00-00 00:00:00" {
		return nil
	}

	value = normalizeTimestampSeparators(value)

	for _, layout := range formats {
		if t, err := time.Parse(layout, value); err == nil {
			return &t
		}
	}
	return nil
}

func normalizeTimestampSeparators(value string) string {
	parts := strings.Fields(value)
	if len(parts) < 2 {
		return value
	}
	timePart := parts[len(parts)-1]
	if strings.Contains(timePart, ".") && !strings.Contains(timePart, ":") {
		timePart = strings.ReplaceAll(timePart, ".", ":")
		parts[len(parts)-1] = timePart
		return strings.Join(parts, " ")
	}
	return value
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

func formatSupplierID(v sql.NullInt64) string {
	if v.Valid {
		return strconv.FormatInt(v.Int64, 10)
	}

	return "NULL"
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
		brandID:       rec.brandID,
		storeID:       rec.storeID,
		supplierID:    supplierID,
		supplierValid: supplierValid,
	}
}

func truncateString(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

func parseOptionalFloat(record []string, colMap map[string]int, column string) float64 {
	idx, ok := colMap[column]
	if !ok || idx >= len(record) {
		return 0
	}
	value := strings.TrimSpace(record[idx])
	if value == "" {
		return 0
	}
	value = strings.ReplaceAll(value, ",", "")
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func parseOptionalInt(value string) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return parsed
}

func (p *AnalyticsProcessor) ensureProductsBulk(ctx context.Context, tx *sql.Tx, skus map[string]struct{}) (map[string]int, error) {
	result := make(map[string]int, len(skus))
	if len(skus) == 0 {
		return result, nil
	}
	skuList := make([]string, 0, len(skus))
	for sku := range skus {
		skuList = append(skuList, sku)
	}

	rows, err := tx.QueryContext(ctx,
		`SELECT sku, id FROM products WHERE sku = ANY($1)`,
		pq.Array(skuList),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load product ids: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var sku string
		var id int
		if err := rows.Scan(&sku, &id); err != nil {
			return nil, fmt.Errorf("failed to scan product id: %w", err)
		}
		result[sku] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("product id rows error: %w", err)
	}

	insertStmt := `
		INSERT INTO products (sku, name, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (sku) DO UPDATE
			SET name = EXCLUDED.name,
			    updated_at = NOW()
		RETURNING id
	`
	for _, sku := range skuList {
		if _, exists := result[sku]; exists {
			continue
		}
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, sku, "Product "+sku).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert product %s: %w", sku, err)
		}
		result[sku] = id
	}
	return result, nil
}

func ensureSuppliersBulk(ctx context.Context, tx *sql.Tx, names map[string]string) (map[string]int, error) {
	result := make(map[string]int, len(names))
	if len(names) == 0 {
		return result, nil
	}
	lowerNames := make([]string, 0, len(names))
	for key := range names {
		lowerNames = append(lowerNames, key)
	}
	rows, err := tx.QueryContext(ctx,
		`SELECT LOWER(name) AS key, id FROM suppliers WHERE LOWER(name) = ANY($1)`,
		pq.Array(lowerNames),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load supplier ids: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var id int
		if err := rows.Scan(&key, &id); err != nil {
			return nil, fmt.Errorf("failed to scan supplier id: %w", err)
		}
		result[key] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("supplier rows error: %w", err)
	}

	insertStmt := `
		INSERT INTO suppliers (name, created_at, updated_at)
		VALUES ($1, NOW(), NOW())
		RETURNING id
	`
	for key, displayName := range names {
		if _, exists := result[key]; exists {
			continue
		}
		displayName = truncateString(displayName, 255)
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, displayName).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert supplier %s: %w", displayName, err)
		}
		result[key] = id
	}
	return result, nil
}

func (p *AnalyticsProcessor) ensureProductsWithNamesBulk(ctx context.Context, tx *sql.Tx, skuNames map[string]string) (map[string]int, error) {
	if len(skuNames) == 0 {
		return map[string]int{}, nil
	}
	skus := make(map[string]struct{}, len(skuNames))
	for sku := range skuNames {
		skus[sku] = struct{}{}
	}
	productIDs, err := p.ensureProductsBulk(ctx, tx, skus)
	if err != nil {
		return nil, err
	}
	insertStmt := `
		INSERT INTO products (sku, name, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (sku) DO UPDATE
			SET name = EXCLUDED.name,
			    updated_at = NOW()
		RETURNING id
	`
	for sku, name := range skuNames {
		if name == "" {
			name = "Product " + sku
		}
		name = truncateString(name, 255)
		if _, exists := productIDs[sku]; exists {
			continue
		}
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, sku, name).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert product %s: %w", sku, err)
		}
		productIDs[sku] = id
	}
	return productIDs, nil
}

func (p *AnalyticsProcessor) updateProductHPPBulk(ctx context.Context, tx *sql.Tx, skuHPP map[string]float64) error {
	if len(skuHPP) == 0 {
		return nil
	}
	const stmt = `
		UPDATE products
		SET hpp = $2, updated_at = NOW()
		WHERE sku = $1 AND (hpp IS NULL OR hpp = 0)
	`
	for sku, hpp := range skuHPP {
		if hpp <= 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, stmt, sku, hpp); err != nil {
			return fmt.Errorf("failed to update hpp for sku %s: %w", sku, err)
		}
	}
	return nil
}

func ensureStoresBulk(ctx context.Context, tx *sql.Tx, names map[string]string) (map[string]int, error) {
	result := make(map[string]int, len(names))
	if len(names) == 0 {
		return result, nil
	}
	lowerNames := make([]string, 0, len(names))
	for key := range names {
		lowerNames = append(lowerNames, key)
	}
	rows, err := tx.QueryContext(ctx,
		`SELECT LOWER(name) AS key, id FROM stores WHERE LOWER(name) = ANY($1)`,
		pq.Array(lowerNames),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load store ids: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var id int
		if err := rows.Scan(&key, &id); err != nil {
			return nil, fmt.Errorf("failed to scan store id: %w", err)
		}
		result[key] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store rows error: %w", err)
	}

	insertStmt := `
		INSERT INTO stores (name, created_at, updated_at)
		VALUES ($1, NOW(), NOW())
		ON CONFLICT (LOWER(name)) WHERE original_id IS NULL DO UPDATE SET updated_at = NOW()
		RETURNING id
	`
	for key, displayName := range names {
		if _, exists := result[key]; exists {
			continue
		}
		displayName = truncateString(displayName, 255)
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, displayName).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert store %s: %w", displayName, err)
		}
		result[key] = id
	}
	return result, nil
}

func ensureBrandsBulk(ctx context.Context, tx *sql.Tx, names map[string]string) (map[string]int, error) {
	result := make(map[string]int, len(names))
	if len(names) == 0 {
		return result, nil
	}
	lowerNames := make([]string, 0, len(names))
	for key := range names {
		lowerNames = append(lowerNames, key)
	}
	rows, err := tx.QueryContext(ctx,
		`SELECT LOWER(name) AS key, id FROM brands WHERE LOWER(name) = ANY($1)`,
		pq.Array(lowerNames),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load brand ids: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var id int
		if err := rows.Scan(&key, &id); err != nil {
			return nil, fmt.Errorf("failed to scan brand id: %w", err)
		}
		result[key] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("brand rows error: %w", err)
	}

	insertStmt := `
		INSERT INTO brands (name, created_at, updated_at)
		VALUES ($1, NOW(), NOW())
		ON CONFLICT (LOWER(name)) WHERE original_id IS NULL DO UPDATE SET updated_at = NOW()
		RETURNING id
	`
	for key, displayName := range names {
		if _, exists := result[key]; exists {
			continue
		}
		displayName = truncateString(displayName, 255)
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, displayName).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert brand %s: %w", displayName, err)
		}
		result[key] = id
	}
	return result, nil
}

func (p *AnalyticsProcessor) insertStockHealthRecords(ctx context.Context, tx *sql.Tx, records []stockHealthRecord) error {
	if len(records) == 0 {
		return nil
	}

	stagingName := fmt.Sprintf("stock_health_stage_%d", time.Now().UnixNano())
	quotedTable := pq.QuoteIdentifier(stagingName)
	createStmt := fmt.Sprintf(`
		CREATE TEMP TABLE %s (
			time TIMESTAMPTZ NOT NULL,
			store_id INTEGER NOT NULL,
			product_id INTEGER NOT NULL,
			brand_id INTEGER,
			sku VARCHAR(255) NOT NULL,
			kategori_brand VARCHAR(255),
			stock INTEGER,
			daily_sales DOUBLE PRECISION,
			max_daily_sales DOUBLE PRECISION,
			orig_daily_sales DOUBLE PRECISION,
			orig_max_daily_sales DOUBLE PRECISION,
			daily_stock_cover DOUBLE PRECISION,
			hpp DOUBLE PRECISION
		) ON COMMIT DROP
	`, quotedTable)
	if _, err := tx.ExecContext(ctx, createStmt); err != nil {
		return fmt.Errorf("failed to create stock health staging table: %w", err)
	}

	if err := copyStockHealthToStaging(ctx, tx, stagingName, records); err != nil {
		return err
	}

	insertStmt := fmt.Sprintf(`
		INSERT INTO daily_stock_data (
			time, store_id, product_id, brand_id, sku, kategori_brand,
			stock, daily_sales, max_daily_sales,
			orig_daily_sales, orig_max_daily_sales,
			daily_stock_cover, hpp
		)
		SELECT
			time, store_id, product_id, brand_id, sku, kategori_brand,
			stock, daily_sales, max_daily_sales,
			orig_daily_sales, orig_max_daily_sales,
			daily_stock_cover, hpp
		FROM %s
		ON CONFLICT (time, store_id, sku, COALESCE(brand_id, -1))
		DO UPDATE SET
			product_id = EXCLUDED.product_id,
			kategori_brand = EXCLUDED.kategori_brand,
			stock = EXCLUDED.stock,
			daily_sales = EXCLUDED.daily_sales,
			max_daily_sales = EXCLUDED.max_daily_sales,
			orig_daily_sales = EXCLUDED.orig_daily_sales,
			orig_max_daily_sales = EXCLUDED.orig_max_daily_sales,
			daily_stock_cover = EXCLUDED.daily_stock_cover,
			hpp = EXCLUDED.hpp,
			updated_at = NOW()
	`, quotedTable)

	if _, err := tx.ExecContext(ctx, insertStmt); err != nil {
		return fmt.Errorf("failed to upsert stock health records from staging: %w", err)
	}

	return nil
}

func copyStockHealthToStaging(ctx context.Context, tx *sql.Tx, tableName string, records []stockHealthRecord) error {
	quotedTable := pq.QuoteIdentifier(tableName)

	// Postgres has a limit of 65535 parameters. With 12 columns, we can insert ~5400 rows at once.
	// Use a conservative batch size of 5000 rows.
	const batchSize = 5000

	for i := 0; i < len(records); i += batchSize {
		end := i + batchSize
		if end > len(records) {
			end = len(records)
		}
		batch := records[i:end]

		// Build batch INSERT statement
		var valueStrings []string
		var valueArgs []interface{}
		argPos := 1

		for _, rec := range batch {
			valueStrings = append(valueStrings, fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
				argPos, argPos+1, argPos+2, argPos+3, argPos+4, argPos+5,
				argPos+6, argPos+7, argPos+8, argPos+9, argPos+10, argPos+11, argPos+12))

			var brandIDVal interface{}
			if rec.brandID.Valid {
				brandIDVal = rec.brandID.Int64
			} else {
				brandIDVal = nil
			}

			valueArgs = append(valueArgs,
				rec.snapshotTime,
				rec.storeID,
				rec.productID,
				brandIDVal,
				rec.sku,
				rec.kategoriBrand,
				rec.stock,
				rec.dailySales,
				rec.maxDailySales,
				rec.origDailySales,
				rec.origMaxDailySales,
				rec.dailyStockCover,
				rec.hpp,
			)
			argPos += 13
		}

		insertStmt := fmt.Sprintf(`
			INSERT INTO %s (
				time, store_id, product_id, brand_id, sku, kategori_brand,
				stock, daily_sales, max_daily_sales,
				orig_daily_sales, orig_max_daily_sales,
				daily_stock_cover, hpp
			) VALUES %s
		`, quotedTable, strings.Join(valueStrings, ", "))

		if _, err := tx.ExecContext(ctx, insertStmt, valueArgs...); err != nil {
			return fmt.Errorf("failed to insert batch into staging table: %w", err)
		}
	}

	return nil
}

// normalizeSKU normalizes SKU values by trimming whitespace
func normalizeSKU(value string) string {
	return strings.TrimSpace(value)
}
