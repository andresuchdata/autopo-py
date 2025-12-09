package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/jmoiron/sqlx"
	"github.com/rs/zerolog/log"
)

type poSnapshotTotals struct {
	TotalItems int     `db:"total_items"`
	TotalPOs   int     `db:"total_pos"`
	TotalQty   int     `db:"total_qty"`
	TotalValue float64 `db:"total_value"`
}

// GetDashboardSummary aggregates all dashboard data applying optional filters
func (r *poRepository) GetDashboardSummary(ctx context.Context, filter *domain.DashboardFilter) (*domain.DashboardSummary, error) {
	summary := &domain.DashboardSummary{}

	if filter != nil {
		log.Debug().Interface("filter", filter).Msg("po dashboard: fetching summary with filter")
	} else {
		log.Debug().Msg("po dashboard: fetching summary without filter")
	}

	// 1. Status Summaries
	statusSummaries, err := r.getStatusSummariesByDate(ctx, filter)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch status summaries")
		return nil, fmt.Errorf("failed to get status summaries: %w", err)
	}
	summary.StatusSummaries = statusSummaries

	// 2. Lifecycle Funnel derived from status summaries
	for _, s := range statusSummaries {
		summary.LifecycleFunnel = append(summary.LifecycleFunnel, domain.POLifecycleFunnel{
			Stage:      s.Status,
			Count:      s.Count,
			TotalValue: s.TotalValue,
		})
	}

	// 3. Trends (default interval day)
	trends, err := r.getPOTrendWithFilter(ctx, "day", filter)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch trends")
		return nil, fmt.Errorf("failed to get trends: %w", err)
	}
	summary.Trends = trends

	// 4. Aging
	aging, err := r.getPOAgingWithFilter(ctx, filter, defaultAgingSummaryLimit)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch aging data")
		return nil, fmt.Errorf("failed to get aging: %w", err)
	}
	summary.Aging = aging

	// 5. Supplier Performance
	perf, err := r.getSupplierPerformanceWithFilter(ctx, filter, defaultSupplierPerformanceLimit)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch supplier performance")
		return nil, fmt.Errorf("failed to get supplier performance: %w", err)
	}
	summary.SupplierPerformance = perf

	return summary, nil
}

type statusSummaryRow struct {
	StatusCode int     `db:"status_code"`
	POCount    int     `db:"po_count"`
	SKUCount   int     `db:"sku_count"`
	TotalQty   int     `db:"total_qty"`
	TotalValue float64 `db:"total_value"`
	AvgDays    float64 `db:"avg_days"`
	DiffDays   int     `db:"diff_days"`
}

func (r *poRepository) getStatusSummariesByDate(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, error) {
	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)
	statusExpr := buildDerivedStatusCase("s.")
	statusTimestampExpr := buildDerivedStatusTimestampCase("s.", "time")

	// Always compute status summaries from the latest snapshot date in the
	// database (MAX(time::date)), regardless of filters. Filters like po_type and
	// released_date only constrain which POs are included, not which snapshot day
	// is used. This ensures status_summaries always represent the current state
	// of the filtered cohort as of the latest snapshot, matching the "today"
	// point in the trends series.
	query := fmt.Sprintf(`
	        WITH latest_day AS (
	            SELECT MAX(time::date) AS latest_date
	            FROM po_snapshots
	        ),
	        latest_snapshot AS (
	            SELECT 
	                po_number,
	                sku,
	                MAX(time) AS latest_time
	            FROM po_snapshots s
	            JOIN latest_day d ON s.time::date = d.latest_date
	            WHERE po_number <> '' %s
	            GROUP BY po_number, sku
	        ),
	        po_values AS (
	            SELECT
	                s.po_number,
	                CONCAT(s.po_number, '::', s.sku) AS po_sku_identifier,
	                %s AS status_code,
	                COALESCE(s.quantity_ordered, 0) AS quantity_ordered,
	                COALESCE(s.total_amount, 0) AS total_amount,
	                %s AS status_change_at
	            FROM po_snapshots s
	            JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
	        )
	        SELECT 
	            status_code,
	            COUNT(DISTINCT po_number) as po_count,
	            COUNT(po_sku_identifier) as sku_count,
	            COALESCE(SUM(quantity_ordered), 0) as total_qty,
	            COALESCE(SUM(total_amount), 0) as total_value,
	            COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - status_change_at))/86400), 0) as avg_days,
	            COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - status_change_at))/86400)::int, 0) as diff_days
	        FROM po_values
	        GROUP BY status_code
	        ORDER BY status_code
	    `, filterClause, statusExpr, statusTimestampExpr)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard: status summaries (by date) applying filter")
	}

	var rows []statusSummaryRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, filterArgs...); err != nil {
		return nil, err
	}

	log.Debug().Int("status_rows", len(rows)).Msg("po dashboard: status summaries (by date) fetched")

	results := make([]domain.POStatusSummary, len(rows))
	for i, row := range rows {
		results[i] = domain.POStatusSummary{
			Status:     domain.POStatusLabel(row.StatusCode),
			Count:      row.POCount,
			SKUCount:   row.SKUCount,
			TotalQty:   row.TotalQty,
			TotalValue: row.TotalValue,
			AvgDays:    row.AvgDays,
			DiffDays:   row.DiffDays,
		}
	}

	return results, nil
}

