package stock_health

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
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

	supplierIndex map[supplierKey]SupplierData

	storageClient storage.ObjectStorage
	cloudLayout   *pipeline.CloudLayout
	tempDir       string
}

func rawKey(l *pipeline.CloudLayout, date time.Time, fileName string) string {
	parts := append([]string{"raw"}, l.DateParts(date)...)
	parts = append(parts, fileName)
	return l.Path(parts...)
}

func intermediateKey(l *pipeline.CloudLayout, stage string, date time.Time, fileName string) string {
	parts := append([]string{"intermediate", stage}, l.DateParts(date)...)
	parts = append(parts, fileName)
	return l.Path(parts...)
}

func outputKey(l *pipeline.CloudLayout, date time.Time, fileName string) string {
	parts := append([]string{"output"}, l.DateParts(date)...)
	parts = append(parts, fileName)
	return l.Path(parts...)
}

// NewStockHealthPipeline creates a new stock health pipeline instance.
func NewStockHealthPipeline(cfg Config) (*StockHealthPipeline, error) {
	if cfg.IntermediateDir == "" {
		cfg.IntermediateDir = filepath.Join("data", "intermediate", "stock_health")
	}
	if cfg.OutputDir == "" {
		cfg.OutputDir = filepath.Join("data", "seeds", "stock_health")
	}
	if cfg.Top100SKUDir == "" {
		cfg.Top100SKUDir = filepath.Join("data", "pipeline", "stock_health", "top_100_sku")
	}

	top100ByStore := loadTop100SKUsByStore(cfg.Top100SKUDir, cfg.InputDateFormat)
	p := &StockHealthPipeline{
		config:        cfg,
		calculator:    NewInventoryCalculator(cfg.SpecialSKUs, top100ByStore),
		supplierIndex: make(map[supplierKey]SupplierData),
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

	if cfg.CloudStorageEnabled {
		client, err := storage.NewS3Client(storage.Config{
			Endpoint:  cfg.CloudEndpoint,
			AccessKey: cfg.CloudAccessKey,
			SecretKey: cfg.CloudSecretKey,
			Bucket:    cfg.CloudBucket,
			Region:    cfg.CloudRegion,
			UseSSL:    cfg.CloudUseSSL,
			Prefix:    strings.Trim(cfg.CloudPrefix, "/"),
		})
		if err != nil {
			return nil, fmt.Errorf("failed to initialize cloud storage client: %w", err)
		}
		tempDir, err := os.MkdirTemp("", "stock-health-cloud")
		if err != nil {
			return nil, fmt.Errorf("failed to create temp dir for cloud downloads: %w", err)
		}
		p.storageClient = client
		p.cloudLayout = pipeline.NewCloudLayout(p.Name())
		p.tempDir = tempDir
	}

	return p, nil
}

func (p *StockHealthPipeline) ensureTempDir() error {
	if p.tempDir != "" {
		return nil
	}
	dir, err := os.MkdirTemp("", "stock-health-pipeline")
	if err != nil {
		return err
	}
	p.tempDir = dir
	return nil
}

func (p *StockHealthPipeline) UploadRawFile(ctx context.Context, snapshotDate time.Time, localPath string) (string, error) {
	if p.storageClient == nil || p.cloudLayout == nil {
		return localPath, nil
	}
	data, err := os.ReadFile(localPath)
	if err != nil {
		return "", fmt.Errorf("failed to read %s for upload: %w", localPath, err)
	}
	key := rawKey(p.cloudLayout, snapshotDate, filepath.Base(localPath))
	if err := p.storageClient.UploadObject(ctx, key, data); err != nil {
		return "", fmt.Errorf("failed to upload raw file %s: %w", key, err)
	}
	return key, nil
}

func (p *StockHealthPipeline) FetchInputFile(ctx context.Context, remotePath string) (string, func(), error) {
	if p.storageClient == nil {
		return remotePath, nil, nil
	}
	if err := p.ensureTempDir(); err != nil {
		return "", nil, err
	}
	localPath := filepath.Join(p.tempDir, fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(remotePath)))
	if err := p.storageClient.DownloadObject(ctx, remotePath, localPath); err != nil {
		return "", nil, fmt.Errorf("failed to download %s: %w", remotePath, err)
	}
	cleanup := func() {
		_ = os.Remove(localPath)
	}
	return localPath, cleanup, nil
}

