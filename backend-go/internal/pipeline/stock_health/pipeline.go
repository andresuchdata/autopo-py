package stock_health

import (
	"context"
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
)

// padangSales holds Padang's per-SKU daily and max daily sales for a snapshot date.
type padangSales struct {
	Daily float64
	Max   float64
}

// supplierKey is used to index supplier data by normalized store and brand.
type supplierKey struct {
	Store string
	Brand string
}

// StockHealthPipeline implements the generic pipeline.Pipeline interface for stock health files.
type StockHealthPipeline struct {
	config     Config
	calculator *InventoryCalculator

	padangSalesCache   map[string]map[string]padangSales // dateKey -> SKU -> Padang sales
	padangSalesCacheMu sync.Mutex

	supplierIndex map[supplierKey]SupplierData
}

// NewStockHealthPipeline creates a new stock health pipeline instance.
func NewStockHealthPipeline(cfg Config) *StockHealthPipeline {
	if cfg.IntermediateDir == "" {
		cfg.IntermediateDir = filepath.Join("data", "intermediate", "stock_health")
	}
	if cfg.OutputDir == "" {
		cfg.OutputDir = filepath.Join("data", "seeds", "stock_health")
	}
	p := &StockHealthPipeline{
		config:           cfg,
		calculator:       NewInventoryCalculator(cfg.SpecialSKUs),
		padangSalesCache: make(map[string]map[string]padangSales),
		supplierIndex:    make(map[supplierKey]SupplierData),
	}
	// Build supplier index if supplier data is provided.
	for _, s := range cfg.SupplierData {
		key := supplierKey{
			Store: normalizeStoreNameForSupplier(s.NamaStore),
			Brand: strings.ToUpper(strings.TrimSpace(s.Brand)),
		}
		if key.Store == "" || key.Brand == "" {
			continue
		}
		p.supplierIndex[key] = s
	}
	return p
}

// Name returns the unique identifier of this pipeline.
func (p *StockHealthPipeline) Name() string {
	return "stock_health"
}

// GetOutputTable returns the target database table for analytics ingestion.
func (p *StockHealthPipeline) GetOutputTable() string {
	return "daily_stock_data"
}

// GetSnapshotDate extracts the snapshot date from the filename using the configured format.
func (p *StockHealthPipeline) GetSnapshotDate(filename string) (time.Time, error) {
	base := filepath.Base(filename)
	base = strings.TrimSuffix(base, filepath.Ext(base))

	// Expect date at the beginning of the filename using InputDateFormat
	if p.config.InputDateFormat == "" {
		// Fallback to YYYYMMDD
		p.config.InputDateFormat = "20060102"
	}

	layout := p.config.InputDateFormat
	if len(base) < len(layout) {
		return time.Time{}, fmt.Errorf("filename %s does not contain date with layout %s", filename, layout)
	}

	return time.Parse(layout, base[:len(layout)])
}

// Validate performs basic validation on the input file.
func (p *StockHealthPipeline) Validate(inputFile string) error {
	info, err := os.Stat(inputFile)
	if err != nil {
		return fmt.Errorf("cannot stat input file %s: %w", inputFile, err)
	}
	if info.IsDir() {
		return fmt.Errorf("input path %s is a directory, expected file", inputFile)
	}
	ext := strings.ToLower(filepath.Ext(inputFile))
	if ext != ".csv" {
		return fmt.Errorf("unsupported file extension %s for %s (only CSV supported for now)", ext, inputFile)
	}
	return nil
}

