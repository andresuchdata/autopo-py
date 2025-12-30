package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
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

func (r *poRepository) GetStores(ctx context.Context, search string) ([]*domain.Store, error) {
	query := `
		SELECT id, name, created_at, updated_at
		FROM stores
		WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')
		ORDER BY name
	`

	var stores []*domain.Store
	err := sqlx.SelectContext(ctx, r.db, &stores, query, search)
	if err != nil {
		return nil, fmt.Errorf("failed to list stores: %w", err)
	}

	return stores, nil
}

func (r *poRepository) GetBrands(ctx context.Context, search string) ([]*domain.Brand, error) {
	query := `
		SELECT id, name, created_at, updated_at
		FROM brands
		WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')
		ORDER BY name
	`

	var brands []*domain.Brand
	if err := sqlx.SelectContext(ctx, r.db, &brands, query, search); err != nil {
		return nil, fmt.Errorf("failed to list brands: %w", err)
	}
	if brands == nil {
		brands = []*domain.Brand{}
	}

	return brands, nil
}

func (r *poRepository) GetSuppliers(ctx context.Context, search string, limit, offset int) ([]*domain.Supplier, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	// Note: some deployments may not yet have all extended supplier columns.
	// To keep this endpoint robust, we only select columns that are guaranteed
	// to exist in the current schema (id, name, created_at, updated_at).
	// sqlx will simply leave the other struct fields at their zero values.
	query := `
		SELECT id, name, created_at, updated_at
		FROM suppliers
		WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')
		ORDER BY name
		LIMIT $2 OFFSET $3
	`

	var suppliers []*domain.Supplier
	if err := sqlx.SelectContext(ctx, r.db, &suppliers, query, search, limit, offset); err != nil {
		return nil, fmt.Errorf("failed to list suppliers: %w", err)
	}
	if suppliers == nil {
		suppliers = []*domain.Supplier{}
	}
	return suppliers, nil
}

func (r *poRepository) GetSkus(ctx context.Context, search string, limit, offset int, brandIDs []int64, kategoriBrands []string) ([]*domain.Product, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	// Note: The original products table does not include brand_id in the earliest
	// migrations. To provide brand information for SKU options without breaking
	// older schemas, we derive brand_id from product_mappings when available.
	// This keeps the JSON field name `brand_id` consistent with domain.Product.
	//
	// The kategoriBrands parameter is currently accepted for forward compatibility
	// but intentionally not used to filter the query so behavior stays consistent
	// with existing deployments.
	brandFilter := ""
	if len(brandIDs) > 0 {
		values := make([]string, 0, len(brandIDs))
		for _, id := range brandIDs {
			values = append(values, fmt.Sprintf("%d", id))
		}
		idList := strings.Join(values, ",")
		brandFilter = fmt.Sprintf(` AND (
			EXISTS (SELECT 1 FROM product_mappings pm WHERE pm.product_id = p.id AND pm.brand_id IN (%s))
			OR EXISTS (
				SELECT 1 FROM purchase_order_items poi
				JOIN purchase_orders po ON po.id = poi.po_id
				WHERE poi.product_id = p.id AND po.brand_id IN (%s)
			)
		)`, idList, idList)
	}

	query := fmt.Sprintf(`
		SELECT DISTINCT
			p.id,
			p.sku,
			p.name,
			COALESCE(
				(SELECT pm.brand_id FROM product_mappings pm WHERE pm.product_id = p.id LIMIT 1),
				(SELECT po.brand_id FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.po_id WHERE poi.product_id = p.id LIMIT 1),
				0
			) AS brand_id,
			COALESCE(p.hpp, 0) AS hpp,
			COALESCE(p.price, 0) AS price,
			p.created_at,
			p.updated_at
		FROM products p
		WHERE ($1 = '' OR p.sku ILIKE '%%' || $1 || '%%' OR p.name ILIKE '%%' || $1 || '%%')%s
		ORDER BY p.sku ASC
		LIMIT $2 OFFSET $3
	`, brandFilter)

	var products []*domain.Product
	if err := sqlx.SelectContext(ctx, r.db, &products, query, search, limit, offset); err != nil {
		return nil, fmt.Errorf("failed to list skus: %w", err)
	}
	// Ensure we never return a nil slice so JSON encoding yields [] instead of null
	if products == nil {
		products = []*domain.Product{}
	}

	return products, nil
}

