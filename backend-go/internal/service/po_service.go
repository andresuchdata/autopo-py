// backend-go/internal/service/po_service.go
package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/cache"
	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/rs/zerolog/log"
)

type POService struct {
	repo           repository.PORepository
	dashboardCache cache.DashboardCache
}

func NewPOService(repo repository.PORepository, dashboardCache cache.DashboardCache) *POService {
	if dashboardCache == nil {
		dashboardCache = cache.NewNoopDashboardCache()
	}
	return &POService{
		repo:           repo,
		dashboardCache: dashboardCache,
	}
}

// ProcessPOFiles processes multiple PO files concurrently
func (s *POService) ProcessPOFiles(ctx context.Context, files []*domain.UploadedFile) ([]*domain.StoreResult, error) {
	var (
		wg       sync.WaitGroup
		results  = make([]*domain.StoreResult, 0, len(files))
		resultCh = make(chan *domain.StoreResult, len(files))
		errCh    = make(chan error, len(files))
	)

	// Process each file in a separate goroutine
	for _, file := range files {
		wg.Add(1)
		go func(f *domain.UploadedFile) {
			defer wg.Done()

			result, err := s.ProcessPOFile(ctx, f)
			if err != nil {
				errCh <- fmt.Errorf("error processing file %s: %w", f.Filename, err)
				return
			}

			resultCh <- result
		}(file)
	}

	// Close channels when all goroutines are done
	go func() {
		wg.Wait()
		close(resultCh)
		close(errCh)
	}()

	// Collect results
	for result := range resultCh {
		results = append(results, result)
	}

	// Check for errors
	if len(errCh) > 0 {
		var errs []error
		for err := range errCh {
			errs = append(errs, err)
		}
		return nil, fmt.Errorf("errors processing files: %v", errs)
	}

	return results, nil
}

// ProcessPOFile processes a single PO file
func (s *POService) ProcessPOFile(ctx context.Context, file *domain.UploadedFile) (*domain.StoreResult, error) {
	// 1. Parse the file
	records, err := s.parsePOFile(file)
	if err != nil {
		return nil, fmt.Errorf("failed to parse PO file: %w", err)
	}

	// 2. Process records
	storeName := s.extractStoreName(file.Filename)
	results := make([]*domain.POResult, 0, len(records))

	for _, record := range records {
		result, err := s.processRecord(record, storeName)
		if err != nil {
			log.Error().Err(err).Str("sku", record.SKU).Msg("failed to process record")
			continue
		}
		results = append(results, result)
	}

	// 3. Save results to database
	if err := s.repo.SavePOResults(ctx, storeName, results); err != nil {
		return nil, fmt.Errorf("failed to save PO results: %w", err)
	}

	// 4. Export results to CSV
	exportPath := filepath.Join("data/output", fmt.Sprintf("result_%s.csv", storeName))
	if err := s.exportToCSV(exportPath, results); err != nil {
		return nil, fmt.Errorf("failed to export results: %w", err)
	}

	return &domain.StoreResult{
		StoreName:   storeName,
		TotalItems:  len(results),
		ProcessedAt: time.Now(),
	}, nil
}

// Helper methods for processing
func (s *POService) parsePOFile(file *domain.UploadedFile) ([]*domain.PORecord, error) {
	// Implementation for parsing different file types (CSV, XLSX, etc.)
	// ...
	return nil, nil
}

func (s *POService) extractStoreName(filename string) string {
	// Extract store name from filename
	// ...
	return "default"
}

func (s *POService) processRecord(record *domain.PORecord, storeName string) (*domain.POResult, error) {
	// Process individual record and calculate required fields
	// ...
	return &domain.POResult{
		SKU:            record.SKU,
		ProductName:    record.ProductName,
		StoreName:      storeName,
		Stock:          record.Stock,
		DailySales:     record.DailySales,
		StockCoverDays: float64(record.Stock) / record.DailySales,
		Status:         "healthy", // Calculate based on business rules
	}, nil
}

func (s *POService) exportToCSV(path string, results []*domain.POResult) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Write header
	header := []string{"SKU", "Product Name", "Store", "Stock", "Daily Sales", "Stock Cover Days", "Status"}
	if err := writer.Write(header); err != nil {
		return err
	}

	// Write data
	for _, result := range results {
		record := []string{
			result.SKU,
			result.ProductName,
			result.StoreName,
			fmt.Sprintf("%d", result.Stock),
			fmt.Sprintf("%.2f", result.DailySales),
			fmt.Sprintf("%.1f", result.StockCoverDays),
			result.Status,
		}
		if err := writer.Write(record); err != nil {
			return err
		}
	}

	return nil
}