func (r *poRepository) GetPOTrend(ctx context.Context, interval string) ([]domain.POTrend, error) {
	return r.getPOTrendWithFilter(ctx, interval, nil)
}

func (r *poRepository) getPOTrendWithFilter(ctx context.Context, interval string, filter *domain.DashboardFilter) ([]domain.POTrend, error) {
	type trendRow struct {
		Date       string `db:"date"`
		StatusCode int    `db:"status_code"`
		Count      int    `db:"count"`
	}

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)
	statusExpr := buildDerivedStatusCase("s.")

	bucketExpr := "date_trunc('day', s.time)"
	timeWindow := "30 days"

	switch strings.ToLower(interval) {
	case "week":
		bucketExpr = "date_trunc('week', s.time)"
		timeWindow = "12 weeks"
	case "month":
		bucketExpr = "date_trunc('month', s.time)"
		timeWindow = "12 months"
	case "day":
		// keep defaults
	default:
		log.Warn().
			Str("interval", interval).
			Msg("po dashboard: invalid trend interval, defaulting to day")
	}

	query := fmt.Sprintf(`
        WITH bucketed AS (
            SELECT 
                %s AS bucket,
                %s as status_code,
                s.po_number,
                s.sku
            FROM po_snapshots s
            WHERE s.time > NOW() - INTERVAL '%s' %s
        )
        SELECT 
            bucket::date::text as date,
            status_code,
            COUNT(DISTINCT po_number) as count
        FROM bucketed
        GROUP BY bucket, status_code
        ORDER BY bucket, status_code
    `, bucketExpr, statusExpr, timeWindow, filterClause)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard: trends applying filter")
	}

	var rows []trendRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, filterArgs...); err != nil {
		return nil, err
	}

	log.Debug().Int("trend_rows", len(rows)).Msg("po dashboard: trends fetched")

	results := make([]domain.POTrend, len(rows))
	for i, row := range rows {
		results[i] = domain.POTrend{
			Date:   row.Date,
			Status: domain.POStatusLabel(row.StatusCode),
			Count:  row.Count,
		}
	}

	return results, nil
}