func (r *poRepository) GetSupplier(ctx context.Context, id int64) (*domain.Supplier, error) {
	query := `
		SELECT id, name, created_at, updated_at
		FROM suppliers
		WHERE id = $1
	`
	var supplier domain.Supplier
	if err := r.db.GetContext(ctx, &supplier, query, id); err != nil {
		return nil, fmt.Errorf("failed to get supplier: %w", err)
	}
	return &supplier, nil
}

func (r *poRepository) GetSupplierPOs(ctx context.Context, supplierID int64, page, pageSize int, storeID *int64, search, status string) ([]*domain.PODetail, int, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	baseQuery := `
		FROM purchase_orders po
		LEFT JOIN suppliers s ON po.supplier_id = s.id
		LEFT JOIN stores st ON po.store_id = st.id
		LEFT JOIN brands b ON po.brand_id = b.id
		WHERE po.supplier_id = $1
	`
	args := []interface{}{supplierID}

	if storeID != nil {
		baseQuery += fmt.Sprintf(" AND po.store_id = $%d", len(args)+1)
		args = append(args, *storeID)
	}

	if search != "" {
		baseQuery += fmt.Sprintf(" AND po.po_number ILIKE $%d", len(args)+1)
		args = append(args, "%"+search+"%")
	}

	if status != "" && status != "ALL" {
		if code, ok := domain.ParsePOStatus(status); ok {
			baseQuery += fmt.Sprintf(" AND po.status = $%d", len(args)+1)
			args = append(args, code)
		}
	}

	countQuery := "SELECT COUNT(*) " + baseQuery
	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, args...); err != nil {
		return nil, 0, fmt.Errorf("failed to count supplier pos: %w", err)
	}

	dataQuery := `
		SELECT 
			po.po_number,
			po.supplier_id,
			COALESCE(s.name, '') as supplier_name,
			COALESCE(st.name, '') as store_name,
			COALESCE(b.name, '') as brand_name,
			po.status as status_code,
			TO_CHAR(po.po_released_at, 'YYYY-MM-DD HH24:MI:SS') as po_released_at,
			TO_CHAR(po.po_sent_at, 'YYYY-MM-DD HH24:MI:SS') as po_sent_at,
			TO_CHAR(po.po_approved_at, 'YYYY-MM-DD HH24:MI:SS') as po_approved_at,
			TO_CHAR(po.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') as po_arrived_at,
			TO_CHAR(po.po_received_at, 'YYYY-MM-DD HH24:MI:SS') as po_received_at,
			po.po_qty,
			po.received_qty,
			(SELECT COALESCE(SUM(poi.quantity * poi.price), 0) FROM purchase_order_items poi WHERE poi.po_id = po.id) as total_amount
	` + baseQuery + fmt.Sprintf(" ORDER BY po.po_sent_at DESC NULLS LAST, po.created_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)

	args = append(args, pageSize, offset)

	var pos []*domain.PODetail
	if err := sqlx.SelectContext(ctx, r.db, &pos, dataQuery, args...); err != nil {
		return nil, 0, fmt.Errorf("failed to get supplier pos: %w", err)
	}

	for _, po := range pos {
		po.Status = domain.POStatusLabel(po.StatusCode)
	}

	return pos, total, nil
}