// GetStoreResults returns the processing results for a specific store
func (s *POService) GetStoreResults(ctx context.Context, storeName string) ([]*domain.POResult, error) {
	return s.repo.GetStoreResults(ctx, storeName)
}

// GetStores returns a list of all stores
func (s *POService) GetStores(ctx context.Context) ([]*domain.Store, error) {
	return s.repo.GetStores(ctx)
}

// GetBrands returns a list of all brands
func (s *POService) GetBrands(ctx context.Context) ([]*domain.Brand, error) {
	return s.repo.GetBrands(ctx)
}

// GetSkus returns a list of SKUs matching the optional search term with pagination
func (s *POService) GetSkus(ctx context.Context, search string, limit, offset int) ([]*domain.Product, error) {
	return s.repo.GetSkus(ctx, search, limit, offset)
}

// GetDashboardSummary returns the aggregated dashboard data
func (s *POService) GetDashboardSummary(ctx context.Context, filter *domain.DashboardFilter) (*domain.DashboardSummary, error) {
	if summary, ok, err := s.dashboardCache.GetSummary(ctx, filter); err == nil && ok {
		return summary, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("po service: dashboard cache get failed")
	}

	summary, err := s.repo.GetDashboardSummary(ctx, filter)
	if err != nil {
		return nil, err
	}

	if err := s.dashboardCache.SetSummary(ctx, filter, summary); err != nil {
		log.Warn().Err(err).Msg("po service: dashboard cache set failed")
	}

	return summary, nil
}

// GetPOTrend returns the trend data
func (s *POService) GetPOTrend(ctx context.Context, interval string) ([]domain.POTrend, error) {
	if trends, ok, err := s.dashboardCache.GetTrend(ctx, interval, nil); err == nil && ok {
		return trends, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("po service: dashboard trend cache get failed")
	}

	trends, err := s.repo.GetPOTrend(ctx, interval)
	if err != nil {
		return nil, err
	}

	if err := s.dashboardCache.SetTrend(ctx, interval, nil, trends); err != nil {
		log.Warn().Err(err).Msg("po service: dashboard trend cache set failed")
	}

	return trends, nil
}

// GetPOAging returns the aging data
func (s *POService) GetPOAging(ctx context.Context) ([]domain.POAging, error) {
	if aging, ok, err := s.dashboardCache.GetAging(ctx, nil); err == nil && ok {
		return aging, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("po service: dashboard aging cache get failed")
	}

	aging, err := s.repo.GetPOAging(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.dashboardCache.SetAging(ctx, nil, aging); err != nil {
		log.Warn().Err(err).Msg("po service: dashboard aging cache set failed")
	}

	return aging, nil
}

// GetSupplierPerformance returns the supplier performance data
func (s *POService) GetSupplierPerformance(ctx context.Context) ([]domain.SupplierPerformance, error) {
	if perf, ok, err := s.dashboardCache.GetSupplierPerformance(ctx, nil); err == nil && ok {
		return perf, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("po service: dashboard supplier perf cache get failed")
	}

	perf, err := s.repo.GetSupplierPerformance(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.dashboardCache.SetSupplierPerformance(ctx, nil, perf); err != nil {
		log.Warn().Err(err).Msg("po service: dashboard supplier perf cache set failed")
	}

	return perf, nil
}

// GetPOSnapshotItems returns PO snapshot items filtered by status with pagination and sorting
func (s *POService) GetPOSnapshotItems(ctx context.Context, statusCode int, page, pageSize int, sortField, sortDirection string, filter *domain.DashboardFilter) (*domain.POSnapshotItemsResponse, error) {
	return s.repo.GetPOSnapshotItems(ctx, statusCode, page, pageSize, sortField, sortDirection, filter)
}

// GetPOAgingItems returns paginated aging items
func (s *POService) GetPOAgingItems(ctx context.Context, page, pageSize int, sortField, sortDirection, status string) (*domain.POAgingResponse, error) {
	return s.repo.GetPOAgingItems(ctx, page, pageSize, sortField, sortDirection, status)
}

// GetSupplierPOItems returns PO entries filtered by supplier
func (s *POService) GetSupplierPOItems(ctx context.Context, supplierID int64, page, pageSize int, sortField, sortDirection string) (*domain.SupplierPOItemsResponse, error) {
	return s.repo.GetSupplierPOItems(ctx, supplierID, page, pageSize, sortField, sortDirection)
}

// GetSupplierPerformanceItems returns paginated supplier performance items
func (s *POService) GetSupplierPerformanceItems(ctx context.Context, page, pageSize int, sortField, sortDirection string) (*domain.SupplierPerformanceResponse, error) {
	return s.repo.GetSupplierPerformanceItems(ctx, page, pageSize, sortField, sortDirection)
}
