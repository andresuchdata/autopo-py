// backend-go/internal/repository/postgres/po_repository.go
package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/jmoiron/sqlx"
)

type poRepository struct {
	db *DB
}

func NewPORepository(db *DB) *poRepository {
	return &poRepository{db: db}
}

func (r *poRepository) SavePOResults(ctx context.Context, storeName string, results []*domain.POResult) error {
	return r.db.WithTx(ctx, func(tx *sql.Tx) error {
		// 1. Save store if not exists
		storeID, err := r.upsertStore(ctx, tx, storeName)
		if err != nil {
			return fmt.Errorf("failed to upsert store: %w", err)
		}

		// 2. Save PO results
		query := `
			INSERT INTO po_results (
				store_id, sku, product_name, stock, daily_sales, 
				stock_cover_days, status, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (store_id, sku) 
			DO UPDATE SET 
				product_name = EXCLUDED.product_name,
				stock = EXCLUDED.stock,
				daily_sales = EXCLUDED.daily_sales,
				stock_cover_days = EXCLUDED.stock_cover_days,
				status = EXCLUDED.status,
				updated_at = NOW()
		`

		stmt, err := tx.PrepareContext(ctx, query)
		if err != nil {
			return fmt.Errorf("failed to prepare statement: %w", err)
		}
		defer stmt.Close()

		for _, result := range results {
			_, err := stmt.ExecContext(
				ctx,
				storeID,
				result.SKU,
				result.ProductName,
				result.Stock,
				result.DailySales,
				result.StockCoverDays,
				result.Status,
				time.Now(),
			)
			if err != nil {
				return fmt.Errorf("failed to insert PO result: %w", err)
			}
		}

		return nil
	})
}

func (r *poRepository) upsertStore(ctx context.Context, tx *sql.Tx, name string) (int64, error) {
	var id int64
	query := `
		INSERT INTO stores (name, created_at)
		VALUES ($1, NOW())
		ON CONFLICT (name) DO UPDATE
		SET updated_at = NOW()
		RETURNING id
	`
	err := tx.QueryRowContext(ctx, query, name).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("failed to upsert store: %w", err)
	}
	return id, nil
}

func (r *poRepository) GetStoreResults(ctx context.Context, storeName string) ([]*domain.POResult, error) {
	query := `
		SELECT 
			r.sku, 
			r.product_name, 
			s.name as store_name,
			r.stock,
			r.daily_sales,
			r.stock_cover_days,
			r.status
		FROM po_results r
		JOIN stores s ON r.store_id = s.id
		WHERE s.name = $1
		ORDER BY r.stock_cover_days ASC
	`

	var results []*domain.POResult
	err := sqlx.SelectContext(ctx, r.db, &results, query, storeName)
	if err != nil {
		return nil, fmt.Errorf("failed to get store results: %w", err)
	}

	return results, nil
}

func (r *poRepository) GetStores(ctx context.Context) ([]*domain.Store, error) {
	query := `
		SELECT id, name, created_at, updated_at
		FROM stores
		ORDER BY name
	`

	var stores []*domain.Store
	err := sqlx.SelectContext(ctx, r.db, &stores, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list stores: %w", err)
	}

	return stores, nil
}

func (r *poRepository) GetBrands(ctx context.Context) ([]*domain.Brand, error) {
	query := `
		SELECT id, name, created_at, updated_at
		FROM brands
		ORDER BY name
	`

	var brands []*domain.Brand
	if err := sqlx.SelectContext(ctx, r.db, &brands, query); err != nil {
		return nil, fmt.Errorf("failed to list brands: %w", err)
	}

	return brands, nil
}

func (r *poRepository) GetSkus(ctx context.Context, search string, limit, offset int) ([]*domain.Product, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	query := `
		SELECT id, sku, name, COALESCE(hpp, 0) AS hpp, COALESCE(price, 0) AS price, created_at, updated_at
		FROM products
		WHERE ($1 = '' OR sku ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%')
		ORDER BY sku ASC
		LIMIT $2 OFFSET $3
	`

	var products []*domain.Product
	if err := sqlx.SelectContext(ctx, r.db, &products, query, search, limit, offset); err != nil {
		return nil, fmt.Errorf("failed to list skus: %w", err)
	}

	return products, nil
}