// Transform processes a single input file and returns transformed rows in a generic format.
func (p *StockHealthPipeline) Transform(ctx context.Context, inputFile string) ([]pipeline.TransformedRow, error) {
	// 1) Parse snapshot date from filename
	snapshotDate, err := p.GetSnapshotDate(inputFile)
	if err != nil {
		return nil, fmt.Errorf("failed to parse snapshot date: %w", err)
	}

	// 2) Read and clean raw rows
	cleanedRows, header, err := p.readAndCleanCSV(inputFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read/clean file %s: %w", inputFile, err)
	}

	if p.config.PersistDebugLayers {
		if err := p.writeIntermediateCSV(snapshotDate, "1_cleaned_base", inputFile, header, cleanedRows); err != nil {
			return nil, fmt.Errorf("failed to write cleaned_base intermediate: %w", err)
		}
	}

	// 3) Merge with supplier data / contributions
	mergedRows := cleanedRows
	if err := p.writeIntermediateCSV(snapshotDate, "2_cleaned_merged", inputFile, header, mergedRows); err != nil {
		return nil, fmt.Errorf("failed to write cleaned_merged intermediate: %w", err)
	}

	// 4) Apply inventory metrics
	transformed := make([]TransformedStockRow, 0, len(mergedRows))
	padangSalesBySKU := p.getPadangSalesForDate(snapshotDate)
	for _, raw := range mergedRows {
		// Default: use store's original per-store sales
		finalDaily := raw.OrigDailySales
		finalMax := raw.OrigMaxDailySales
		isInPadang := 0

		// If SKU exists in Padang, scale Padang's per-SKU sales by contribution percentage
		if padangSalesBySKU != nil {
			if ps, ok := padangSalesBySKU[raw.SKU]; ok {
				isInPadang = 1
				factor := raw.Contribution / 100.0
				finalDaily = ps.Daily * factor
				finalMax = ps.Max * factor
			}
		}

		// Use adjusted sales when computing inventory metrics
		adj := raw
		adj.DailySales = finalDaily
		adj.MaxDailySales = finalMax
		metrics := p.calculator.Calculate(&adj)

		// Enrich with supplier data if available
		var supplierStore, supplierName, supplierPhone string
		if len(p.supplierIndex) > 0 {
			key := supplierKey{
				Store: normalizeStoreNameForSupplier(raw.Toko),
				Brand: strings.ToUpper(strings.TrimSpace(raw.Brand)),
			}
			if s, ok := p.supplierIndex[key]; ok {
				supplierStore = s.NamaStore
				supplierName = s.NamaSupplier
				supplierPhone = s.NoHP
			}
		}

		row := TransformedStockRow{
			Brand:         raw.Brand,
			SKU:           raw.SKU,
			Nama:          raw.Nama,
			Toko:          raw.Toko,
			Stock:         raw.Stock,
			HPP:           raw.HPP,
			Harga:         raw.Harga,
			DailySales:    finalDaily,
			MaxDailySales: finalMax,
			LeadTime:      raw.LeadTime,
			MaxLeadTime:   raw.MaxLeadTime,
			SedangPO:      raw.SedangPO,
			MinOrder:      raw.MinOrder,
			Contribution:  raw.Contribution,
			Metrics:       metrics,
			// supplier info
			SupplierStore: supplierStore,
			SupplierName:  supplierName,
			SupplierPhone: supplierPhone,
			// carry through original per-store sales; IsInPadang derived from Padang reference
			OrigDailySales:    raw.OrigDailySales,
			OrigMaxDailySales: raw.OrigMaxDailySales,
			IsInPadang:        isInPadang,
		}
		transformed = append(transformed, row)
	}

	if err := p.writeMetricsIntermediate(snapshotDate, inputFile, transformed); err != nil {
		return nil, fmt.Errorf("failed to write metrics intermediate: %w", err)
	}

	// 5) Map to generic TransformedRow format expected by StreamingAggregator/analytics
	result := make([]pipeline.TransformedRow, 0, len(transformed))
	for _, row := range transformed {
		data := map[string]interface{}{
			"date":                          snapshotDate.Format("2006-01-02"),
			"brand":                         row.Brand,
			"sku":                           row.SKU,
			"nama":                          row.Nama,
			"store":                         row.Toko,
			"stock":                         row.Stock,
			"daily_sales":                   row.DailySales,
			"max_daily_sales":               row.MaxDailySales,
			"lead_time":                     row.LeadTime,
			"max_lead_time":                 row.MaxLeadTime,
			"sedang_po":                     row.SedangPO,
			"hpp":                           row.HPP,
			"harga":                         row.Harga,
			"min_order":                     row.MinOrder,
			"contribution_pct":              row.Contribution,
			"supplier_store":                row.SupplierStore,
			"supplier_name":                 row.SupplierName,
			"supplier_phone":                row.SupplierPhone,
			"safety_stock":                  row.Metrics.SafetyStock,
			"reorder_point":                 row.Metrics.ReorderPoint,
			"target_days_cover":             row.Metrics.TargetDaysCover,
			"qty_for_target_days_cover":     row.Metrics.QtyForTargetDaysCover,
			"current_days_stock_cover":      row.Metrics.CurrentDaysStockCover,
			"is_open_po":                    row.Metrics.IsOpenPO,
			"initial_qty_po":                row.Metrics.InitialQtyPO,
			"emergency_po_qty":              row.Metrics.EmergencyPOQty,
			"updated_regular_po_qty":        row.Metrics.UpdatedRegularPOQty,
			"final_updated_regular_po_qty":  row.Metrics.FinalUpdatedRegularPOQty,
			"emergency_po_cost":             row.Metrics.EmergencyPOCost,
			"final_updated_regular_po_cost": row.Metrics.FinalUpdatedRegularPOCost,
		}
		result = append(result, pipeline.TransformedRow{Data: data})
	}

	return result, nil
}

