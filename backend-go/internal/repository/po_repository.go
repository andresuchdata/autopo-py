// backend-go/internal/repository/po_repository.go
package repository

import (
	"context"

	"github.com/yourusername/autopo/backend-go/internal/domain"
)

type PORepository interface {
	SavePOResults(ctx context.Context, storeName string, results []*domain.POResult) error
	GetStoreResults(ctx context.Context, storeName string) ([]*domain.POResult, error)
	GetStores(ctx context.Context) ([]*domain.Store, error)
}