// backend-go/internal/repository/stock_health_repository.go
package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

type StockHealthRepository interface {
	GetStockHealthSummary(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealthSummary, error)
	GetStockItems(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealth, int, error)
	GetTimeSeriesData(ctx context.Context, days int, filter domain.StockHealthFilter) (map[string][]domain.TimeSeriesData, error)
	GetBrandBreakdown(ctx context.Context, filter domain.StockHealthFilter) ([]domain.ConditionBreakdown, error)
	GetStoreBreakdown(ctx context.Context, filter domain.StockHealthFilter) ([]domain.ConditionBreakdown, error)
	GetAvailableDates(ctx context.Context, limit int) ([]time.Time, error)
}

func (r *stockHealthRepository) GetAvailableDates(ctx context.Context, limit int) ([]time.Time, error) {
	if limit <= 0 {
		limit = 30
	}

	query := `
		SELECT DISTINCT dsd."time"::date AS stock_date
		FROM daily_stock_data dsd
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
	filterClause, args, _ := buildFilterClause(filter, "dsd", 1, false)

	query := fmt.Sprintf(`
		SELECT 
			%s AS stock_condition,
			COUNT(*) AS count,
			COALESCE(SUM(dsd.stock), 0) AS total_stock,
			COALESCE(SUM(dsd.stock * COALESCE(pr.hpp, 0)), 0) AS total_value
		FROM daily_stock_data dsd
		LEFT JOIN products pr ON pr.id = dsd.product_id
		WHERE 1=1%s
	`, stockConditionExpression("dsd"), filterClause)

	if filter.Condition != "" {
		query += fmt.Sprintf(" AND (%s) = $%d", stockConditionExpression("dsd"), len(args)+1)
		args = append(args, filter.Condition)
	}

	query += " GROUP BY stock_condition"

	var summaries []domain.StockHealthSummary
	err := r.db.SelectContext(ctx, &summaries, query, args...)
	if err != nil {
		return nil, fmt.Errorf("error getting stock health summary: %w", err)
	}

	return summaries, nil
}

func (r *stockHealthRepository) GetBrandBreakdown(ctx context.Context, filter domain.StockHealthFilter) ([]domain.ConditionBreakdown, error) {
	filterClause, args, _ := buildFilterClause(filter, "dsd", 1, false)
	stockConditionExpr := stockConditionExpression("dsd")
	brandIDExpr := "COALESCE(br.id, 0)"
	brandNameExpr := "COALESCE(br.name, 'Unknown')"

	query := fmt.Sprintf(`
		SELECT 
			%s AS brand_id,
			%s AS brand_name,
			%s AS stock_condition,
			COUNT(*) AS count,
			COALESCE(SUM(dsd.stock), 0) AS total_stock,
			COALESCE(SUM(dsd.stock * COALESCE(pr.hpp, 0)), 0) AS total_value
		FROM daily_stock_data dsd
		LEFT JOIN brands br ON br.id = dsd.brand_id
		LEFT JOIN products pr ON pr.id = dsd.product_id
		WHERE 1=1%s
		GROUP BY %s, %s, %s
		ORDER BY brand_name, stock_condition
	`, brandIDExpr, brandNameExpr, stockConditionExpr, filterClause, brandIDExpr, brandNameExpr, stockConditionExpr)

	var results []domain.ConditionBreakdown
	if err := r.db.SelectContext(ctx, &results, query, args...); err != nil {
		return nil, fmt.Errorf("error getting brand breakdown: %w", err)
	}

	return results, nil
}

func (r *stockHealthRepository) GetStoreBreakdown(ctx context.Context, filter domain.StockHealthFilter) ([]domain.ConditionBreakdown, error) {
	filterClause, args, _ := buildFilterClause(filter, "dsd", 1, false)
	stockConditionExpr := stockConditionExpression("dsd")
	storeIDExpr := "COALESCE(st.id, 0)"
	storeNameExpr := "COALESCE(st.name, 'Unknown')"

	query := fmt.Sprintf(`
		SELECT 
			%s AS store_id,
			%s AS store_name,
			%s AS stock_condition,
			COUNT(*) AS count,
			COALESCE(SUM(dsd.stock), 0) AS total_stock,
			COALESCE(SUM(dsd.stock * COALESCE(pr.hpp, 0)), 0) AS total_value
		FROM daily_stock_data dsd
		LEFT JOIN stores st ON st.id = dsd.store_id
		LEFT JOIN products pr ON pr.id = dsd.product_id
		WHERE 1=1%s
		GROUP BY %s, %s, %s
		ORDER BY store_name, stock_condition
	`, storeIDExpr, storeNameExpr, stockConditionExpr, filterClause, storeIDExpr, storeNameExpr, stockConditionExpr)

	var results []domain.ConditionBreakdown
	if err := r.db.SelectContext(ctx, &results, query, args...); err != nil {
		return nil, fmt.Errorf("error getting store breakdown: %w", err)
	}

	return results, nil
}

func (r *stockHealthRepository) GetStockItems(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealth, int, error) {
	countClause, countArgs, _ := buildFilterClause(filter, "dsd", 1, true)
	countQuery := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM daily_stock_data dsd
		WHERE 1=1%s
	`, countClause)

	var total int
	err := r.db.GetContext(ctx, &total, countQuery, countArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("error counting stock items: %w", err)
	}

	selectClause, selectArgs, nextIdx := buildFilterClause(filter, "dsd", 1, true)
	query := fmt.Sprintf(`
		SELECT 
			COALESCE(dsd.product_id, 0) AS id,
			dsd.store_id,
			COALESCE(st.name, '') AS store_name,
			dsd.sku AS sku_id,
			dsd.sku AS sku_code,
			COALESCE(pr.name, '') AS product_name,
			dsd.brand_id,
			COALESCE(br.name, '') AS brand_name,
			COALESCE(dsd.stock, 0) AS current_stock,
			COALESCE(dsd.daily_sales, 0) AS daily_sales,
			%s AS days_of_cover,
			dsd."time"::date AS stock_date,
			COALESCE(dsd.updated_at, dsd.created_at) AS last_updated,
			%s AS stock_condition,
			COALESCE(pr.hpp, 0) AS hpp
		FROM daily_stock_data dsd
		LEFT JOIN stores st ON st.id = dsd.store_id
		LEFT JOIN products pr ON pr.id = dsd.product_id
		LEFT JOIN brands br ON br.id = dsd.brand_id
		WHERE 1=1%s
		ORDER BY dsd."time" DESC, dsd.store_id, dsd.product_id
	`, daysOfCoverExpression("dsd"), stockConditionExpression("dsd"), selectClause)

	if filter.PageSize > 0 {
		if filter.Page <= 0 {
			filter.Page = 1
		}
		offset := (filter.Page - 1) * filter.PageSize
		query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", nextIdx, nextIdx+1)
		selectArgs = append(selectArgs, filter.PageSize, offset)
	}

	var items []domain.StockHealth
	err = r.db.SelectContext(ctx, &items, query, selectArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("error getting stock items: %w", err)
	}

	return items, total, nil
}

