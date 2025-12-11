package drive

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
)

type IngestService struct {
	driveService *Service
	repo         *repository.IngestRepository
}

func NewIngestService(driveService *Service, repo *repository.IngestRepository) *IngestService {
	return &IngestService{
		driveService: driveService,
		repo:         repo,
	}
}

func (s *IngestService) IngestFile(ctx context.Context, fileID string) error {
	// 1. Download file from Drive
	pr, pw := io.Pipe()
	go func() {
		err := s.driveService.DownloadFile(fileID, pw)
		pw.CloseWithError(err)
	}()

	// 2. Parse CSV
	reader := csv.NewReader(pr)

	// Read header
	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read CSV header: %w", err)
	}

	// Map header to indices
	colMap := make(map[string]int)
	for i, col := range header {
		colMap[strings.TrimSpace(col)] = i
	}

	// Validate required columns (basic check)
	requiredCols := []string{"brand", "sku", "Nama", "store", "Daily Sales"}
	for _, col := range requiredCols {
		if _, ok := colMap[col]; !ok {
			return fmt.Errorf("missing required column: %s", col)
		}
	}

	// 3. Process rows
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to read CSV record: %w", err)
		}

		if err := s.processRow(ctx, record, colMap); err != nil {
			// Log error but continue? Or fail fast?
			// For now, let's log and continue or return error.
			// Returning error ensures data integrity for the file.
			return fmt.Errorf("failed to process row: %w", err)
		}
	}

	return nil
}

func (s *IngestService) processRow(ctx context.Context, record []string, colMap map[string]int) error {
	getValue := func(colName string) string {
		if idx, ok := colMap[colName]; ok && idx < len(record) {
			return strings.TrimSpace(record[idx])
		}
		return ""
	}

	getFloat := func(colName string) float64 {
		val := getValue(colName)
		if val == "" {
			return 0
		}
		f, _ := strconv.ParseFloat(val, 64)
		return f
	}

	getInt := func(colName string) int {
		val := getValue(colName)
		if val == "" {
			return 0
		}
		// Handle float strings like "1.0"
		f, _ := strconv.ParseFloat(val, 64)
		return int(f)
	}

	getBool := func(colName string) bool {
		val := getValue(colName)
		return val == "1" || strings.ToLower(val) == "true"
	}

	// 1. Upsert Brand
	brandName := getValue("brand")     // "ACNAWAY"
	brandIDStr := getValue("ID Brand") // "20"
	// If ID Brand is missing, use brandName as fallback or generate one?
	// The CSV sample shows "ID Brand" column.

	brand := &domain.Brand{
		Name:       brandName,
		OriginalID: brandIDStr,
	}
	// If OriginalID is empty, maybe use Name?
	if brand.OriginalID == "" {
		brand.OriginalID = brandName // Fallback
	}

	dbBrandID, err := s.repo.UpsertBrand(ctx, brand)
	if err != nil {
		return fmt.Errorf("upsert brand: %w", err)
	}

	// 2. Upsert Supplier
	supplierName := getValue("Nama Supplier")
	supplierIDStr := getValue("ID Supplier")

	supplier := &domain.Supplier{
		Name:        supplierName,
		OriginalID:  supplierIDStr,
		MinPurchase: getFloat("Min. Purchase"),
		TradingTerm: getValue("Trading Term"),
		PromoFactor: getValue("Promo Factor"),
		DelayFactor: getValue("Delay Factor"),
	}
	if supplier.OriginalID == "" {
		supplier.OriginalID = supplierName // Fallback
	}

	dbSupplierID, err := s.repo.UpsertSupplier(ctx, supplier)
	if err != nil {
		return fmt.Errorf("upsert supplier: %w", err)
	}

	// 3. Upsert Store
	storeName := getValue("store")     // "Miss Glam Palembang"
	storeIDStr := getValue("ID Store") // "Miss Glam Palembang" (in sample it seems same as name or empty?)
	// Sample: "ID Store" -> "Miss Glam Palembang"

	store := &domain.Store{
		Name:       storeName,
		OriginalID: storeIDStr,
	}
	if store.OriginalID == "" {
		store.OriginalID = storeName
	}

	dbStoreID, err := s.repo.UpsertStore(ctx, store)
	if err != nil {
		return fmt.Errorf("upsert store: %w", err)
	}

	// 4. Upsert Product
	skuCode := getValue("sku")
	productName := getValue("Nama")

	product := &domain.Product{
		SKUCode:    skuCode,
		Name:       productName,
		BrandID:    dbBrandID,
		SupplierID: dbSupplierID,
		HPP:        getFloat("hpp"),
		Price:      getFloat("harga"),
	}

	dbProductID, err := s.repo.UpsertProduct(ctx, product)
	if err != nil {
		return fmt.Errorf("upsert product: %w", err)
	}

	// 5. Insert Daily Stock Data
	// Date handling: The user said "daily stock data (scope is sku, brand, store, date / captured date)".
	// The CSV doesn't seem to have a "Date" column in the sample provided.
	// We might need to use current date or pass it as a parameter.
	// For now, let's use current date (truncated to day).
	date := time.Now().Truncate(24 * time.Hour)

	dailyData := &domain.DailyStockData{
		Date:                      date,
		StoreID:                   dbStoreID,
		ProductID:                 dbProductID,
		KategoriBrand:             getValue("Kategori Brand"),
		Stock:                     getInt("stock"),
		DailySales:                getFloat("Daily Sales"),
		MaxDailySales:             getFloat("Max. Daily Sales"),
		OrigDailySales:            getFloat("Orig Daily Sales"),
		OrigMaxDailySales:         getFloat("Orig Max. Daily Sales"),
		LeadTime:                  getInt("Lead Time"),
		MaxLeadTime:               getInt("Max. Lead Time"),
		MinOrder:                  getInt("Min. Order"),
		IsInPadang:                getBool("Is in Padang"),
		SafetyStock:               getInt("Safety stock"),
		ReorderPoint:              getInt("Reorder point"),
		SedangPO:                  getInt("Sedang PO"),
		IsOpenPO:                  getBool("is_open_po"),
		InitialQtyPO:              getInt("initial_qty_po"),
		EmergencyPOQty:            getInt("emergency_po_qty"),
		UpdatedRegularPOQty:       getInt("updated_regular_po_qty"),
		FinalUpdatedRegularPOQty:  getInt("final_updated_regular_po_qty"),
		EmergencyPOCost:           getFloat("emergency_po_cost"),
		FinalUpdatedRegularPOCost: getFloat("final_updated_regular_po_cost"),
		ContributionPct:           getFloat("contribution_pct"),
		ContributionRatio:         getFloat("contribution_ratio"),
		SalesContribution:         getFloat("sales_contribution"),
		TargetDays:                getInt("target_days"),
		TargetDaysCover:           getInt("target_days_cover"),
		DailyStockCover:           getFloat("daily_stock_cover"),
	}

	if err := s.repo.InsertDailyStockData(ctx, dailyData); err != nil {
		return fmt.Errorf("insert daily data: %w", err)
	}

	return nil
}
