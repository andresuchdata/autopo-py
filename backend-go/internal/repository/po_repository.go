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
	GetSkus(ctx context.Context, search string, limit, offset int) ([]*domain.Product, error)

	// Dashboard methods
	GetDashboardSummary(ctx context.Context) (*domain.DashboardSummary, error)
	GetPOTrend(ctx context.Context, interval string) ([]domain.POTrend, error)
	GetPOAging(ctx context.Context) ([]domain.POAging, error)
	GetSupplierPerformance(ctx context.Context) ([]domain.SupplierPerformance, error)
}
