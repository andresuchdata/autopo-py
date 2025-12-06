package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/jmoiron/sqlx"
	"github.com/rs/zerolog/log"
)

// buildDashboardFilterClause constructs SQL filter clauses for dashboard queries
func buildDashboardFilterClause(filter *domain.DashboardFilter, alias string, startIndex int) (string, []interface{}) {
	if filter == nil {
		return "", nil
	}

	var clauses []string
	var args []interface{}
	idx := startIndex

	if filter.POType != "" {
		switch strings.ToUpper(filter.POType) {
		case "AU":
			clauses = append(clauses, fmt.Sprintf("%spo_number ILIKE $%d", alias, idx))
			args = append(args, "AU%")
			idx++
		case "PO":
			clauses = append(clauses, fmt.Sprintf("%spo_number ILIKE $%d", alias, idx))
			args = append(args, "PO%")
			idx++
		case "OTHERS":
			clauses = append(clauses, fmt.Sprintf("(%spo_number NOT ILIKE $%d AND %spo_number NOT ILIKE $%d)", alias, idx, alias, idx+1))
			args = append(args, "AU%", "PO%")
			idx += 2
		}
	}

	if filter.ReleasedDate != "" {
		clauses = append(clauses, fmt.Sprintf("DATE(%spo_released_at) = $%d", alias, idx))
		args = append(args, filter.ReleasedDate)
		idx++
	}

	if len(clauses) == 0 {
		return "", nil
	}

	return " AND " + strings.Join(clauses, " AND "), args
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
	statusSummaries, err := r.getStatusSummaries(ctx, filter)
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
	aging, err := r.getPOAgingWithFilter(ctx, filter)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch aging data")
		return nil, fmt.Errorf("failed to get aging: %w", err)
	}
	summary.Aging = aging

	// 5. Supplier Performance
	perf, err := r.getSupplierPerformanceWithFilter(ctx, filter)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch supplier performance")
		return nil, fmt.Errorf("failed to get supplier performance: %w", err)
	}
	summary.SupplierPerformance = perf

	return summary, nil
}

// GetSupplierPOItems fetches PO items filtered by supplier with pagination and sorting
func (r *poRepository) GetSupplierPOItems(ctx context.Context, supplierID int64, page, pageSize int, sortField, sortDirection string) (*domain.SupplierPOItemsResponse, error) {
	if supplierID <= 0 {
		return nil, fmt.Errorf("invalid supplier ID")
	}

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	validSortFields := map[string]string{
		"po_number":      "s.po_number",
		"sku":            "s.sku",
		"product_name":   "s.product_name",
		"brand_name":     "brand_name",
		"po_released_at": "s.po_released_at",
		"po_sent_at":     "s.po_sent_at",
		"po_approved_at": "s.po_approved_at",
		"po_arrived_at":  "s.po_arrived_at",
		"po_received_at": "s.po_received_at",
	}

	sortColumn, ok := validSortFields[sortField]
	if !ok {
		sortColumn = "s.po_number"
	}

	if strings.ToLower(sortDirection) != "desc" {
		sortDirection = "asc"
	} else {
		sortDirection = "desc"
	}

	offset := (page - 1) * pageSize

	orderClause := fmt.Sprintf("ORDER BY %s %s", sortColumn, sortDirection)

	query := fmt.Sprintf(`
		WITH latest_snapshot AS (
			SELECT
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots
			WHERE supplier_id = $1
			GROUP BY po_number, sku
		)
		SELECT
			s.po_number,
			s.sku,
			s.product_name,
			COALESCE(b.name, '') AS brand_name,
			s.supplier_id,
			COALESCE(sup.name, '') AS supplier_name,
			TO_CHAR(s.po_released_at, 'YYYY-MM-DD HH24:MI:SS') AS po_released_at,
			TO_CHAR(s.po_sent_at, 'YYYY-MM-DD HH24:MI:SS') AS po_sent_at,
			TO_CHAR(s.po_approved_at, 'YYYY-MM-DD HH24:MI:SS') AS po_approved_at,
			TO_CHAR(s.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') AS po_arrived_at,
			TO_CHAR(s.po_received_at, 'YYYY-MM-DD HH24:MI:SS') AS po_received_at
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
		LEFT JOIN brands b ON s.brand_id = b.id
		LEFT JOIN suppliers sup ON s.supplier_id = sup.id
		%s
		LIMIT $2 OFFSET $3
	`, orderClause)

	countQuery := `
		WITH latest_snapshot AS (
			SELECT
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots
			WHERE supplier_id = $1
			GROUP BY po_number, sku
		)
		SELECT COUNT(*)
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
	`

	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, supplierID); err != nil {
		log.Error().Err(err).Int64("supplier_id", supplierID).Msg("failed to count supplier PO items")
		return nil, fmt.Errorf("failed to count supplier PO items: %w", err)
	}

	items := make([]domain.SupplierPOItem, 0, pageSize)
	if err := sqlx.SelectContext(ctx, r.db, &items, query, supplierID, pageSize, offset); err != nil {
		log.Error().Err(err).Int64("supplier_id", supplierID).Msg("failed to fetch supplier PO items")
		return nil, fmt.Errorf("failed to fetch supplier PO items: %w", err)
	}

	totalPages := (total + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}

	resp := &domain.SupplierPOItemsResponse{
		Items:      items,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}

	log.Debug().
		Int64("supplier_id", supplierID).
		Int("items", len(items)).
		Int("total", total).
		Int("page", page).
		Int("page_size", pageSize).
		Msg("po dashboard: supplier items fetched")

	return resp, nil
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

