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

	// Totals across all statuses (global unique aggregates)
	totals, err := r.GetLatestSnapshotTotals(ctx, filter)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch totals")
		return nil, fmt.Errorf("failed to get totals: %w", err)
	}
	summary.Totals = totals

	// 2. Lifecycle Funnel derived from status summaries
	for _, s := range statusSummaries {
		summary.LifecycleFunnel = append(summary.LifecycleFunnel, domain.POLifecycleFunnel{
			Stage:      s.Status,
			Count:      s.Count,
			TotalValue: s.TotalValue,
		})
	}

	// 3. Trends (default interval day)
	trends, err := r.GetPOTrendWithFilter(ctx, "day", filter)
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
	perf, err := r.GetSupplierPerformanceWithFilter(ctx, filter, defaultSupplierPerformanceLimit)
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
	statusExpr := buildDerivedStatusCase("fs.")
	statusTimestampExpr := buildDerivedStatusTimestampCase("fs.", "time")

	// Always compute status summaries from the latest snapshot date in the
	// database (MAX(time::date)), regardless of filters. Filters like po_type and
	// released_date only constrain which POs are included, not which snapshot day
	// is used. This ensures status_summaries always represent the current state
	// of the filtered cohort as of the latest snapshot, matching the "today"
	// point in the trends series.
	query := fmt.Sprintf(`
	        WITH filtered_snapshots AS (
	            SELECT *
	            FROM po_snapshots s
	            WHERE s.po_number <> '' %s
	        ),
	        latest_day AS (
	            SELECT MAX(time::date) AS latest_date
	            FROM filtered_snapshots
	        ),
	        latest_snapshot AS (
	            SELECT 
	                po_number,
	                sku,
	                MAX(time) AS latest_time
	            FROM filtered_snapshots
	            WHERE time::date = (SELECT latest_date FROM latest_day)
	            GROUP BY po_number, sku
	        ),
	        po_values AS (
	            SELECT
	                fs.po_number,
	                fs.sku,
	                CONCAT(fs.po_number, '::', fs.sku) AS po_sku_identifier,
	                %s AS status_code,
	                COALESCE(fs.quantity_ordered, 0) AS quantity_ordered,
	                COALESCE(fs.total_amount, 0) AS total_amount,
	                %s AS status_change_at
	            FROM filtered_snapshots fs
	            JOIN latest_snapshot ls ON fs.po_number = ls.po_number AND fs.sku = ls.sku AND fs.time = ls.latest_time
	        )
	        SELECT 
	            status_code,
	            COUNT(DISTINCT po_number) as po_count,
	            COUNT(DISTINCT po_sku_identifier) as sku_count,
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

func (r *poRepository) GetLatestSnapshotTotals(ctx context.Context, filter *domain.DashboardFilter) (*domain.PODashboardTotals, error) {
	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
        WITH filtered_snapshots AS (
            SELECT *
            FROM po_snapshots s
            WHERE s.po_number <> '' %s
        ),
        latest_day AS (
            SELECT MAX(time::date) AS latest_date
            FROM filtered_snapshots
        ),
        latest_snapshot AS (
            SELECT 
                po_number,
                sku,
                MAX(time) AS latest_time
            FROM filtered_snapshots
            WHERE time::date = (SELECT latest_date FROM latest_day)
            GROUP BY po_number, sku
        ),
        current_snapshots AS (
            SELECT fs.*
            FROM filtered_snapshots fs
            JOIN latest_snapshot ls 
              ON fs.po_number = ls.po_number 
             AND fs.sku = ls.sku 
             AND fs.time = ls.latest_time
        )
        SELECT 
            COUNT(DISTINCT cs.po_number) as total_pos,
            COUNT(DISTINCT cs.sku) as total_sku,
            COALESCE(SUM(cs.quantity_ordered), 0) as total_qty,
            COALESCE(SUM(cs.total_amount), 0) as total_value
        FROM current_snapshots cs
    `, filterClause)

	type totalsRow struct {
		TotalPOs   int     `db:"total_pos"`
		TotalSKU   int     `db:"total_sku"`
		TotalQty   int     `db:"total_qty"`
		TotalValue float64 `db:"total_value"`
	}

	var row totalsRow
	if err := r.db.GetContext(ctx, &row, query, filterArgs...); err != nil {
		return nil, fmt.Errorf("failed to fetch dashboard totals: %w", err)
	}

	return &domain.PODashboardTotals{
		TotalPOs:   row.TotalPOs,
		TotalSKU:   row.TotalSKU,
		TotalQty:   row.TotalQty,
		TotalValue: row.TotalValue,
	}, nil
}

