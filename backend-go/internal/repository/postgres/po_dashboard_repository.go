package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

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

func normalizeAlias(alias string) string {
	if alias == "" {
		return ""
	}
	if !strings.HasSuffix(alias, ".") {
		return alias + "."
	}
	return alias
}

func buildDerivedStatusCase(alias string) string {
	normalized := normalizeAlias(alias)
	return fmt.Sprintf(`CASE
		WHEN %[1]sstatus = 2 THEN 2
		WHEN %[1]spo_received_at IS NOT NULL THEN 3
		WHEN %[1]spo_arrived_at IS NOT NULL THEN 5
		WHEN %[1]spo_approved_at IS NOT NULL THEN 1
		WHEN %[1]spo_sent_at IS NOT NULL THEN 4
		ELSE 0
	END`, normalized)
}

func buildDerivedStatusTimestampCase(alias, fallbackColumn string) string {
	normalized := normalizeAlias(alias)
	fallback := fallbackColumn
	switch {
	case fallback == "":
		fallback = fmt.Sprintf("%stime", normalized)
	case !strings.Contains(fallbackColumn, "."):
		fallback = fmt.Sprintf("%s%s", normalized, fallbackColumn)
	}

	return fmt.Sprintf(`CASE
		WHEN %[1]sstatus = 2 THEN %[2]s
		WHEN %[1]spo_received_at IS NOT NULL THEN %[1]spo_received_at
		WHEN %[1]spo_arrived_at IS NOT NULL THEN %[1]spo_arrived_at
		WHEN %[1]spo_approved_at IS NOT NULL THEN %[1]spo_approved_at
		WHEN %[1]spo_sent_at IS NOT NULL THEN %[1]spo_sent_at
		WHEN %[1]spo_released_at IS NOT NULL THEN %[1]spo_released_at
		ELSE %[2]s
	END`, normalized, fallback)
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
			  AND po_sent_at IS NOT NULL
			  AND po_arrived_at IS NOT NULL
			  AND po_sent_at > '2000-01-01'
			  AND po_arrived_at > '2000-01-01'
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
		WHERE s.po_sent_at IS NOT NULL
		  AND s.po_arrived_at IS NOT NULL
		  AND s.po_sent_at > '2000-01-01'
		  AND s.po_arrived_at > '2000-01-01'
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
			  AND po_sent_at IS NOT NULL
			  AND po_arrived_at IS NOT NULL
			  AND po_sent_at > '2000-01-01'
			  AND po_arrived_at > '2000-01-01'
			GROUP BY po_number, sku
		)
		SELECT COUNT(*)
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
		WHERE s.po_sent_at IS NOT NULL
		  AND s.po_arrived_at IS NOT NULL
		  AND s.po_sent_at > '2000-01-01'
		  AND s.po_arrived_at > '2000-01-01'
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

func (r *poRepository) getStatusSummariesByDate(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, error) {
	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)
	statusExpr := buildDerivedStatusCase("s.")
	statusTimestampExpr := buildDerivedStatusTimestampCase("s.", "time")

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
	// Use po_snapshots for historical trend
	// Group by day and derived status (avoid TimescaleDB dependency)

	// Default to last 30 days
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
	                supplier_id,
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
	                MAX(last_status_change_at) as last_status_change_at,
                    MAX(supplier_id) as supplier_id
	            FROM latest_snapshot
	            GROUP BY po_number
	        ),
	        po_days AS (
	            SELECT 
	                po_number,
	                status_code,
                    supplier_id,
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
		log.Debug().Msg("po dashboard: aging applying filter")
	}

	var rows []poAgingRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, filterArgs...); err != nil {
		return nil, err
	}

	results := make([]domain.POAging, len(rows))
	for i, row := range rows {
		results[i] = domain.POAging{
			PONumber:     row.PONumber,
			Status:       domain.POStatusLabel(row.StatusCode),
			Quantity:     row.Quantity,
			Value:        row.TotalAmount,
			DaysInStatus: row.DaysInStatus,
			// SupplierName not filled for legacy call, or fill empty
		}
	}
	return results, nil
}

