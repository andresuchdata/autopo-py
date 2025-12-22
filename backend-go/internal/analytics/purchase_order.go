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
	"strings"
	"time"
)

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