func (r *poRepository) GetPOSnapshotStatusSummaryRaw(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, error) {
	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
        WITH filtered_snapshots AS (
            SELECT *
            FROM po_snapshots s
            WHERE s.po_number <> '' %s
        ),
        latest_day AS (
            SELECT MAX(time::date) AS latest_date
            FROM filtered_snapshots
        ),
        latest_snapshot AS (
            SELECT 
                po_number,
                sku,
                MAX(time) AS latest_time
            FROM filtered_snapshots
            WHERE time::date = (SELECT latest_date FROM latest_day)
            GROUP BY po_number, sku
        ),
        current_snapshots AS (
            SELECT fs.*
            FROM filtered_snapshots fs
            JOIN latest_snapshot ls 
              ON fs.po_number = ls.po_number 
             AND fs.sku = ls.sku 
             AND fs.time = ls.latest_time
        )
        SELECT 
            COALESCE(cs.status, -1) AS status_code,
            COUNT(DISTINCT cs.po_number) as po_count,
            COUNT(DISTINCT cs.sku) as sku_count,
            COALESCE(SUM(cs.quantity_ordered), 0) as total_qty,
            COALESCE(SUM(cs.total_amount), 0) as total_value
        FROM current_snapshots cs
        WHERE COALESCE(cs.status, -1) IN (0,1,2,3,4,5,9)
        GROUP BY COALESCE(cs.status, -1)
        ORDER BY COALESCE(cs.status, -1)
    `, filterClause)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard: raw status summaries applying filter")
	}

	type rawRow struct {
		StatusCode int     `db:"status_code"`
		POCount    int     `db:"po_count"`
		SKUCount   int     `db:"sku_count"`
		TotalQty   int     `db:"total_qty"`
		TotalValue float64 `db:"total_value"`
	}

	var rows []rawRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, filterArgs...); err != nil {
		return nil, fmt.Errorf("failed to fetch raw status summaries: %w", err)
	}

	rowMap := make(map[int]rawRow, len(rows))
	for _, row := range rows {
		rowMap[row.StatusCode] = row
	}

	summaries := make([]domain.POStatusSummary, 0, len(domain.POStatusOrder))
	for _, statusCode := range domain.POStatusOrder {
		row := rowMap[statusCode]
		summaries = append(summaries, domain.POStatusSummary{
			Status:     domain.POStatusLabel(statusCode),
			Count:      row.POCount,
			SKUCount:   row.SKUCount,
			TotalQty:   row.TotalQty,
			TotalValue: row.TotalValue,
			AvgDays:    0,
			DiffDays:   0,
		})
	}

	return summaries, nil
}

// GetDashboardSummaryV2 aggregates dashboard data using pure status column grouping (not derived from timestamps)
func (r *poRepository) GetDashboardSummaryV2(ctx context.Context, filter *domain.DashboardFilter) (*domain.DashboardSummary, error) {
	summary := &domain.DashboardSummary{}

	if filter != nil {
		log.Debug().Interface("filter", filter).Msg("po dashboard v2: fetching summary with filter")
	} else {
		log.Debug().Msg("po dashboard v2: fetching summary without filter")
	}

	// 1. Status Summaries - using pure status column
	statusSummaries, err := r.GetStatusSummariesByStatusColumnV2(ctx, filter)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard v2: failed to fetch status summaries")
		return nil, fmt.Errorf("failed to get status summaries: %w", err)
	}
	summary.StatusSummaries = statusSummaries

	// Totals across all statuses (global unique aggregates)
	totals, err := r.GetLatestSnapshotTotals(ctx, filter)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard v2: failed to fetch totals")
		return nil, fmt.Errorf("failed to get totals: %w", err)
	}
	summary.Totals = totals

	// 2. Lifecycle Funnel derived from status summaries
	for _, s := range statusSummaries {
		summary.LifecycleFunnel = append(summary.LifecycleFunnel, domain.POLifecycleFunnel{
			Stage:      s.Status,
			Count:      s.Count,
			TotalValue: s.TotalValue,
		})
	}

	// 3. Trends (default interval day) - using pure status column
	trends, err := r.GetPOTrendWithFilterV2(ctx, "day", filter)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard v2: failed to fetch trends")
		return nil, fmt.Errorf("failed to get trends: %w", err)
	}
	summary.Trends = trends

	// 4. Aging - using pure status column
	aging, err := r.GetPOAgingWithFilterV2(ctx, filter, defaultAgingSummaryLimit)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard v2: failed to fetch aging data")
		return nil, fmt.Errorf("failed to get aging: %w", err)
	}
	summary.Aging = aging

	// 5. Supplier Performance
	perf, err := r.GetSupplierPerformanceWithFilter(ctx, filter, defaultSupplierPerformanceLimit)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard v2: failed to fetch supplier performance")
		return nil, fmt.Errorf("failed to get supplier performance: %w", err)
	}
	summary.SupplierPerformance = perf

	return summary, nil
}

// GetStatusSummariesByStatusColumnV2 groups purely by status column (0-5, 9) without deriving from timestamps
func (r *poRepository) GetStatusSummariesByStatusColumnV2(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, error) {
	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
        WITH filtered_snapshots AS (
            SELECT *
            FROM po_snapshots s
            WHERE s.po_number <> '' %s
        ),
        latest_day AS (
            SELECT MAX(time::date) AS latest_date
            FROM filtered_snapshots
        ),
        latest_snapshot AS (
            SELECT 
                po_number,
                sku,
                MAX(time) AS latest_time
            FROM filtered_snapshots
            WHERE time::date = (SELECT latest_date FROM latest_day)
            GROUP BY po_number, sku
        ),
        po_values AS (
            SELECT
                fs.po_number,
                fs.sku,
                COALESCE(fs.status, -1) AS status_code,
                COALESCE(fs.quantity_ordered, 0) AS quantity_ordered,
                COALESCE(fs.total_amount, 0) AS total_amount,
                CASE 
                    WHEN COALESCE(fs.status, -1) = 0 THEN fs.po_released_at
                    WHEN COALESCE(fs.status, -1) = 1 THEN fs.po_approved_at
                    WHEN COALESCE(fs.status, -1) = 2 THEN fs.po_approved_at
                    WHEN COALESCE(fs.status, -1) = 3 THEN fs.po_received_at
                    WHEN COALESCE(fs.status, -1) = 4 THEN fs.po_sent_at
                    WHEN COALESCE(fs.status, -1) = 5 THEN fs.po_arrived_at
                    ELSE fs.time
                END AS status_change_at
            FROM filtered_snapshots fs
            JOIN latest_snapshot ls ON fs.po_number = ls.po_number AND fs.sku = ls.sku AND fs.time = ls.latest_time
        )
        SELECT 
            status_code,
            COUNT(DISTINCT po_number) as po_count,
            COUNT(DISTINCT sku) as sku_count,
            COALESCE(SUM(quantity_ordered), 0) as total_qty,
            COALESCE(SUM(total_amount), 0) as total_value,
            COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - status_change_at))/86400), 0) as avg_days,
            COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - status_change_at))/86400)::int, 0) as diff_days
        FROM po_values
        WHERE status_code IN (0,1,2,3,4,5,9)
        GROUP BY status_code
        ORDER BY status_code
    `, filterClause)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard v2: status summaries (by status column) applying filter")
	}

	var rows []statusSummaryRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, filterArgs...); err != nil {
		return nil, err
	}

	log.Debug().Int("status_rows", len(rows)).Msg("po dashboard v2: status summaries (by status column) fetched")

	rowMap := make(map[int]statusSummaryRow, len(rows))
	for _, row := range rows {
		rowMap[row.StatusCode] = row
	}

	results := make([]domain.POStatusSummary, 0, len(domain.POStatusOrder))
	for _, statusCode := range domain.POStatusOrder {
		row := rowMap[statusCode]
		results = append(results, domain.POStatusSummary{
			Status:     domain.POStatusLabel(statusCode),
			Count:      row.POCount,
			SKUCount:   row.SKUCount,
			TotalQty:   row.TotalQty,
			TotalValue: row.TotalValue,
			AvgDays:    row.AvgDays,
			DiffDays:   row.DiffDays,
		})
	}

	return results, nil
}