type snapshotTotals struct {
	TotalItems int     `db:"total_items"`
	TotalPOs   int     `db:"total_pos"`
	TotalQty   int     `db:"total_qty"`
	TotalValue float64 `db:"total_value"`
}

func (r *poRepository) getStatusSummaries(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, error) {
	// Status mapping: 1: Draft, 2: Released, 3: Sent, 4: Approved, 5: Arrived, 6: Received
	// We need to join with purchase_order_items to get value?
	// purchase_orders table has po_qty, received_qty. It doesn't seem to have total_amount directly?
	// Wait, migration 003_add_po_snapshots.sql has total_amount in po_snapshots.
	// purchase_order_items has amount.
	// Let's calculate total value from items.

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
		WITH latest_snapshot AS (
			SELECT 
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots s
			WHERE po_number <> '' %s
			GROUP BY po_number, sku
		),
		po_values AS (
			SELECT
				s.po_number,
				CONCAT(s.po_number, '::', s.sku) AS po_sku_identifier,
				s.status AS status_code,
				COALESCE(s.quantity_ordered, 0) AS quantity_ordered,
				COALESCE(s.total_amount, 0) AS total_amount,
				COALESCE(
					NULLIF(s.po_released_at, NULL),
					NULLIF(s.po_sent_at, NULL),
					NULLIF(s.po_approved_at, NULL),
					NULLIF(s.po_arrived_at, NULL),
					NULLIF(s.po_received_at, NULL),
					s.time
				) AS status_change_at
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
	`, filterClause)
	// Note: "Avg Days in Status" is tricky without history.
	// If we use po_snapshots, we can get exact duration.
	// For now, let's use a simple "Days since creation" or "Days since status change" if we had that column.
	// The purchase_orders table has timestamps for each status: po_released_at, po_sent_at, etc.
	// We can calculate duration based on current status timestamp vs next status or now.
	// Let's refine the query to be more accurate if possible, or stick to simple for MVP.
	// The requirement says "Avg. Days in Status".

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard: status summaries applying filter")
	}

	var rows []statusSummaryRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, filterArgs...); err != nil {
		return nil, err
	}

	log.Debug().Int("status_rows", len(rows)).Msg("po dashboard: status summaries fetched")

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
	// Use po_snapshots for historical trend
	// Group by day and status (avoid TimescaleDB dependency)

	// Default to last 30 days
	type trendRow struct {
		Date       string `db:"date"`
		StatusCode int    `db:"status_code"`
		Count      int    `db:"count"`
	}

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
		WITH bucketed AS (
			SELECT 
				date_trunc('day', s.time) AS bucket,
				s.status as status_code,
				s.po_number,
				s.sku
			FROM po_snapshots s
			WHERE s.time > NOW() - INTERVAL '30 days' %s
		)
		SELECT 
			bucket::date::text as date,
			status_code,
			COUNT(DISTINCT CONCAT(po_number, '::', sku)) as count
		FROM bucketed
		GROUP BY bucket, status_code
		ORDER BY bucket, status_code
	`, filterClause)

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

type poAgingRow struct {
	PONumber     string  `db:"po_number"`
	StatusCode   int     `db:"status_code"`
	Quantity     int     `db:"po_qty"`
	TotalAmount  float64 `db:"total_amount"`
	DaysInStatus int     `db:"days_in_status"`
}

func (r *poRepository) GetPOAging(ctx context.Context) ([]domain.POAging, error) {
	return r.getPOAgingWithFilter(ctx, nil)
}

func (r *poRepository) getPOAgingWithFilter(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POAging, error) {
	// List POs that are not completed (e.g., not Received/Cancelled?)
	// Assuming status < 6 are active.

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
	        WITH latest_snapshot AS (
	            SELECT
	                po_number,
	                sku,
	                status,
	                quantity_ordered,
	                COALESCE(total_amount, 0) as total_amount,
	                po_released_at,
	                po_sent_at,
	                po_approved_at,
	                po_arrived_at,
	                po_received_at,
	                GREATEST(
	                    COALESCE(po_released_at, TIMESTAMP 'epoch'),
	                    COALESCE(po_sent_at, TIMESTAMP 'epoch'),
	                    COALESCE(po_approved_at, TIMESTAMP 'epoch'),
	                    COALESCE(po_arrived_at, TIMESTAMP 'epoch'),
	                    COALESCE(po_received_at, TIMESTAMP 'epoch'),
	                    time
	                ) as last_status_change_at
	            FROM (
	                SELECT *,
	                    ROW_NUMBER() OVER (PARTITION BY po_number, sku ORDER BY time DESC) as rn
	                FROM po_snapshots s
	                WHERE po_number <> '' %s
	            ) s
	            WHERE rn = 1
	        ),
	        po_aggregate AS (
	            SELECT
	                po_number,
	                MAX(status) as status_code,
	                SUM(quantity_ordered) as po_qty,
	                SUM(total_amount) as total_amount,
	                MAX(po_released_at) as po_released_at,
	                MAX(po_sent_at) as po_sent_at,
	                MAX(po_approved_at) as po_approved_at,
	                MAX(po_arrived_at) as po_arrived_at,
	                MAX(po_received_at) as po_received_at,
	                MAX(last_status_change_at) as last_status_change_at
	            FROM latest_snapshot
	            GROUP BY po_number
	        ),
	        po_days AS (
	            SELECT 
	                po_number,
	                status_code,
	                po_qty,
	                total_amount,
	                COALESCE(EXTRACT(DAY FROM (NOW() - COALESCE(
	                    CASE status_code
	                        WHEN 2 THEN po_released_at
	                        WHEN 3 THEN po_sent_at
	                        WHEN 4 THEN po_approved_at
	                        WHEN 5 THEN po_arrived_at
	                        WHEN 6 THEN po_received_at
	                        ELSE last_status_change_at
	                    END,
	                    last_status_change_at,
	                    NOW()
	                ))), 0)::int as days_in_status
	            FROM po_aggregate
	            WHERE status_code < 6
	        ),
	        ranked AS (
	            SELECT *,
	                ROW_NUMBER() OVER (PARTITION BY status_code ORDER BY days_in_status DESC, po_number ASC) as rn
	            FROM po_days
	        )
	        SELECT 
	            po_number,
	            status_code,
	            po_qty,
	            total_amount,
	            days_in_status
	        FROM ranked
	        WHERE rn = 1
	        ORDER BY status_code
	    `, filterClause)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard: aging applying filter")
	}

	var rows []poAgingRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, filterArgs...); err != nil {
		return nil, err
	}

	log.Debug().Int("aging_rows", len(rows)).Msg("po dashboard: aging fetched")

	results := make([]domain.POAging, len(rows))
	for i, row := range rows {
		results[i] = domain.POAging{
			PONumber:     row.PONumber,
			Status:       domain.POStatusLabel(row.StatusCode),
			Quantity:     row.Quantity,
			Value:        row.TotalAmount,
			DaysInStatus: row.DaysInStatus,
		}
	}

	return results, nil
}

func (r *poRepository) GetSupplierPerformance(ctx context.Context) ([]domain.SupplierPerformance, error) {
	return r.getSupplierPerformanceWithFilter(ctx, nil)
}

func (r *poRepository) getSupplierPerformanceWithFilter(ctx context.Context, filter *domain.DashboardFilter) ([]domain.SupplierPerformance, error) {
	// Lead time derived from PO snapshots: diff between PO sent and arrived timestamps

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
	        WITH latest_snapshot AS (
	            SELECT
	                po_number,
	                sku,
	                supplier_id,
	                po_sent_at,
	                po_arrived_at,
	                ROW_NUMBER() OVER (PARTITION BY po_number, sku ORDER BY time DESC) as rn
	            FROM po_snapshots s
	            WHERE s.po_number <> '' %s
	        ),
	        po_level AS (
	            SELECT
	                po_number,
	                MAX(supplier_id) as supplier_id,
	                MAX(po_sent_at) as po_sent_at,
	                MAX(po_arrived_at) as po_arrived_at
	            FROM latest_snapshot
	            WHERE rn = 1
	            GROUP BY po_number
	        ),
	        supplier_aggregated AS (
	            SELECT
	                supplier_id,
	                AVG(EXTRACT(EPOCH FROM (po_arrived_at - po_sent_at))/86400) as avg_lead_time
	            FROM po_level
	            WHERE supplier_id IS NOT NULL AND po_sent_at IS NOT NULL AND po_arrived_at IS NOT NULL
	            GROUP BY supplier_id
	        )
	        SELECT 
	            s.id as supplier_id,
	            s.name as supplier_name,
	            sa.avg_lead_time
	        FROM supplier_aggregated sa
	        JOIN suppliers s ON sa.supplier_id = s.id
	        ORDER BY sa.avg_lead_time ASC
	        LIMIT 5
	    `, filterClause)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Msg("po dashboard: supplier performance applying filter")
	}

	var results []domain.SupplierPerformance
	err := sqlx.SelectContext(ctx, r.db, &results, query, filterArgs...)
	if err == nil {
		log.Debug().Int("supplier_perf_rows", len(results)).Msg("po dashboard: supplier performance fetched")
	}
	return results, err
}

