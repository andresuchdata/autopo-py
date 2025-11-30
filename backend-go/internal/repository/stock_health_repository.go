// backend-go/internal/repository/stock_health_repository.go
package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/jmoiron/sqlx"
)

type StockHealthRepository interface {
	GetStockHealthSummary(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealthSummary, error)
	GetStockItems(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealth, int, error)
	GetTimeSeriesData(ctx context.Context, days int, filter domain.StockHealthFilter) (map[string][]domain.TimeSeriesData, error)
	GetAvailableDates(ctx context.Context, limit int) ([]time.Time, error)
}

func (r *stockHealthRepository) GetAvailableDates(ctx context.Context, limit int) ([]time.Time, error) {
	if limit <= 0 {
		limit = 30
	}

	query := `
		SELECT DISTINCT stock_date
		FROM stock_health
		ORDER BY stock_date DESC
		LIMIT $1
	`

	var dates []time.Time
	if err := r.db.SelectContext(ctx, &dates, query, limit); err != nil {
		return nil, fmt.Errorf("error getting available dates: %w", err)
	}

	return dates, nil
}

type stockHealthRepository struct {
	db *sqlx.DB
}

func NewStockHealthRepository(db *sqlx.DB) StockHealthRepository {
	return &stockHealthRepository{db: db}
}

func (r *stockHealthRepository) GetStockHealthSummary(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealthSummary, error) {
	query := `
        SELECT 
            stock_condition,
            COUNT(*) as count
        FROM stock_health
        WHERE 1=1
    `

	var args []interface{}
	var conditions []string
	argCounter := 1

	if len(filter.StoreIDs) > 0 {
		conditions = append(conditions, fmt.Sprintf("store_id = ANY($%d::bigint[])", argCounter))
		args = append(args, filter.StoreIDs)
		argCounter++
	}

	if len(filter.SKUIds) > 0 {
		conditions = append(conditions, fmt.Sprintf("sku_id = ANY($%d::text[])", argCounter))
		args = append(args, filter.SKUIds)
		argCounter++
	}

	if len(filter.BrandIDs) > 0 {
		conditions = append(conditions, fmt.Sprintf("brand_id = ANY($%d::bigint[])", argCounter))
		args = append(args, filter.BrandIDs)
		argCounter++
	}

	if filter.StockDate != "" {
		conditions = append(conditions, fmt.Sprintf("stock_date = $%d::date", argCounter))
		args = append(args, filter.StockDate)
		argCounter++
	}

	if len(conditions) > 0 {
		query += " AND " + strings.Join(conditions, " AND ")
	}

	query += " GROUP BY stock_condition"

	var summaries []domain.StockHealthSummary
	err := r.db.SelectContext(ctx, &summaries, query, args...)
	if err != nil {
		return nil, fmt.Errorf("error getting stock health summary: %w", err)
	}

	return summaries, nil
}

func (r *stockHealthRepository) GetStockItems(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealth, int, error) {
	countQuery := `
        SELECT COUNT(*) 
        FROM stock_health
        WHERE 1=1
    `

	query := `
        SELECT 
            id, store_id, store_name, sku_id, sku_code, product_name,
            brand_id, brand_name, current_stock, days_of_cover,
            stock_date, last_updated, stock_condition
        FROM stock_health
        WHERE 1=1
    `

	var args []interface{}
	var conditions []string
	argCounter := 1

	if len(filter.StoreIDs) > 0 {
		conditions = append(conditions, fmt.Sprintf("store_id = ANY($%d::bigint[])", argCounter))
		args = append(args, filter.StoreIDs)
		argCounter++
	}

	if len(filter.SKUIds) > 0 {
		conditions = append(conditions, fmt.Sprintf("sku_id = ANY($%d::text[])", argCounter))
		args = append(args, filter.SKUIds)
		argCounter++
	}

	if len(filter.BrandIDs) > 0 {
		conditions = append(conditions, fmt.Sprintf("brand_id = ANY($%d::bigint[])", argCounter))
		args = append(args, filter.BrandIDs)
		argCounter++
	}

	if filter.Condition != "" {
		conditions = append(conditions, fmt.Sprintf("stock_condition = $%d", argCounter))
		args = append(args, filter.Condition)
		argCounter++
	}

	if filter.StockDate != "" {
		conditions = append(conditions, fmt.Sprintf("stock_date = $%d::date", argCounter))
		args = append(args, filter.StockDate)
		argCounter++
	}

	if len(conditions) > 0 {
		whereClause := " AND " + strings.Join(conditions, " AND ")
		query += whereClause
		countQuery += whereClause
	}

	// Get total count
	var total int
	err := r.db.GetContext(ctx, &total, countQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("error counting stock items: %w", err)
	}

	// Add pagination
	if filter.PageSize > 0 {
		offset := (filter.Page - 1) * filter.PageSize
		query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argCounter, argCounter+1)
		args = append(args, filter.PageSize, offset)
	}

	var items []domain.StockHealth
	err = r.db.SelectContext(ctx, &items, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("error getting stock items: %w", err)
	}

	return items, total, nil
}

func (r *stockHealthRepository) GetTimeSeriesData(ctx context.Context, days int, filter domain.StockHealthFilter) (map[string][]domain.TimeSeriesData, error) {
	query := `
        WITH dates AS (
            SELECT date_trunc('day', current_date - (n || ' days')::interval) as date
            FROM generate_series(0, $1) n
        ),
        daily_counts AS (
            SELECT 
                date_trunc('day', sh.stock_date) as date,
                sh.stock_condition,
                COUNT(*) as count
            FROM stock_health sh
            WHERE sh.stock_date >= (current_date - ($1 || ' days')::interval)
    `

	args := []interface{}{days - 1}
	argCounter := 2

	var conditions []string

	if len(filter.StoreIDs) > 0 {
		conditions = append(conditions, fmt.Sprintf("sh.store_id = ANY($%d::bigint[])", argCounter))
		args = append(args, filter.StoreIDs)
		argCounter++
	}

	if len(filter.SKUIds) > 0 {
		conditions = append(conditions, fmt.Sprintf("sh.sku_id = ANY($%d::text[])", argCounter))
		args = append(args, filter.SKUIds)
		argCounter++
	}

	if len(filter.BrandIDs) > 0 {
		conditions = append(conditions, fmt.Sprintf("sh.brand_id = ANY($%d::bigint[])", argCounter))
		args = append(args, filter.BrandIDs)
		argCounter++
	}

	if len(conditions) > 0 {
		query += " AND " + strings.Join(conditions, " AND ")
	}

	query += `
            GROUP BY date_trunc('day', sh.stock_date), sh.stock_condition
        )
        SELECT 
            to_char(d.date, 'YYYY-MM-DD') as date,
            COALESCE(dc.stock_condition, 'out_of_stock') as stock_condition,
            COALESCE(dc.count, 0) as count
        FROM dates d
        LEFT JOIN daily_counts dc ON d.date = dc.date
        ORDER BY d.date, dc.stock_condition
    `

	rows, err := r.db.QueryxContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("error querying time series data: %w", err)
	}
	defer rows.Close()

	result := make(map[string][]domain.TimeSeriesData)
	for rows.Next() {
		var date string
		var condition string
		var count int

		if err := rows.Scan(&date, &condition, &count); err != nil {
			return nil, fmt.Errorf("error scanning time series data: %w", err)
		}

		result[condition] = append(result[condition], domain.TimeSeriesData{
			Date:  date,
			Count: count,
		})
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating time series data: %w", err)
	}

	return result, nil
}