// GetPOTrendWithFilterV2 uses pure status column instead of derived status
func (r *poRepository) GetPOTrendWithFilterV2(ctx context.Context, interval string, filter *domain.DashboardFilter) ([]domain.POTrend, error) {
	type trendRow struct {
		Date       string `db:"date"`
		StatusCode int    `db:"status_code"`
		Count      int    `db:"count"`
	}

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

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
			Msg("po dashboard v2: invalid trend interval, defaulting to day")
	}

	query := fmt.Sprintf(`
        WITH bucketed AS (
            SELECT 
                %s AS bucket,
                COALESCE(s.status, -1) as status_code,
                s.po_number,
                s.sku
            FROM po_snapshots s
            WHERE s.time > NOW() - INTERVAL '%s' %s
              AND COALESCE(s.status, -1) IN (0,1,2,3,4,5,9)
        )
        SELECT 
            bucket::date::text as date,
            status_code,
            COUNT(DISTINCT po_number) as count
        FROM bucketed
        GROUP BY bucket, status_code
        ORDER BY bucket, status_code
    `, bucketExpr, timeWindow, filterClause)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard v2: trends applying filter")
	}

	var rows []trendRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, filterArgs...); err != nil {
		return nil, err
	}

	log.Debug().Int("trend_rows", len(rows)).Msg("po dashboard v2: trends fetched")

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