func (r *poRepository) GetPOAgingItems(ctx context.Context, page, pageSize int, sortField, sortDirection, status string) (*domain.POAgingResponse, error) {
	// Validate pagination
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	// Validate sort
	validSortFields := map[string]string{
		"po_number":      "pd.po_number",
		"po_qty":         "pd.po_qty",
		"value":          "pd.total_amount",
		"days_in_status": "pd.days_in_status",
		"supplier_name":  "s.name",
		"status":         "pd.status_code",
	}
	sortCol, ok := validSortFields[sortField]
	if !ok {
		sortCol = "pd.days_in_status"
	}

	if sortDirection != "asc" && sortDirection != "desc" {
		sortDirection = "desc"
	}

	// Status Filter
	var statusClause string
	var args []interface{}
	idx := 1
	if status != "" && status != "ALL" {
		statusClause = fmt.Sprintf("AND pd.status_code = $%d", idx)
		sc, _ := domain.ParsePOStatus(status)
		args = append(args, sc)
		idx++
	}

	// CTE Query similar to legacy but simpler structure for pagination
	cte := `
        WITH latest_snapshot AS (
            SELECT po_number, sku, status, quantity_ordered, COALESCE(total_amount, 0) as total_amount, 
                   po_released_at, po_sent_at, po_approved_at, po_arrived_at, po_received_at, supplier_id,
                   GREATEST(COALESCE(po_released_at, 'epoch'), COALESCE(po_sent_at, 'epoch'), COALESCE(po_approved_at, 'epoch'), 
                            COALESCE(po_arrived_at, 'epoch'), COALESCE(po_received_at, 'epoch'), time) as last_status_change_at
            FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY po_number, sku ORDER BY time DESC) as rn
                FROM po_snapshots WHERE po_number <> ''
            ) s WHERE rn = 1
        ),
        po_aggregate AS (
            SELECT po_number, MAX(status) as status_code, SUM(quantity_ordered) as po_qty, SUM(total_amount) as total_amount,
                   MAX(po_released_at) as po_released_at, MAX(po_sent_at) as po_sent_at, MAX(po_approved_at) as po_approved_at, 
                   MAX(po_arrived_at) as po_arrived_at, MAX(po_received_at) as po_received_at, MAX(last_status_change_at) as last_status_change_at,
                   MAX(supplier_id) as supplier_id
            FROM latest_snapshot GROUP BY po_number
        ),
        po_days AS (
            SELECT po_number, status_code, supplier_id, po_qty, total_amount,
                   po_released_at, po_sent_at, po_arrived_at, po_received_at,
                   COALESCE(EXTRACT(DAY FROM (NOW() - COALESCE(CASE status_code 
                        WHEN 2 THEN po_released_at WHEN 3 THEN po_sent_at WHEN 4 THEN po_approved_at 
                        WHEN 5 THEN po_arrived_at WHEN 6 THEN po_received_at ELSE last_status_change_at END, last_status_change_at, NOW()))), 0)::int as days_in_status
            FROM po_aggregate WHERE status_code < 6
        )
    `

	// Count Query
	countQuery := cte + fmt.Sprintf(` SELECT COUNT(*) FROM po_days pd WHERE 1=1 %s`, statusClause)

	// Main Query
	query := cte + fmt.Sprintf(`
        SELECT pd.po_number, pd.status_code, pd.po_qty, pd.total_amount, pd.days_in_status, COALESCE(s.name, '') as supplier_name,
               pd.po_released_at, pd.po_sent_at, pd.po_arrived_at, pd.po_received_at
        FROM po_days pd
        LEFT JOIN suppliers s ON pd.supplier_id = s.id
        WHERE 1=1 %s
        ORDER BY %s %s
        LIMIT $%d OFFSET $%d
    `, statusClause, sortCol, sortDirection, idx, idx+1)

	// Execute Count
	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, args...); err != nil {
		return nil, err
	}

	// Execute Main
	qArgs := append(args, pageSize, offset)
	type rowType struct {
		poAgingRow
		SupplierName string     `db:"supplier_name"`
		POReleasedAt *time.Time `db:"po_released_at"`
		POSentAt     *time.Time `db:"po_sent_at"`
		POArrivedAt  *time.Time `db:"po_arrived_at"`
		POReceivedAt *time.Time `db:"po_received_at"`
	}
	var rows []rowType
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, qArgs...); err != nil {
		return nil, err
	}

	items := make([]domain.POAging, len(rows))
	formatTime := func(t *time.Time) *string {
		if t == nil {
			return nil
		}
		s := t.Format(time.RFC3339)
		return &s
	}

	for i, r := range rows {
		items[i] = domain.POAging{
			PONumber:     r.PONumber,
			Status:       domain.POStatusLabel(r.StatusCode),
			Quantity:     r.Quantity,
			Value:        r.TotalAmount,
			DaysInStatus: r.DaysInStatus,
			SupplierName: r.SupplierName,
			POReleasedAt: formatTime(r.POReleasedAt),
			POSentAt:     formatTime(r.POSentAt),
			POArrivedAt:  formatTime(r.POArrivedAt),
			POReceivedAt: formatTime(r.POReceivedAt),
		}
	}

	totalPages := (total + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}

	return &domain.POAgingResponse{
		Items:      items,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}