func (p *StockHealthPipeline) UploadAggregatedOutput(ctx context.Context, snapshotDate time.Time, localPath string) error {
	if p.storageClient == nil || p.cloudLayout == nil {
		return nil
	}
	data, err := os.ReadFile(localPath)
	if err != nil {
		return fmt.Errorf("failed to read aggregated output %s: %w", localPath, err)
	}
	key := outputKey(p.cloudLayout, snapshotDate, filepath.Base(localPath))
	if err := p.storageClient.UploadObject(ctx, key, data); err != nil {
		return fmt.Errorf("failed to upload aggregated output %s: %w", key, err)
	}

	// Also generate and upload M2 and Emergency formats
	if err := p.generateAndUploadM2Format(ctx, snapshotDate, localPath); err != nil {
		log.Printf("Warning: failed to generate M2 format: %v", err)
	}
	if err := p.generateAndUploadEmergencyFormat(ctx, snapshotDate, localPath); err != nil {
		log.Printf("Warning: failed to generate Emergency format: %v", err)
	}

	return nil
}

var _ pipeline.CloudPipeline = (*StockHealthPipeline)(nil)

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
	cleanedRows, header, err := p.ReadAndCleanCSV(inputFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read/clean file %s: %w", inputFile, err)
	}

	if p.config.PersistDebugLayers {
		log.Printf("[DEBUG PIPELINE] File: %s, Read %d rows", filepath.Base(inputFile), len(cleanedRows))
		if len(cleanedRows) > 0 {
			log.Printf("[DEBUG PIPELINE] First row - SKU: %s, DailySales: %f, MaxDailySales: %f, HPP: %f",
				cleanedRows[0].SKU, cleanedRows[0].DailySales, cleanedRows[0].MaxDailySales, cleanedRows[0].HPP)
		}
	}

	if p.config.PersistDebugLayers {
		if err := p.writeIntermediateCSV(snapshotDate, "1_cleaned_base", inputFile, header, cleanedRows); err != nil {
			return nil, fmt.Errorf("failed to write cleaned_base intermediate: %w", err)
		}
	}

	// 3) Merge with supplier data / contributions
	mergedRows := cleanedRows
	// Skip uploading 2_cleaned_merged to cloud storage (only write locally if enabled)
	if p.config.IntermediateDir != "" && p.storageClient == nil {
		if err := p.writeIntermediateCSV(snapshotDate, "2_cleaned_merged", inputFile, header, mergedRows); err != nil {
			return nil, fmt.Errorf("failed to write cleaned_merged intermediate: %w", err)
		}
	}

	// 4) Apply inventory metrics
	transformed := make([]TransformedStockRow, 0, len(mergedRows))
	for _, raw := range mergedRows {
		// Use each store's original daily sales and max daily sales directly
		metrics := p.calculator.Calculate(&raw)

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
			DailySales:    raw.DailySales,
			MaxDailySales: raw.MaxDailySales,
			LeadTime:      raw.LeadTime,
			MaxLeadTime:   raw.MaxLeadTime,
			SedangPO:      raw.SedangPO,
			MinOrder:      raw.MinOrder,
			Metrics:       metrics,
			// supplier info
			SupplierStore: supplierStore,
			SupplierName:  supplierName,
			SupplierPhone: supplierPhone,
		}
		transformed = append(transformed, row)
	}

	if err := p.writeMetricsIntermediate(snapshotDate, inputFile, transformed); err != nil {
		return nil, fmt.Errorf("failed to write metrics intermediate: %w", err)
	}

	// 5) Map to generic TransformedRow format expected by StreamingAggregator/analytics
	result := make([]pipeline.TransformedRow, 0, len(transformed))
	if p.config.PersistDebugLayers {
		log.Printf("[DEBUG PIPELINE] Mapping %d transformed rows to TransformedRow format", len(transformed))
		if len(transformed) > 0 {
			log.Printf("[DEBUG PIPELINE] First transformed row - SKU: %s, DailySales: %f, MaxDailySales: %f, HPP: %f",
				transformed[0].SKU, transformed[0].DailySales, transformed[0].MaxDailySales, transformed[0].HPP)
		}
	}

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
