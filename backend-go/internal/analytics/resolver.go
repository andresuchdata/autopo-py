package analytics

import (
	"context"
	"database/sql"
	"fmt"
)

// EntityIDResolver handles ID lookups for various entities
type EntityIDResolver struct {
	db *sql.DB
}

func NewEntityIDResolver(db *sql.DB) *EntityIDResolver {
	return &EntityIDResolver{db: db}
}

// ResolveBrandID looks up a brand ID by name
func (r *EntityIDResolver) ResolveBrandID(ctx context.Context, name string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM brands WHERE name = $1", name).Scan(&id)
	return id, err
}

// ResolveStoreID looks up a store ID by name
func (r *EntityIDResolver) ResolveStoreID(ctx context.Context, name string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM stores WHERE name = $1", name).Scan(&id)
	return id, err
}

// ResolveSupplierID looks up a supplier ID by name
func (r *EntityIDResolver) ResolveSupplierID(ctx context.Context, name string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM suppliers WHERE name = $1", name).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return id, err
}

// ResolveProductID looks up a product ID by SKU
func (r *EntityIDResolver) ResolveProductID(ctx context.Context, sku string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx, "SELECT id FROM products WHERE sku = $1", sku).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return id, err
}

// EnsureProduct ensures a product exists with the given SKU, creating it if necessary
func (r *EntityIDResolver) EnsureProduct(ctx context.Context, sku string) (int, error) {
	var id int
	err := r.db.QueryRowContext(ctx,
		"WITH new_product AS ("+
			"  INSERT INTO products (sku, name, created_at, updated_at) "+
			"  VALUES ($1, $2, NOW(), NOW()) "+
			"  ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW() "+
			"  RETURNING id"+
			") SELECT id FROM new_product "+
			"UNION ALL "+
			"SELECT id FROM products WHERE sku = $1",
		sku, "Product "+sku,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("failed to ensure product: %w", err)
	}
	return id, nil
}