func (r *stockHealthRepository) GetTimeSeriesData(ctx context.Context, days int, filter domain.StockHealthFilter) (map[string][]domain.TimeSeriesData, error) {
	args := []interface{}{days - 1}
	filterClause, filterArgs, _ := buildFilterClause(filter, "dsd", 2, false)
	args = append(args, filterArgs...)

	query := fmt.Sprintf(`
		WITH filtered AS (
			SELECT 
				dsd."time"::date AS stock_date,
				%s AS stock_condition
			FROM daily_stock_data dsd
			WHERE dsd."time"::date >= (current_date - ($1::int * INTERVAL '1 day'))%s
		),
		dates AS (
			SELECT date_trunc('day', current_date - (n * INTERVAL '1 day')) AS date
			FROM generate_series(0, $1::int) n
		),
		daily_counts AS (
			SELECT stock_date, stock_condition, COUNT(*) AS count
			FROM filtered
			GROUP BY stock_date, stock_condition
		)
		SELECT 
			to_char(d.date, 'YYYY-MM-DD') AS date,
			COALESCE(dc.stock_condition, 'out_of_stock') AS stock_condition,
			COALESCE(dc.count, 0) AS count
		FROM dates d
		LEFT JOIN daily_counts dc ON d.date = dc.stock_date
		ORDER BY d.date, dc.stock_condition
	`, stockConditionExpression("dsd"), filterClause)

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

func buildFilterClause(filter domain.StockHealthFilter, alias string, startIdx int, includeCondition bool) (string, []interface{}, int) {
	var conditions []string
	var args []interface{}
	idx := startIdx

	if len(filter.StoreIDs) > 0 {
		conditions = append(conditions, fmt.Sprintf("%s.store_id = ANY($%d::bigint[])", alias, idx))
		args = append(args, pq.Array(filter.StoreIDs))
		idx++
	}

	if len(filter.SKUIds) > 0 {
		conditions = append(conditions, fmt.Sprintf("%s.sku = ANY($%d::text[])", alias, idx))
		args = append(args, pq.Array(filter.SKUIds))
		idx++
	}

	if len(filter.BrandIDs) > 0 {
		conditions = append(conditions, fmt.Sprintf("%s.brand_id = ANY($%d::bigint[])", alias, idx))
		args = append(args, pq.Array(filter.BrandIDs))
		idx++
	}

	if filter.StockDate != "" {
		conditions = append(conditions, fmt.Sprintf("%s.\"time\"::date = $%d::date", alias, idx))
		args = append(args, filter.StockDate)
		idx++
	}

	if includeCondition && filter.Condition != "" {
		conditions = append(conditions, fmt.Sprintf("(%s) = $%d", stockConditionExpression(alias), idx))
		args = append(args, filter.Condition)
		idx++
	}

	clause := ""
	if len(conditions) > 0 {
		clause = " AND " + strings.Join(conditions, " AND ")
	}

	return clause, args, idx
}

func daysOfCoverExpression(alias string) string {
	return fmt.Sprintf(`COALESCE(CASE WHEN %s.daily_sales IS NULL OR %s.daily_sales = 0 THEN 0 ELSE FLOOR(%s.stock / NULLIF(%s.daily_sales, 0))::int END, 0)`,
		alias, alias, alias, alias)
}

func stockConditionExpression(alias string) string {
	coverExpr := daysOfCoverExpression(alias)
	return fmt.Sprintf(`CASE
		WHEN COALESCE(%s.stock, 0) <= 0 OR COALESCE(%s.daily_sales, 0) <= 0 THEN 'out_of_stock'
		WHEN %s > 31 THEN 'overstock'
		WHEN %s >= 21 THEN 'healthy'
		WHEN %s >= 7 THEN 'low'
		WHEN %s >= 1 THEN 'nearly_out'
		ELSE 'out_of_stock'
	END`,
		alias, alias, coverExpr, coverExpr, coverExpr, coverExpr)
}