// GetPOSnapshotItems fetches PO snapshot items filtered by status with pagination and sorting
func (r *poRepository) GetPOSnapshotItems(ctx context.Context, statusCode int, page, pageSize int, sortField, sortDirection string, filter *domain.DashboardFilter) (*domain.POSnapshotItemsResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	validSortFields := map[string]bool{
		"snapshot_time": true,
		"po_number":     true,
		"brand_name":    true,
		"sku":           true,
		"product_name":  true,
		"store_name":    true,
		"unit_price":    true,
		"total_amount":  true,
		"po_qty":        true,
	}
	if !validSortFields[sortField] {
		sortField = "po_number"
	}

	if sortDirection != "asc" && sortDirection != "desc" {
		sortDirection = "asc"
	}

	offset := (page - 1) * pageSize

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 2)
	statusExpr := buildDerivedStatusCase("s.")
	useLatestDay := filter == nil || filter.ReleasedDate == ""

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Int("status_code", statusCode).
			Msg("po dashboard: snapshot items applying filter")
	}

	var query string
	if useLatestDay {
		query = fmt.Sprintf(`
			WITH latest_day AS (
			    SELECT MAX(time::date) AS latest_date
			    FROM po_snapshots
			),
			latest_snapshot AS (
				SELECT 
					po_number,
					sku,
					MAX(time) AS latest_time
				FROM po_snapshots s
				JOIN latest_day d ON s.time::date = d.latest_date
				WHERE s.po_number <> '' %s
				GROUP BY po_number, sku
			)
			SELECT
				s.po_number,
				COALESCE(b.name, '') as brand_name,
				s.sku,
				s.product_name,
				COALESCE(st.name, '') as store_name,
				s.unit_price,
				s.total_amount,
				s.quantity_ordered as po_qty,
				s.quantity_received as received_qty,
				TO_CHAR(s.po_released_at, 'YYYY-MM-DD HH24:MI:SS') as po_released_at,
				TO_CHAR(s.po_sent_at, 'YYYY-MM-DD HH24:MI:SS') as po_sent_at,
				TO_CHAR(s.po_approved_at, 'YYYY-MM-DD HH24:MI:SS') as po_approved_at,
				TO_CHAR(s.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') as po_arrived_at,
				TO_CHAR(s.time, 'YYYY-MM-DD HH24:MI:SS') as snapshot_time
			FROM po_snapshots s
			JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
			LEFT JOIN brands b ON s.brand_id = b.id
			LEFT JOIN stores st ON s.store_id = st.id
			WHERE %s = $1
			ORDER BY %s %s
			LIMIT $%d OFFSET $%d
		`, filterClause, statusExpr, sortField, sortDirection, len(filterArgs)+2, len(filterArgs)+3)
	} else {
		query = fmt.Sprintf(`
			WITH latest_snapshot AS (
				SELECT 
					po_number,
					sku,
					MAX(time) AS latest_time
				FROM po_snapshots s
				WHERE s.po_number <> '' %s
				GROUP BY po_number, sku
			)
			SELECT
				s.po_number,
				COALESCE(b.name, '') as brand_name,
				s.sku,
				s.product_name,
				COALESCE(st.name, '') as store_name,
				s.unit_price,
				s.total_amount,
				s.quantity_ordered as po_qty,
				s.quantity_received as received_qty,
				TO_CHAR(s.po_released_at, 'YYYY-MM-DD HH24:MI:SS') as po_released_at,
				TO_CHAR(s.po_sent_at, 'YYYY-MM-DD HH24:MI:SS') as po_sent_at,
				TO_CHAR(s.po_approved_at, 'YYYY-MM-DD HH24:MI:SS') as po_approved_at,
				TO_CHAR(s.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') as po_arrived_at,
				TO_CHAR(s.time, 'YYYY-MM-DD HH24:MI:SS') as snapshot_time
			FROM po_snapshots s
			JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
			LEFT JOIN brands b ON s.brand_id = b.id
			LEFT JOIN stores st ON s.store_id = st.id
			WHERE %s = $1
			ORDER BY %s %s
			LIMIT $%d OFFSET $%d
		`, filterClause, statusExpr, sortField, sortDirection, len(filterArgs)+2, len(filterArgs)+3)
	}

	var countQuery string
	if useLatestDay {
		countQuery = fmt.Sprintf(`
			WITH latest_day AS (
			    SELECT MAX(time::date) AS latest_date
			    FROM po_snapshots
			),
			latest_snapshot AS (
				SELECT 
					po_number,
					sku,
					MAX(time) AS latest_time
				FROM po_snapshots s
				JOIN latest_day d ON s.time::date = d.latest_date
				WHERE s.po_number <> '' %s
				GROUP BY po_number, sku
			)
			SELECT COUNT(*)
			FROM po_snapshots s
			JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
			WHERE %s = $1
		`, filterClause, statusExpr)
	} else {
		countQuery = fmt.Sprintf(`
			WITH latest_snapshot AS (
				SELECT 
					po_number,
					sku,
					MAX(time) AS latest_time
				FROM po_snapshots s
				WHERE s.po_number <> '' %s
				GROUP BY po_number, sku
			)
			SELECT COUNT(*)
			FROM po_snapshots s
			JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
			WHERE %s = $1
		`, filterClause, statusExpr)
	}

	countArgs := []interface{}{statusCode}
	countArgs = append(countArgs, filterArgs...)

	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, countArgs...); err != nil {
		log.Error().Err(err).Int("status_code", statusCode).Msg("failed to count PO snapshot items")
		return nil, fmt.Errorf("failed to count items: %w", err)
	}

	queryArgs := []interface{}{statusCode}
	queryArgs = append(queryArgs, filterArgs...)
	queryArgs = append(queryArgs, pageSize, offset)

	var totalsQuery string
	if useLatestDay {
		totalsQuery = fmt.Sprintf(`
			WITH latest_day AS (
			    SELECT MAX(time::date) AS latest_date
			    FROM po_snapshots
			),
			latest_snapshot AS (
				SELECT 
					po_number,
					sku,
					MAX(time) AS latest_time
				FROM po_snapshots s
				JOIN latest_day d ON s.time::date = d.latest_date
				WHERE s.po_number <> '' %s
				GROUP BY po_number, sku
			)
			SELECT 
				COUNT(*) as total_items,
				COUNT(DISTINCT s.po_number) as total_pos,
				COALESCE(SUM(s.quantity_ordered), 0) as total_qty,
				COALESCE(SUM(s.total_amount), 0) as total_value
			FROM po_snapshots s
			JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
			WHERE %s = $1
		`, filterClause, statusExpr)
	} else {
		totalsQuery = fmt.Sprintf(`
			WITH latest_snapshot AS (
				SELECT 
					po_number,
					sku,
					MAX(time) AS latest_time
				FROM po_snapshots s
				WHERE s.po_number <> '' %s
				GROUP BY po_number, sku
			)
			SELECT 
				COUNT(*) as total_items,
				COUNT(DISTINCT s.po_number) as total_pos,
				COALESCE(SUM(s.quantity_ordered), 0) as total_qty,
				COALESCE(SUM(s.total_amount), 0) as total_value
			FROM po_snapshots s
			JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
			WHERE %s = $1
		`, filterClause, statusExpr)
	}

	var totals poSnapshotTotals
	if err := r.db.GetContext(ctx, &totals, totalsQuery, countArgs...); err != nil {
		log.Error().Err(err).Int("status_code", statusCode).Msg("failed to fetch totals for PO snapshot items")
		return nil, fmt.Errorf("failed to fetch totals: %w", err)
	}

	var items []domain.POSnapshotItem
	if err := sqlx.SelectContext(ctx, r.db, &items, query, queryArgs...); err != nil {
		log.Error().Err(err).Int("status_code", statusCode).Msg("failed to fetch PO snapshot items")
		return nil, fmt.Errorf("failed to fetch items: %w", err)
	}

	totalPages := (total + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}

	resp := &domain.POSnapshotItemsResponse{
		Items:      items,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
		TotalPOs:   totals.TotalPOs,
		TotalQty:   totals.TotalQty,
		TotalValue: totals.TotalValue,
	}

	log.Debug().
		Int("status_code", statusCode).
		Int("items", len(items)).
		Int("total", total).
		Int("page", page).
		Int("page_size", pageSize).
		Msg("po dashboard: snapshot items fetched")

	return resp, nil
}
