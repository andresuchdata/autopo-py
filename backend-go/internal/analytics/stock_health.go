package analytics

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/lib/pq"
)

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
			daily_stock_cover DOUBLE PRECISION,
			hpp DOUBLE PRECISION,
			lead_time INTEGER,
			max_lead_time INTEGER,
			min_order INTEGER,
			sedang_po INTEGER,
			safety_stock INTEGER,
			reorder_point INTEGER,
			is_open_po BOOLEAN,
			initial_qty_po INTEGER,
			emergency_po_qty INTEGER,
			updated_regular_po_qty INTEGER,
			final_updated_regular_po_qty INTEGER,
			emergency_po_cost DOUBLE PRECISION,
			final_updated_regular_po_cost DOUBLE PRECISION,
			contribution_pct DOUBLE PRECISION,
			sales_contribution DOUBLE PRECISION,
			target_days_cover INTEGER,
			target_days INTEGER
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
			time, store_id, product_id, brand_id, sku,
			stock, daily_sales, max_daily_sales, daily_stock_cover, hpp,
			lead_time, max_lead_time, min_order, sedang_po,
			safety_stock, reorder_point, is_open_po,
			initial_qty_po, emergency_po_qty, updated_regular_po_qty,
			final_updated_regular_po_qty, emergency_po_cost,
			final_updated_regular_po_cost, contribution_pct,
			sales_contribution, target_days_cover, target_days
		)
		SELECT
			time, store_id, product_id, brand_id, sku,
			stock, daily_sales, max_daily_sales, daily_stock_cover, hpp,
			lead_time, max_lead_time, min_order, sedang_po,
			safety_stock, reorder_point, is_open_po,
			initial_qty_po, emergency_po_qty, updated_regular_po_qty,
			final_updated_regular_po_qty, emergency_po_cost,
			final_updated_regular_po_cost, contribution_pct,
			sales_contribution, target_days_cover, target_days
		FROM %s
		ON CONFLICT (time, store_id, sku, COALESCE(brand_id, -1))
		DO UPDATE SET
			product_id = EXCLUDED.product_id,
			stock = EXCLUDED.stock,
			daily_sales = EXCLUDED.daily_sales,
			max_daily_sales = EXCLUDED.max_daily_sales,
			daily_stock_cover = EXCLUDED.daily_stock_cover,
			hpp = EXCLUDED.hpp,
			lead_time = EXCLUDED.lead_time,
			max_lead_time = EXCLUDED.max_lead_time,
			min_order = EXCLUDED.min_order,
			sedang_po = EXCLUDED.sedang_po,
			safety_stock = EXCLUDED.safety_stock,
			reorder_point = EXCLUDED.reorder_point,
			is_open_po = EXCLUDED.is_open_po,
			initial_qty_po = EXCLUDED.initial_qty_po,
			emergency_po_qty = EXCLUDED.emergency_po_qty,
			updated_regular_po_qty = EXCLUDED.updated_regular_po_qty,
			final_updated_regular_po_qty = EXCLUDED.final_updated_regular_po_qty,
			emergency_po_cost = EXCLUDED.emergency_po_cost,
			final_updated_regular_po_cost = EXCLUDED.final_updated_regular_po_cost,
			contribution_pct = EXCLUDED.contribution_pct,
			sales_contribution = EXCLUDED.sales_contribution,
			target_days_cover = EXCLUDED.target_days_cover,
			target_days = EXCLUDED.target_days,
			updated_at = NOW()
	`, quotedTable)

	if _, err := tx.ExecContext(ctx, insertStmt); err != nil {
		return fmt.Errorf("failed to upsert stock health records from staging: %w", err)
	}

	return nil
}

func copyStockHealthToStaging(ctx context.Context, tx *sql.Tx, tableName string, records []stockHealthRecord) error {
	quotedTable := pq.QuoteIdentifier(tableName)

	// Postgres has a limit of 65535 parameters. With 28 columns, we can insert ~2300 rows at once.
	// Use a conservative batch size of 2000 rows.
	const batchSize = 2000

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
			valueStrings = append(valueStrings, fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
				argPos, argPos+1, argPos+2, argPos+3, argPos+4, argPos+5,
				argPos+6, argPos+7, argPos+8, argPos+9, argPos+10, argPos+11,
				argPos+12, argPos+13, argPos+14, argPos+15, argPos+16, argPos+17,
				argPos+18, argPos+19, argPos+20, argPos+21, argPos+22, argPos+23,
				argPos+24, argPos+25, argPos+26, argPos+27))

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
				rec.dailyStockCover,
				rec.hpp,
				rec.leadTime,
				rec.maxLeadTime,
				rec.minOrder,
				rec.sedangPO,
				rec.safetyStock,
				rec.reorderPoint,
				rec.isOpenPO,
				rec.initialQtyPO,
				rec.emergencyPOQty,
				rec.updatedRegularPOQty,
				rec.finalUpdatedRegularPOQty,
				rec.emergencyPOCost,
				rec.finalUpdatedRegularPOCost,
				rec.contributionPct,
				rec.salesContribution,
				rec.targetDaysCover,
				rec.targetDays,
			)
			argPos += 28
		}

		insertStmt := fmt.Sprintf(`
			INSERT INTO %s (
				time, store_id, product_id, brand_id, sku, kategori_brand,
				stock, daily_sales, max_daily_sales,
				daily_stock_cover, hpp,
				lead_time, max_lead_time, min_order, sedang_po,
				safety_stock, reorder_point, is_open_po,
				initial_qty_po, emergency_po_qty, updated_regular_po_qty,
				final_updated_regular_po_qty, emergency_po_cost,
				final_updated_regular_po_cost, contribution_pct,
				sales_contribution, target_days_cover, target_days
			) VALUES %s
		`, quotedTable, strings.Join(valueStrings, ", "))

		if _, err := tx.ExecContext(ctx, insertStmt, valueArgs...); err != nil {
			return fmt.Errorf("failed to insert batch into staging table: %w", err)
		}
	}

	return nil
}

// processStockHealthFile ingests stock health CSV data in batches with deduplication
func (p *AnalyticsProcessor) processStockHealthFile(ctx context.Context, filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	// Auto-detect delimiter ("," vs ";") based on the header line
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
		colMap[normalizeColumnName(col)] = i
	}

	log.Printf("[DEBUG] CSV file: %s", filepath.Base(filePath))
	log.Printf("[DEBUG] CSV headers (%d): %v", len(header), header)
	log.Printf("[DEBUG] Normalized column map keys: %v", func() []string {
		keys := make([]string, 0, len(colMap))
		for k := range colMap {
			keys = append(keys, k)
		}
		return keys
	}())

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
	seenRows := make(map[string]struct{})

	var skippedRows int
	var rowNumber int

	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			return fmt.Errorf("error reading record: %w", err)
		}
		rowNumber++

		getValue := func(colName string) string {
			if idx, ok := colMap[normalizeColumnName(colName)]; ok && idx < len(record) {
				return strings.TrimSpace(record[idx])
			}
			return ""
		}

		getInt := func(colName string) int {
			val := getValue(colName)
			if val == "" {
				return 0
			}
			return localizedStringToInt(val)
		}

		getFloat := func(colName string) float64 {
			val := getValue(colName)
			if val == "" {
				return 0
			}
			return localizedStringToFloat(val)
		}

		sku := getValue("sku")
		if sku == "" {
			skippedRows++
			log.Printf("warning: skipping row %d in %s: empty SKU", rowNumber+1, filepath.Base(filePath))
		}

		hppValue := getFloat("hpp")
		if hppValue > 0 {
			if _, exists := skuHPP[sku]; !exists {
				skuHPP[sku] = hppValue
			}
		}

		brandName := getValue("brand")
		kategoriBrand := getValue("kategori_brand")
		storeName := getValue("store")
		if storeName == "" {
			return fmt.Errorf("record missing store name")
		}

		dedupKey := strings.ToLower(storeName) + "|" + strings.ToLower(sku)
		if _, exists := seenRows[dedupKey]; exists {
			continue
		}
		seenRows[dedupKey] = struct{}{}

		stock := getInt("stock")
		dailySales := getFloat("daily_sales")
		maxDailySales := getFloat("max_daily_sales")
		leadTime := getFloat("lead_time")
		maxLeadTime := getFloat("max_lead_time")
		sedangPO := getFloat("sedang_po")
		minOrder := getFloat("min_order")
		harga := getFloat("harga")

		targetDays := 30.0
		if idx, ok := colMap[normalizeColumnName("target_days_cover")]; ok && idx < len(record) {
			raw := strings.TrimSpace(record[idx])
			if raw != "" {
				if parsed := localizedStringToFloat(raw); parsed > 0 {
					targetDays = parsed
				}
			}
		}

		isTop100 := false
		if idx, ok := colMap[normalizeColumnName("is_top_100_sku")]; ok && idx < len(record) {
			if val := strings.TrimSpace(record[idx]); val != "" {
				isTop100 = parseBoolString(val)
			}
		}

		metrics := computeInventoryMetrics(inventoryMetricsInput{
			Stock:         float64(stock),
			DailySales:    dailySales,
			MaxDailySales: maxDailySales,
			LeadTime:      leadTime,
			MaxLeadTime:   maxLeadTime,
			SedangPO:      sedangPO,
			HPP:           hppValue,
			MinOrder:      minOrder,
			TargetDays:    targetDays,
			IsTop100:      isTop100,
		})

		dailyStockCover := metrics.CurrentDaysStockCover

		productSKUs[sku] = struct{}{}
		storeNames[strings.ToLower(storeName)] = storeName
		if brandName != "" {
			brandNames[strings.ToLower(brandName)] = brandName
		}

		salesContribution := dailySales * harga

		rawRows = append(rawRows, rawStockHealthRow{
			storeName:                 storeName,
			sku:                       sku,
			brandName:                 brandName,
			kategoriBrand:             kategoriBrand,
			stock:                     stock,
			dailySales:                dailySales,
			maxDailySales:             maxDailySales,
			dailyStockCover:           dailyStockCover,
			hpp:                       hppValue,
			leadTime:                  int(math.Round(leadTime)),
			maxLeadTime:               int(math.Round(maxLeadTime)),
			minOrder:                  int(math.Round(minOrder)),
			sedangPO:                  int(math.Round(sedangPO)),
			safetyStock:               metrics.SafetyStock,
			reorderPoint:              metrics.ReorderPoint,
			isOpenPO:                  metrics.IsOpenPO,
			initialQtyPO:              metrics.InitialQtyPO,
			emergencyPOQty:            metrics.EmergencyPOQty,
			updatedRegularPOQty:       metrics.UpdatedRegularPOQty,
			finalUpdatedRegularPOQty:  metrics.FinalUpdatedRegularPOQty,
			emergencyPOCost:           metrics.EmergencyPOCost,
			finalUpdatedRegularPOCost: metrics.FinalUpdatedRegularPOCost,
			salesContribution:         salesContribution,
			targetDays:                metrics.TargetDaysCover,
			targetDaysCover:           metrics.QtyForTargetDaysCover,
			currentDaysStockCover:     metrics.CurrentDaysStockCover,
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
	log.Printf("[DEBUG] Building %d stockHealthRecords from rawRows", len(rawRows))
	for i, raw := range rawRows {
		if i < 3 || raw.sku == "51300243348" {
			log.Printf("[DEBUG] RawRow %d - SKU: %s, dailySales: %f, maxDailySales: %f, isOpenPO: %v",
				i, raw.sku, raw.dailySales, raw.maxDailySales, raw.isOpenPO)
		}
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
			snapshotTime:              snapshotTime,
			storeID:                   storeID,
			productID:                 productID,
			brandID:                   brandID,
			sku:                       raw.sku,
			kategoriBrand:             raw.kategoriBrand,
			stock:                     raw.stock,
			dailySales:                raw.dailySales,
			maxDailySales:             raw.maxDailySales,
			dailyStockCover:           raw.dailyStockCover,
			hpp:                       raw.hpp,
			leadTime:                  raw.leadTime,
			maxLeadTime:               raw.maxLeadTime,
			minOrder:                  raw.minOrder,
			sedangPO:                  raw.sedangPO,
			safetyStock:               raw.safetyStock,
			reorderPoint:              raw.reorderPoint,
			isOpenPO:                  raw.isOpenPO,
			initialQtyPO:              raw.initialQtyPO,
			emergencyPOQty:            raw.emergencyPOQty,
			updatedRegularPOQty:       raw.updatedRegularPOQty,
			finalUpdatedRegularPOQty:  raw.finalUpdatedRegularPOQty,
			emergencyPOCost:           raw.emergencyPOCost,
			finalUpdatedRegularPOCost: raw.finalUpdatedRegularPOCost,
			contributionPct:           raw.contributionPct,
			salesContribution:         raw.salesContribution,
			targetDays:                raw.targetDays,
			targetDaysCover:           raw.targetDaysCover,
			currentDaysStockCover:     raw.currentDaysStockCover,
		}

		if i < 3 {
			log.Printf("[DEBUG] StockHealthRecord %d - SKU: %s, dailySales: %f, maxDailySales: %f, hpp: %f",
				i, rec.sku, rec.dailySales, rec.maxDailySales, rec.hpp)
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

	if skippedRows > 0 {
		log.Printf("Successfully processed %d stock health records from %s (%d rows skipped)", len(records), filePath, skippedRows)
	} else {
		log.Printf("Successfully processed %d stock health records from %s", len(records), filePath)
	}
	return nil
}

func computeInventoryMetrics(in inventoryMetricsInput) inventoryMetricsResult {
	result := inventoryMetricsResult{
		TargetDaysCover: int(math.Round(in.TargetDays)),
	}
	if result.TargetDaysCover <= 0 {
		result.TargetDaysCover = 30
	}

	safetyStock := math.Ceil(math.Max(0, (in.MaxDailySales*in.MaxLeadTime)-(in.DailySales*in.LeadTime)))
	result.SafetyStock = int(safetyStock)

	reorderPoint := math.Ceil(math.Max(0, (in.DailySales*in.LeadTime)+safetyStock))
	result.ReorderPoint = int(reorderPoint)

	qtyForTarget := math.Ceil(math.Max(0, in.DailySales*float64(result.TargetDaysCover)))
	result.QtyForTargetDaysCover = int(qtyForTarget)

	if in.DailySales > 0 {
		result.CurrentDaysStockCover = in.Stock / in.DailySales
	} else {
		result.CurrentDaysStockCover = 0
	}

	result.IsOpenPO = result.CurrentDaysStockCover < float64(result.TargetDaysCover) &&
		in.Stock <= float64(result.ReorderPoint)

	initialQty := 0.0
	if in.DailySales > 0 {
		initialQty = qtyForTarget - in.Stock - in.SedangPO
	}

	if result.IsOpenPO {
		result.InitialQtyPO = int(math.Max(0, math.Ceil(initialQty)))
	} else {
		result.InitialQtyPO = 0
	}

	result.UpdatedRegularPOQty = result.InitialQtyPO

	if in.IsTop100 {
		emergencyQty := (in.MaxLeadTime - result.CurrentDaysStockCover) * in.DailySales
		if in.SedangPO > 0 {
			result.EmergencyPOQty = int(math.Max(0, emergencyQty))
		} else {
			result.EmergencyPOQty = int(math.Max(0, math.Ceil(emergencyQty)))
		}
	} else {
		result.EmergencyPOQty = 0
	}

	minOrder := int(math.Ceil(math.Max(0, in.MinOrder)))
	if minOrder == 0 {
		minOrder = int(math.Max(0, math.Round(in.MinOrder)))
	}
	result.FinalUpdatedRegularPOQty = result.UpdatedRegularPOQty
	if result.UpdatedRegularPOQty > 0 && minOrder > 0 && result.UpdatedRegularPOQty < minOrder {
		result.FinalUpdatedRegularPOQty = minOrder
	}

	result.EmergencyPOCost = float64(result.EmergencyPOQty) * in.HPP
	result.FinalUpdatedRegularPOCost = float64(result.FinalUpdatedRegularPOQty) * in.HPP

	return result
}
