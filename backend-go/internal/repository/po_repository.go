// backend-go/internal/repository/po_repository.go
package repository

import (
	"context"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
)

type PORepository interface {
	SavePOResults(ctx context.Context, storeName string, results []*domain.POResult) error
	GetStoreResults(ctx context.Context, storeName string) ([]*domain.POResult, error)
	GetStores(ctx context.Context) ([]*domain.Store, error)
	GetBrands(ctx context.Context) ([]*domain.Brand, error)
	GetSuppliers(ctx context.Context, search string, limit, offset int) ([]*domain.Supplier, error)
	GetSkus(ctx context.Context, search string, limit, offset int, brandIDs []int64) ([]*domain.Product, error)

	// Dashboard methods
	GetDashboardSummary(ctx context.Context, filter *domain.DashboardFilter) (*domain.DashboardSummary, error)
	GetPOTrend(ctx context.Context, interval string) ([]domain.POTrend, error)
	GetPOAging(ctx context.Context) ([]domain.POAging, error)
	GetSupplierPerformance(ctx context.Context) ([]domain.SupplierPerformance, error)
	GetPOSnapshotItems(ctx context.Context, statusCode int, page, pageSize int, sortField, sortDirection string, filter *domain.DashboardFilter) (*domain.POSnapshotItemsResponse, error)
	GetSupplierPOItems(ctx context.Context, supplierID int64, page, pageSize int, sortField, sortDirection string) (*domain.SupplierPOItemsResponse, error)
	GetPOAgingItems(ctx context.Context, page, pageSize int, sortField, sortDirection, status string) (*domain.POAgingResponse, error)
	GetSupplierPerformanceItems(ctx context.Context, page, pageSize int, sortField, sortDirection string) (*domain.SupplierPerformanceResponse, error)
}