// GetPOSnapshotItems fetches PO snapshot items filtered by status with pagination and sorting
func (r *poRepository) GetPOSnapshotItems(ctx context.Context, statusCode int, page, pageSize int, sortField, sortDirection string, filter *domain.DashboardFilter) (*domain.POSnapshotItemsResponse, error) {
	// Validate and set defaults
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// Validate sort field
	validSortFields := map[string]bool{
		"po_number":    true,
		"brand_name":   true,
		"sku":          true,
		"product_name": true,
		"store_name":   true,
		"unit_price":   true,
		"total_amount": true,
		"po_qty":       true,
	}
	if !validSortFields[sortField] {
		sortField = "po_number"
	}

	// Validate sort direction
	if sortDirection != "asc" && sortDirection != "desc" {
		sortDirection = "asc"
	}

	offset := (page - 1) * pageSize

	// Build filter clause with table alias for CTE
	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 2)

	if filterClause != "" {
		log.Debug().
			Str("filter_clause", filterClause).
			Interface("filter_args", filterArgs).
			Int("status_code", statusCode).
			Msg("po dashboard: snapshot items applying filter")
	}

	// Query to get latest snapshots for the given status
	query := fmt.Sprintf(`
		WITH latest_snapshot AS (
			SELECT 
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots s
			WHERE status = $1%s
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
			TO_CHAR(s.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') as po_arrived_at
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
		LEFT JOIN brands b ON s.brand_id = b.id
		LEFT JOIN stores st ON s.store_id = st.id
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d
	`, filterClause, sortField, sortDirection, len(filterArgs)+2, len(filterArgs)+3)

	// Count query
	countQuery := fmt.Sprintf(`
		WITH latest_snapshot AS (
			SELECT 
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots s
			WHERE status = $1%s
			GROUP BY po_number, sku
		)
		SELECT COUNT(*)
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
	`, filterClause)

	// Build args for count query
	countArgs := []interface{}{statusCode}
	countArgs = append(countArgs, filterArgs...)

	// Execute count query
	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, countArgs...); err != nil {
		log.Error().Err(err).Int("status_code", statusCode).Msg("failed to count PO snapshot items")
		return nil, fmt.Errorf("failed to count items: %w", err)
	}

	// Build args for main query
	queryArgs := []interface{}{statusCode}
	queryArgs = append(queryArgs, filterArgs...)
	queryArgs = append(queryArgs, pageSize, offset)

	// Totals query
	totalsQuery := fmt.Sprintf(`
		WITH latest_snapshot AS (
			SELECT 
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots s
			WHERE status = $1%s
			GROUP BY po_number, sku
		)
		SELECT 
			COUNT(*) as total_items,
			COUNT(DISTINCT s.po_number) as total_pos,
			COALESCE(SUM(s.quantity_ordered), 0) as total_qty,
			COALESCE(SUM(s.total_amount), 0) as total_value
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
	`, filterClause)

	var totals snapshotTotals
	if err := r.db.GetContext(ctx, &totals, totalsQuery, countArgs...); err != nil {
		log.Error().Err(err).Int("status_code", statusCode).Msg("failed to fetch totals for PO snapshot items")
		return nil, fmt.Errorf("failed to fetch totals: %w", err)
	}

	// Execute main query
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