// getStoreNameFromFilename extracts a normalized store name from the filename.
// It mirrors the notebook's get_store_name_from_filename, but also strips the
// leading snapshot date prefix (e.g. 20251201_) that the Drive watcher adds.
func (p *StockHealthPipeline) getStoreNameFromFilename(path string) string {
	base := filepath.Base(path)
	name := strings.TrimSuffix(base, filepath.Ext(base))

	// Strip leading date prefix if it matches the configured layout followed by '_'
	layout := p.config.InputDateFormat
	if layout == "" {
		layout = "20060102"
	}
	if len(name) > len(layout)+1 && name[len(layout)] == '_' {
		if _, err := time.Parse(layout, name[:len(layout)]); err == nil {
			name = name[len(layout)+1:]
		}
	}

	parts := strings.Fields(name)
	if len(parts) >= 3 && strings.EqualFold(parts[1], "miss") && strings.EqualFold(parts[2], "glam") {
		// e.g. "002 Miss Glam Pekanbaru" -> "PEKANBARU"
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[3:], " ")))
	}
	if len(parts) >= 2 && strings.EqualFold(parts[0], "miss") && strings.EqualFold(parts[1], "glam") {
		// e.g. "Miss Glam Padang" -> "PADANG"
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[2:], " ")))
	}
	if len(parts) > 1 {
		// Fallback: drop the first token (often a sequence number)
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[1:], " ")))
	}
	if len(parts) == 1 {
		return strings.ToUpper(strings.TrimSpace(parts[0]))
	}
	return ""
}

// getContributionPct looks up the contribution percentage for a store using
// the configured StoreContributions map, defaulting to 100 when not found.
func (p *StockHealthPipeline) getContributionPct(storeName string) float64 {
	if p.config.StoreContributions == nil {
		return 100
	}
	key := strings.ToUpper(strings.TrimSpace(storeName))
	if key == "" {
		return 100
	}
	if v, ok := p.config.StoreContributions[key]; ok {
		return v
	}

	return 100
}