// GetPOAgingWithFilterV2 uses pure status column instead of derived status
func (r *poRepository) GetPOAgingWithFilterV2(ctx context.Context, filter *domain.DashboardFilter, limit int) ([]domain.POAging, error) {
	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
        WITH filtered_snapshots AS (
            SELECT *
            FROM po_snapshots s
            WHERE s.po_number <> '' %s
        ),
        latest_day AS (
            SELECT MAX(time::date) AS latest_date
            FROM filtered_snapshots
        ),
        latest_snapshot AS (
            SELECT 
                po_number,
                sku,
                MAX(time) AS latest_time
            FROM filtered_snapshots
            WHERE time::date = (SELECT latest_date FROM latest_day)
            GROUP BY po_number, sku
        ),
        po_aging AS (
            SELECT
                fs.po_number,
                COALESCE(fs.status, -1) AS status_code,
                fs.supplier_id,
                COALESCE(SUM(fs.quantity_ordered), 0) as po_qty,
                COALESCE(SUM(fs.total_amount), 0) as total_amount,
                COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - fs.time))/86400)::int, 0) as days_in_status,
                MAX(TO_CHAR(fs.po_released_at, 'YYYY-MM-DD HH24:MI:SS')) as po_released_at,
                MAX(TO_CHAR(fs.po_sent_at, 'YYYY-MM-DD HH24:MI:SS')) as po_sent_at,
                MAX(TO_CHAR(fs.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS')) as po_arrived_at,
                MAX(TO_CHAR(fs.po_received_at, 'YYYY-MM-DD HH24:MI:SS')) as po_received_at
            FROM filtered_snapshots fs
            JOIN latest_snapshot ls ON fs.po_number = ls.po_number AND fs.sku = ls.sku AND fs.time = ls.latest_time
            WHERE COALESCE(fs.status, -1) IN (0,1,2,3,4,5,9)
            GROUP BY fs.po_number, fs.status, fs.supplier_id
        ),
        limited_po_aging AS (
            SELECT 
                po_number,
                status_code,
                supplier_id,
                po_qty,
                total_amount,
                days_in_status,
                po_released_at,
                po_sent_at,
                po_arrived_at,
                po_received_at
            FROM po_aging
            ORDER BY days_in_status DESC
            LIMIT $%d
        )
        SELECT 
            lpa.po_number,
            lpa.status_code,
            COALESCE(sup.name, '') as supplier_name,
            lpa.po_qty,
            lpa.total_amount,
            lpa.days_in_status,
            lpa.po_released_at,
            lpa.po_sent_at,
            lpa.po_arrived_at,
            lpa.po_received_at
        FROM limited_po_aging lpa
        LEFT JOIN suppliers sup ON lpa.supplier_id = sup.id
        ORDER BY lpa.days_in_status DESC
    `, filterClause, len(filterArgs)+1)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard v2: aging applying filter")
	}

	type agingRow struct {
		PONumber     string  `db:"po_number"`
		StatusCode   int     `db:"status_code"`
		SupplierName string  `db:"supplier_name"`
		POQty        int     `db:"po_qty"`
		TotalAmount  float64 `db:"total_amount"`
		DaysInStatus int     `db:"days_in_status"`
		POReleasedAt *string `db:"po_released_at"`
		POSentAt     *string `db:"po_sent_at"`
		POArrivedAt  *string `db:"po_arrived_at"`
		POReceivedAt *string `db:"po_received_at"`
	}

	queryArgs := append(filterArgs, limit)
	var rows []agingRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, queryArgs...); err != nil {
		return nil, err
	}

	log.Debug().Int("aging_rows", len(rows)).Msg("po dashboard v2: aging fetched")

	results := make([]domain.POAging, len(rows))
	for i, row := range rows {
		results[i] = domain.POAging{
			PONumber:     row.PONumber,
			Status:       domain.POStatusLabel(row.StatusCode),
			SupplierName: row.SupplierName,
			Quantity:     row.POQty,
			Value:        row.TotalAmount,
			DaysInStatus: row.DaysInStatus,
			POReleasedAt: row.POReleasedAt,
			POSentAt:     row.POSentAt,
			POArrivedAt:  row.POArrivedAt,
			POReceivedAt: row.POReceivedAt,
		}
	}

	return results, nil
}

func (r *poRepository) GetPOTrend(ctx context.Context, interval string) ([]domain.POTrend, error) {
	return r.GetPOTrendWithFilterV2(ctx, interval, nil)
}

func (r *poRepository) GetPOTrendWithFilter(ctx context.Context, interval string, filter *domain.DashboardFilter) ([]domain.POTrend, error) {
	type trendRow struct {
		Date       string `db:"date"`
		StatusCode int    `db:"status_code"`
		Count      int    `db:"count"`
	}

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)
	statusExpr := "COALESCE(s.status, -1)"

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
	statusExpr := "COALESCE(s.status, -1)"
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
			),
			paginated_snapshots AS (
				SELECT
					s.po_number,
					s.sku,
					s.product_name,
					s.brand_id,
					s.store_id,
					s.supplier_id,
					s.unit_price,
					s.total_amount,
					s.quantity_ordered,
					s.quantity_received,
					s.po_released_at,
					s.po_sent_at,
					s.po_approved_at,
					s.po_arrived_at,
					s.time
				FROM po_snapshots s
				JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
				WHERE %s = $1
				ORDER BY %s %s
				LIMIT $%d OFFSET $%d
			)
			SELECT
				p.po_number,
				COALESCE(b.name, '') as brand_name,
				p.sku,
				p.product_name,
				COALESCE(st.name, '') as store_name,
				p.supplier_id,
				COALESCE(sup.name, '') as supplier_name,
				p.unit_price,
				p.total_amount,
				p.quantity_ordered as po_qty,
				p.quantity_received as received_qty,
				TO_CHAR(p.po_released_at, 'YYYY-MM-DD HH24:MI:SS') as po_released_at,
				TO_CHAR(p.po_sent_at, 'YYYY-MM-DD HH24:MI:SS') as po_sent_at,
				TO_CHAR(p.po_approved_at, 'YYYY-MM-DD HH24:MI:SS') as po_approved_at,
				TO_CHAR(p.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') as po_arrived_at,
				TO_CHAR(p.time, 'YYYY-MM-DD HH24:MI:SS') as snapshot_time
			FROM paginated_snapshots p
			LEFT JOIN brands b ON p.brand_id = b.id
			LEFT JOIN stores st ON p.store_id = st.id
			LEFT JOIN suppliers sup ON p.supplier_id = sup.id
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
			),
			paginated_snapshots AS (
				SELECT
					s.po_number,
					s.sku,
					s.product_name,
					s.brand_id,
					s.store_id,
					s.supplier_id,
					s.unit_price,
					s.total_amount,
					s.quantity_ordered,
					s.quantity_received,
					s.po_released_at,
					s.po_sent_at,
					s.po_approved_at,
					s.po_arrived_at,
					s.time
				FROM po_snapshots s
				JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
				WHERE %s = $1
				ORDER BY %s %s
				LIMIT $%d OFFSET $%d
			)
			SELECT
				p.po_number,
				COALESCE(b.name, '') as brand_name,
				p.sku,
				p.product_name,
				COALESCE(st.name, '') as store_name,
				p.supplier_id,
				COALESCE(sup.name, '') as supplier_name,
				p.unit_price,
				p.total_amount,
				p.quantity_ordered as po_qty,
				p.quantity_received as received_qty,
				TO_CHAR(p.po_released_at, 'YYYY-MM-DD HH24:MI:SS') as po_released_at,
				TO_CHAR(p.po_sent_at, 'YYYY-MM-DD HH24:MI:SS') as po_sent_at,
				TO_CHAR(p.po_approved_at, 'YYYY-MM-DD HH24:MI:SS') as po_approved_at,
				TO_CHAR(p.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') as po_arrived_at,
				TO_CHAR(p.time, 'YYYY-MM-DD HH24:MI:SS') as snapshot_time
			FROM paginated_snapshots p
			LEFT JOIN brands b ON p.brand_id = b.id
			LEFT JOIN stores st ON p.store_id = st.id
			LEFT JOIN suppliers sup ON p.supplier_id = sup.id
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
			WHERE %s = COALESCE(NULLIF($1, -1), s.status)
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
			WHERE %s = COALESCE(NULLIF($1, -1), s.status)
		`, filterClause, statusExpr)
	}

	countArgs := make([]interface{}, 0, len(filterArgs)+1)
	countArgs = append(countArgs, statusCode)
	countArgs = append(countArgs, filterArgs...)

	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, countArgs...); err != nil {
		log.Error().Err(err).Int("status_code", statusCode).Msg("failed to count PO snapshot items")
		return nil, fmt.Errorf("failed to count items: %w", err)
	}

	queryArgs := make([]interface{}, 0, len(filterArgs)+2)
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
			WHERE %s = COALESCE(NULLIF($1, -1), s.status)
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
			WHERE %s = COALESCE(NULLIF($1, -1), s.status)
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

// GetDashboardTotals returns aggregated totals frxwom the latest snapshot
func (r *poRepository) GetDashboardTotals(ctx context.Context, filter *domain.DashboardFilter) (*domain.PODashboardTotals, error) {
	return r.GetLatestSnapshotTotals(ctx, filter)
}
