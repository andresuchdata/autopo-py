package repository

import (
	"context"
	"database/sql"
)

// Store represents a store entity
type Store struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	OriginalID string `json:"original_id,omitempty"`
}

// StoreRepository handles database operations for stores
type StoreRepository struct {
	db *sql.DB
}

// NewStoreRepository creates a new store repository
func NewStoreRepository(db *sql.DB) *StoreRepository {
	return &StoreRepository{db: db}
}

// GetAllStores retrieves all stores
func (r *StoreRepository) GetAllStores(ctx context.Context) ([]Store, error) {
	query := `
		SELECT id, name, original_id
		FROM stores
		ORDER BY name ASC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []Store
	for rows.Next() {
		var store Store
		var originalID sql.NullString
		err := rows.Scan(&store.ID, &store.Name, &originalID)
		if err != nil {
			return nil, err
		}
		if originalID.Valid {
			store.OriginalID = originalID.String
		}
		stores = append(stores, store)
	}

	return stores, rows.Err()
}

// GetStoreByID retrieves a store by ID
func (r *StoreRepository) GetStoreByID(ctx context.Context, id int) (*Store, error) {
	query := `
		SELECT id, name, original_id
		FROM stores
		WHERE id = $1
	`

	var store Store
	var originalID sql.NullString
	err := r.db.QueryRowContext(ctx, query, id).Scan(&store.ID, &store.Name, &originalID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if originalID.Valid {
		store.OriginalID = originalID.String
	}

	return &store, nil
}

// GetStoresByIDs retrieves multiple stores by their IDs
func (r *StoreRepository) GetStoresByIDs(ctx context.Context, ids []int) ([]Store, error) {
	if len(ids) == 0 {
		return []Store{}, nil
	}

	query := `
		SELECT id, name, original_id
		FROM stores
		WHERE id = ANY($1)
		ORDER BY name ASC
	`

	rows, err := r.db.QueryContext(ctx, query, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []Store
	for rows.Next() {
		var store Store
		var originalID sql.NullString
		err := rows.Scan(&store.ID, &store.Name, &originalID)
		if err != nil {
			return nil, err
		}
		if originalID.Valid {
			store.OriginalID = originalID.String
		}
		stores = append(stores, store)
	}

	return stores, rows.Err()
}

// SearchStores searches for stores by name
func (r *StoreRepository) SearchStores(ctx context.Context, query string) ([]Store, error) {
	sqlQuery := `
		SELECT id, name, original_id
		FROM stores
		WHERE name ILIKE $1
		ORDER BY name ASC
		LIMIT 50
	`

	rows, err := r.db.QueryContext(ctx, sqlQuery, "%"+query+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stores []Store
	for rows.Next() {
		var store Store
		var originalID sql.NullString
		err := rows.Scan(&store.ID, &store.Name, &originalID)
		if err != nil {
			return nil, err
		}
		if originalID.Valid {
			store.OriginalID = originalID.String
		}
		stores = append(stores, store)
	}

	return stores, rows.Err()
}