// readAndCleanCSV reads a CSV file into RawStockRow slice.
// For now this assumes the CSV already matches the RawStockRow fields.
func (p *StockHealthPipeline) readAndCleanCSV(path string) ([]RawStockRow, []string, error) {
	// Derive store name and contribution from the filename, matching notebook logic
	storeName := p.getStoreNameFromFilename(path)
	contributionPct := p.getContributionPct(storeName)

	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true

	header, err := reader.Read()
	if err != nil {
		return nil, nil, err
	}

	colIndex := func(names ...string) int {
		if len(names) == 0 {
			return -1
		}
		targets := make(map[string]struct{}, len(names))
		for _, name := range names {
			targets[normalizeColumnName(name)] = struct{}{}
		}
		for i, h := range header {
			if _, ok := targets[normalizeColumnName(h)]; ok {
				return i
			}
		}
		return -1
	}

	idxBrand := colIndex("brand")
	idxSKU := colIndex("sku")
	idxNama := colIndex("nama", "product name")
	idxToko := colIndex("store", "toko", "nama store")
	idxStock := colIndex("stock", "stok")
	idxDailySales := colIndex("daily_sales", "daily sales")
	idxMaxDailySales := colIndex("max_daily_sales", "max. daily sales", "max daily sales")
	idxLeadTime := colIndex("lead_time", "lead time")
	idxMaxLeadTime := colIndex("max_lead_time", "max. lead time", "max lead time")
	idxSedangPO := colIndex("sedang_po", "sedang po")
	idxHPP := colIndex("hpp")
	idxHarga := colIndex("harga")
	idxMinOrder := colIndex("min_order", "min. order", "min order")

	rows := make([]RawStockRow, 0)
	for {
		record, err := reader.Read()
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return nil, nil, err
		}

		get := func(idx int) string {
			if idx < 0 || idx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[idx])
		}

		parseFloat := func(idx int) float64 {
			if idx < 0 || idx >= len(record) {
				return 0
			}
			v := strings.TrimSpace(record[idx])
			if v == "" {
				return 0
			}
			v = strings.ReplaceAll(v, ",", "")
			f, _ := strconv.ParseFloat(v, 64)
			return f
		}

		// parse once so we can keep both scaled and original values if needed later
		parsedDaily := parseFloat(idxDailySales)
		parsedMaxDaily := parseFloat(idxMaxDailySales)

		row := RawStockRow{
			Brand:             get(idxBrand),
			SKU:               get(idxSKU),
			Nama:              get(idxNama),
			Toko:              get(idxToko),
			Stock:             parseFloat(idxStock),
			DailySales:        parsedDaily,
			MaxDailySales:     parsedMaxDaily,
			LeadTime:          parseFloat(idxLeadTime),
			MaxLeadTime:       parseFloat(idxMaxLeadTime),
			SedangPO:          parseFloat(idxSedangPO),
			HPP:               parseFloat(idxHPP),
			Harga:             parseFloat(idxHarga),
			MinOrder:          parseFloat(idxMinOrder),
			Contribution:      contributionPct,
			OrigDailySales:    parsedDaily,
			OrigMaxDailySales: parsedMaxDaily,
		}

		rows = append(rows, row)
	}

	return rows, header, nil
}