func (r *poRepository) GetSupplierPerformanceItems(ctx context.Context, page, pageSize int, sortField, sortDirection string) (*domain.SupplierPerformanceResponse, error) {
	// Validate pagination
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	// Validate sort
	validSortFields := map[string]string{
		"supplier_name": "s.name",
		"avg_lead_time": "avg_lead_time",
	}
	sortCol, ok := validSortFields[sortField]
	if !ok {
		sortCol = "avg_lead_time"
	}
	if sortDirection != "asc" && sortDirection != "desc" {
		sortDirection = "asc" // default to fastest lead time
	}

	// Base CTE for getting valid POs (Arrived and Sent are populated)
	cte := `
        WITH valid_pos AS (
            SELECT 
                po_number, 
                supplier_id, 
                po_sent_at, 
                po_arrived_at,
                ROW_NUMBER() OVER (PARTITION BY po_number, sku ORDER BY time DESC) as rn
            FROM po_snapshots
            WHERE po_number <> ''
            AND po_sent_at > '2000-01-01' 
            AND po_arrived_at > '2000-01-01'
        ),
        latest_pos AS (
             -- Need to aggregate SKUs to PO level or just pick one since dates are usually same per PO?
             -- Actually dates are per PO.
             -- But snapshot is per SKU.
             -- We should group by PO Number first to allow distinct PO calc?
             -- If a PO has 10 items, do we count it 10 times? NO.
             -- We should select distinct valid POs.
            SELECT DISTINCT ON (po_number)
                po_number,
                supplier_id,
                po_sent_at,
                po_arrived_at
            FROM valid_pos
            WHERE rn = 1
        )
    `

	// Count Query (Supplier Count)
	countQuery := cte + `
        SELECT COUNT(DISTINCT s.id)
        FROM latest_pos lp
        JOIN suppliers s ON lp.supplier_id = s.id
    `

	// Main Select
	query := cte + fmt.Sprintf(`
        SELECT 
            s.id as supplier_id,
            s.name as supplier_name,
            AVG(EXTRACT(EPOCH FROM (lp.po_arrived_at - lp.po_sent_at))/86400)::float as avg_lead_time,
            COUNT(*) as total_pos,
            MIN(EXTRACT(EPOCH FROM (lp.po_arrived_at - lp.po_sent_at))/86400)::float as min_lead_time,
            MAX(EXTRACT(EPOCH FROM (lp.po_arrived_at - lp.po_sent_at))/86400)::float as max_lead_time
        FROM latest_pos lp
        JOIN suppliers s ON lp.supplier_id = s.id
        GROUP BY s.id, s.name
        ORDER BY %s %s, s.name ASC
        LIMIT $%d OFFSET $%d
    `, sortCol, sortDirection, 1, 2)

	// Execute Count
	var total int
	if err := r.db.GetContext(ctx, &total, countQuery); err != nil {
		return nil, err
	}

	// Execute Data
	var rows []domain.SupplierPerformance
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, pageSize, offset); err != nil {
		return nil, err
	}

	totalPages := (total + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}

	// Handle empty/null (sqlx usually returns empty slice but verify)
	if rows == nil {
		rows = []domain.SupplierPerformance{}
	}

	return &domain.SupplierPerformanceResponse{
		Items:      rows,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
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
	statusExpr := buildDerivedStatusCase("s.")

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
			TO_CHAR(s.po_arrived_at, 'YYYY-MM-DD HH24:MI:SS') as po_arrived_at
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
		LEFT JOIN brands b ON s.brand_id = b.id
		LEFT JOIN stores st ON s.store_id = st.id
		WHERE %s = $1
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d
	`, filterClause, statusExpr, sortField, sortDirection, len(filterArgs)+2, len(filterArgs)+3)

	// Count query
	countQuery := fmt.Sprintf(`
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
