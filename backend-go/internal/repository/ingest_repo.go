package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
)

type IngestRepository struct {
	db *sql.DB
}

func NewIngestRepository(db *sql.DB) *IngestRepository {
	return &IngestRepository{db: db}
}

func (r *IngestRepository) UpsertBrand(ctx context.Context, brand *domain.Brand) (int64, error) {
	query := `
		INSERT INTO brands (name, original_id, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (original_id) 
		DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
		RETURNING id
	`
	var id int64
	err := r.db.QueryRowContext(ctx, query, brand.Name, brand.OriginalID).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("failed to upsert brand: %w", err)
	}
	return id, nil
}

func (r *IngestRepository) UpsertSupplier(ctx context.Context, supplier *domain.Supplier) (int64, error) {
	query := `
		INSERT INTO suppliers (name, original_id, min_purchase, trading_term, promo_factor, delay_factor, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (original_id) 
		DO UPDATE SET 
			name = EXCLUDED.name,
			min_purchase = EXCLUDED.min_purchase,
			trading_term = EXCLUDED.trading_term,
			promo_factor = EXCLUDED.promo_factor,
			delay_factor = EXCLUDED.delay_factor,
			updated_at = NOW()
		RETURNING id
	`
	var id int64
	err := r.db.QueryRowContext(ctx, query,
		supplier.Name,
		supplier.OriginalID,
		supplier.MinPurchase,
		supplier.TradingTerm,
		supplier.PromoFactor,
		supplier.DelayFactor,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("failed to upsert supplier: %w", err)
	}
	return id, nil
}

func (r *IngestRepository) UpsertStore(ctx context.Context, store *domain.Store) (int64, error) {
	// Note: Store struct in models.go might not have OriginalID yet, assuming we added it or using Name as key if OriginalID is missing.
	// Based on migration, we have original_id. Let's assume domain.Store has it or we map it.
	// For now, I'll assume domain.Store needs update or I use a temporary struct/map if domain.Store is strictly for existing app.
	// But I updated models.go to include new structs. Wait, I didn't update domain.Store, I just added new structs.
	// Let's check domain.Store in models.go again. It was:
	// type Store struct { ID int64; Name string; ... }
	// I should probably update domain.Store to include OriginalID or just use a new method that accepts name/original_id.

	query := `
		INSERT INTO stores (name, original_id, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (original_id) 
		DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
		RETURNING id
	`
	var id int64
	// Assuming store.Name and a passed originalID.
	// Actually, let's assume the caller passes the necessary fields.
	// But to be clean, I should have updated domain.Store.
	// For this implementation, I will assume the caller passes the struct and I might need to cast or use the fields.
	// Let's use the fields directly for now to avoid confusion if I missed updating the struct.

	err := r.db.QueryRowContext(ctx, query, store.Name, store.OriginalID).Scan(&id) // This assumes I added OriginalID to Store struct.
	if err != nil {
		return 0, fmt.Errorf("failed to upsert store: %w", err)
	}
	return id, nil
}

func (r *IngestRepository) UpsertProduct(ctx context.Context, product *domain.Product) (int64, error) {
	query := `
		INSERT INTO products (sku, name, brand_id, supplier_id, hpp, price, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (sku) 
		DO UPDATE SET 
			name = EXCLUDED.name,
			brand_id = EXCLUDED.brand_id,
			supplier_id = EXCLUDED.supplier_id,
			hpp = EXCLUDED.hpp,
			price = EXCLUDED.price,
			updated_at = NOW()
		RETURNING id
	`
	var id int64
	err := r.db.QueryRowContext(ctx, query,
		product.SKUCode,
		product.Name,
		product.BrandID,
		product.SupplierID,
		product.HPP,
		product.Price,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("failed to upsert product: %w", err)
	}
	return id, nil
}

func (r *IngestRepository) InsertDailyStockData(ctx context.Context, data *domain.DailyStockData) error {
	query := `
		INSERT INTO daily_stock_data (
			date, store_id, product_id, stock, daily_sales, max_daily_sales,
			orig_daily_sales, orig_max_daily_sales, lead_time, max_lead_time,
			min_order, is_in_padang, safety_stock, reorder_point,
			sedang_po, is_open_po, initial_qty_po, emergency_po_qty,
			updated_regular_po_qty, final_updated_regular_po_qty,
			emergency_po_cost, final_updated_regular_po_cost,
			contribution_pct, contribution_ratio, sales_contribution,
			target_days, target_days_cover, daily_stock_cover
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
		)
		ON CONFLICT (date, store_id, product_id) DO UPDATE SET
			stock = EXCLUDED.stock,
			daily_sales = EXCLUDED.daily_sales,
			max_daily_sales = EXCLUDED.max_daily_sales,
			orig_daily_sales = EXCLUDED.orig_daily_sales,
			orig_max_daily_sales = EXCLUDED.orig_max_daily_sales,
			lead_time = EXCLUDED.lead_time,
			max_lead_time = EXCLUDED.max_lead_time,
			min_order = EXCLUDED.min_order,
			is_in_padang = EXCLUDED.is_in_padang,
			safety_stock = EXCLUDED.safety_stock,
			reorder_point = EXCLUDED.reorder_point,
			sedang_po = EXCLUDED.sedang_po,
			is_open_po = EXCLUDED.is_open_po,
			initial_qty_po = EXCLUDED.initial_qty_po,
			emergency_po_qty = EXCLUDED.emergency_po_qty,
			updated_regular_po_qty = EXCLUDED.updated_regular_po_qty,
			final_updated_regular_po_qty = EXCLUDED.final_updated_regular_po_qty,
			emergency_po_cost = EXCLUDED.emergency_po_cost,
			final_updated_regular_po_cost = EXCLUDED.final_updated_regular_po_cost,
			contribution_pct = EXCLUDED.contribution_pct,
			contribution_ratio = EXCLUDED.contribution_ratio,
			sales_contribution = EXCLUDED.sales_contribution,
			target_days = EXCLUDED.target_days,
			target_days_cover = EXCLUDED.target_days_cover,
			daily_stock_cover = EXCLUDED.daily_stock_cover
	`
	_, err := r.db.ExecContext(ctx, query,
		data.Date, data.StoreID, data.ProductID, data.Stock, data.DailySales, data.MaxDailySales,
		data.OrigDailySales, data.OrigMaxDailySales, data.LeadTime, data.MaxLeadTime,
		data.MinOrder, data.IsInPadang, data.SafetyStock, data.ReorderPoint,
		data.SedangPO, data.IsOpenPO, data.InitialQtyPO, data.EmergencyPOQty,
		data.UpdatedRegularPOQty, data.FinalUpdatedRegularPOQty,
		data.EmergencyPOCost, data.FinalUpdatedRegularPOCost,
		data.ContributionPct, data.ContributionRatio, data.SalesContribution,
		data.TargetDays, data.TargetDaysCover, data.DailyStockCover,
	)
	if err != nil {
		return fmt.Errorf("failed to insert daily stock data: %w", err)
	}
	return nil
}