// getPadangSKUsForDate returns the set of SKUs that appear in Padang's store file
// for the given snapshot date. It caches results per date key to avoid repeated IO.
func (p *StockHealthPipeline) getPadangSalesForDate(date time.Time) map[string]padangSales {
	if p.config.DownloadDir == "" || p.config.PadangStoreName == "" {
		return nil
	}

	// Use the input date layout to derive the date prefix used in filenames
	layout := p.config.InputDateFormat
	if layout == "" {
		layout = "20060102"
	}
	datePrefix := date.Format(layout)

	key := datePrefix
	p.padangSalesCacheMu.Lock()
	defer p.padangSalesCacheMu.Unlock()
	if skus, ok := p.padangSalesCache[key]; ok {
		return skus
	}

	// Look for Padang store raw files for this date
	pattern := filepath.Join(p.config.DownloadDir, datePrefix+"_*Padang*.csv")
	files, err := filepath.Glob(pattern)
	if err != nil || len(files) == 0 {
		// No Padang file found; cache empty map to avoid re-scanning
		p.padangSalesCache[key] = map[string]padangSales{}
		return p.padangSalesCache[key]
	}

	set := make(map[string]padangSales)
	for _, path := range files {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		reader := csv.NewReader(f)
		reader.TrimLeadingSpace = true
		header, err := reader.Read()
		if err != nil {
			f.Close()
			continue
		}

		// Find relevant columns
		skuIdx, dailyIdx, maxIdx := -1, -1, -1
		for i, h := range header {
			name := normalizeColumnName(h)
			switch name {
			case "sku":
				skuIdx = i
			case "dailysales":
				dailyIdx = i
			case "maxdailysales":
				maxIdx = i
			}
		}
		if skuIdx == -1 {
			f.Close()
			continue
		}

		for {
			record, err := reader.Read()
			if err != nil {
				break
			}
			if skuIdx >= len(record) {
				continue
			}
			sku := strings.TrimSpace(record[skuIdx])
			if sku == "" {
				continue
			}

			parse := func(idx int) float64 {
				if idx < 0 || idx >= len(record) {
					return 0
				}
				v := strings.TrimSpace(record[idx])
				if v == "" {
					return 0
				}
				v = strings.ReplaceAll(v, ",", "")
				f, _ := strconv.ParseFloat(v, 64)
				return f
			}

			set[sku] = padangSales{
				Daily: parse(dailyIdx),
				Max:   parse(maxIdx),
			}
		}
		f.Close()
	}

	p.padangSalesCache[key] = set
	return set
}

var columnNameSanitizer = strings.NewReplacer(" ", "", "_", "", ".", "", "-", "", "/", "")

func normalizeColumnName(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	return columnNameSanitizer.Replace(name)
}

// normalizeStoreNameForSupplier normalizes store names from both stock files
// and supplier master so they can be joined reliably.
func normalizeStoreNameForSupplier(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	// Reuse getStoreNameFromFilename-style normalization where possible by
	// uppercasing and trimming common prefixes like "Miss Glam".
	upper := strings.ToUpper(name)
	parts := strings.Fields(upper)
	if len(parts) >= 3 && parts[0] == "MISS" && parts[1] == "GLAM" {
		return strings.TrimSpace(strings.Join(parts[2:], " "))
	}
	return strings.TrimSpace(upper)
}

func (p *StockHealthPipeline) writeIntermediateCSV(date time.Time, stage string, inputFile string, header []string, rows []RawStockRow) error {
	if p.config.IntermediateDir == "" {
		return nil
	}

	baseDir := filepath.Join(p.config.IntermediateDir, stage, date.Format("20060102"))
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return err
	}

	fileName := filepath.Base(inputFile)
	path := filepath.Join(baseDir, fileName)

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	if err := w.Write(header); err != nil {
		return err
	}

	for _, r := range rows {
		record := make([]string, len(header))
		for i, h := range header {
			switch strings.ToLower(strings.TrimSpace(h)) {
			case "brand":
				record[i] = r.Brand
			case "sku":
				record[i] = r.SKU
			case "nama":
				record[i] = r.Nama
			case "store":
				record[i] = r.Toko
			case "stock":
				record[i] = fmt.Sprintf("%v", r.Stock)
			case "daily_sales":
				record[i] = fmt.Sprintf("%v", r.DailySales)
			case "max_daily_sales":
				record[i] = fmt.Sprintf("%v", r.MaxDailySales)
			case "lead_time":
				record[i] = fmt.Sprintf("%v", r.LeadTime)
			case "max_lead_time":
				record[i] = fmt.Sprintf("%v", r.MaxLeadTime)
			case "sedang_po":
				record[i] = fmt.Sprintf("%v", r.SedangPO)
			case "hpp":
				record[i] = fmt.Sprintf("%v", r.HPP)
			case "harga":
				record[i] = fmt.Sprintf("%v", r.Harga)
			case "min_order":
				record[i] = fmt.Sprintf("%v", r.MinOrder)
			case "contribution_pct":
				record[i] = fmt.Sprintf("%v", r.Contribution)
			}
		}
		if err := w.Write(record); err != nil {
			return err
		}
	}

	return nil
}