// UpdatePOItemETA updates the ETA for a specific item (SKU) or all items in a PO
func (r *poRepository) UpdatePOItemETA(ctx context.Context, poNumber string, sku *string, eta string) error {
	var query string
	var args []interface{}

	if sku != nil && *sku != "" {
		// Update specific SKU
		query = `
			UPDATE purchase_order_items poi
			SET eta = $1, updated_at = NOW()
			FROM purchase_orders po
			WHERE poi.po_id = po.id AND po.po_number = $2 AND poi.sku = $3
		`
		args = []interface{}{eta, poNumber, *sku}
	} else {
		// Update all items in PO
		query = `
			UPDATE purchase_order_items poi
			SET eta = $1, updated_at = NOW()
			FROM purchase_orders po
			WHERE poi.po_id = po.id AND po.po_number = $2
		`
		args = []interface{}{eta, poNumber}
	}

	result, err := r.db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to update eta: %w", err)
	}

	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("no items updated, po not found or sku mismatch")
	}

	return nil
}

// GetPODetails retrieves detailed information for a PO including its items
func (r *poRepository) GetPODetails(ctx context.Context, poNumber string) (*domain.PODetail, error) {
	// 1. Get PO Header info
	queryHeader := `
		SELECT 
			po.po_number,
			po.supplier_id,
			COALESCE(s.name, '') as supplier_name,
			COALESCE(st.name, '') as store_name,
			COALESCE(b.name, '') as brand_name,
			po.status as status_code,
			TO_CHAR(po.po_released_at, 'YYYY-MM-DD HH24:MI:SS') as po_released_at,
			TO_CHAR(po.po_sent_at, 'YYYY-MM-DD HH24:MI:SS') as po_sent_at,
			TO_CHAR(po.po_approved_at, 'YYYY-MM-DD HH24:MI:SS') as po_approved_at,
			TO_CHAR(po.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') as po_arrived_at,
			TO_CHAR(po.po_received_at, 'YYYY-MM-DD HH24:MI:SS') as po_received_at
		FROM purchase_orders po
		LEFT JOIN suppliers s ON po.supplier_id = s.id
		LEFT JOIN stores st ON po.store_id = st.id
		LEFT JOIN brands b ON po.brand_id = b.id
		WHERE po.po_number = $1
	`

	var header domain.PODetail
	if err := r.db.GetContext(ctx, &header, queryHeader, poNumber); err != nil {
		return nil, fmt.Errorf("failed to get po details: %w", err)
	}

	header.Status = domain.POStatusLabel(header.StatusCode)

	// 2. Get Items
	queryItems := `
		SELECT 
			po.po_number,
			COALESCE(b.name, '') as brand_name,
			COALESCE(s.name, '') as supplier_name,
			poi.sku,
			poi.product_name,
			COALESCE(st.name, '') as store_name,
			poi.price as unit_price,
			poi.amount as total_amount,
			poi.quantity as po_qty,
			poi.received_quantity as received_qty,
			TO_CHAR(poi.eta, 'YYYY-MM-DD') as eta
		FROM purchase_orders po
		JOIN purchase_order_items poi ON po.id = poi.po_id
		LEFT JOIN brands b ON po.brand_id = b.id
		LEFT JOIN suppliers s ON po.supplier_id = s.id
		LEFT JOIN stores st ON po.store_id = st.id
		WHERE po.po_number = $1
		ORDER BY poi.sku
	`

	var items []domain.POSnapshotItem
	// We map the result to POSnapshotItem but some fields will be empty/default since we don't query them (like timestamps from items, we use PO level or item level specific)
	// Actually POSnapshotItem struct is convenient here.
	if err := sqlx.SelectContext(ctx, r.db, &items, queryItems, poNumber); err != nil {
		return nil, fmt.Errorf("failed to get po items: %w", err)
	}

	// Calculate totals for header
	var totalQty int
	var receivedQty int
	var totalAmount float64

	for i := range items {
		totalQty += items[i].POQty
		if items[i].ReceivedQty != nil {
			receivedQty += *items[i].ReceivedQty
		}
		totalAmount += items[i].TotalAmount
	}

	header.Items = items
	header.POQty = totalQty
	header.ReceivedQty = receivedQty
	header.TotalAmount = totalAmount

	return &header, nil
}