func (p *StockHealthPipeline) writeMetricsIntermediate(date time.Time, inputFile string, rows []TransformedStockRow) error {
	if p.config.IntermediateDir == "" {
		return nil
	}

	baseDir := filepath.Join(p.config.IntermediateDir, "3_with_metrics", date.Format("20060102"))
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return err
	}

	fileName := filepath.Base(inputFile)
	path := filepath.Join(baseDir, fileName)

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	headers := []string{
		"date",
		"brand",
		"sku",
		"nama",
		"store",
		"stock",
		"daily_sales",
		"max_daily_sales",
		"lead_time",
		"max_lead_time",
		"sedang_po",
		"hpp",
		"harga",
		"min_order",
		"contribution_pct",
		"sales_contribution",
		"is_in_padang",
		"orig_daily_sales",
		"orig_max_daily_sales",
		"safety_stock",
		"reorder_point",
		"target_days_cover",
		"qty_for_target_days_cover",
		"current_days_stock_cover",
		"is_open_po",
		"initial_qty_po",
		"emergency_po_qty",
		"updated_regular_po_qty",
		"final_updated_regular_po_qty",
		"emergency_po_cost",
		"final_updated_regular_po_cost",
		"supplier_store",
		"supplier_name",
		"supplier_phone",
	}

	if err := w.Write(headers); err != nil {
		return err
	}

	for _, r := range rows {
		salesContribution := r.DailySales * r.Harga
		rec := []string{
			date.Format("2006-01-02"),
			r.Brand,
			r.SKU,
			r.Nama,
			r.Toko,
			fmt.Sprintf("%v", r.Stock),
			formatIDFloat(r.DailySales, 2),
			formatIDFloat(r.MaxDailySales, 2),
			fmt.Sprintf("%v", r.LeadTime),
			fmt.Sprintf("%v", r.MaxLeadTime),
			fmt.Sprintf("%v", r.SedangPO),
			fmt.Sprintf("%v", r.HPP),
			fmt.Sprintf("%v", r.Harga),
			fmt.Sprintf("%v", r.MinOrder),
			fmt.Sprintf("%v", r.Contribution),
			formatIDFloat(salesContribution, 2),
			fmt.Sprintf("%v", r.IsInPadang),
			formatIDFloat(r.OrigDailySales, 2),
			formatIDFloat(r.OrigMaxDailySales, 2),
			fmt.Sprintf("%v", r.Metrics.SafetyStock),
			fmt.Sprintf("%v", r.Metrics.ReorderPoint),
			fmt.Sprintf("%v", r.Metrics.TargetDaysCover),
			fmt.Sprintf("%v", r.Metrics.QtyForTargetDaysCover),
			formatIDFloat(r.Metrics.CurrentDaysStockCover, 2),
			fmt.Sprintf("%v", r.Metrics.IsOpenPO),
			fmt.Sprintf("%v", r.Metrics.InitialQtyPO),
			fmt.Sprintf("%v", r.Metrics.EmergencyPOQty),
			fmt.Sprintf("%v", r.Metrics.UpdatedRegularPOQty),
			fmt.Sprintf("%v", r.Metrics.FinalUpdatedRegularPOQty),
			formatIDFloat(r.Metrics.EmergencyPOCost, 2),
			formatIDFloat(r.Metrics.FinalUpdatedRegularPOCost, 2),
			r.SupplierStore,
			r.SupplierName,
			r.SupplierPhone,
		}
		if err := w.Write(rec); err != nil {
			return err
		}
	}

	return nil
}
