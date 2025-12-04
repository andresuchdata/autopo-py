package postgres

import (
	"context"
	"fmt"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/jmoiron/sqlx"
	"github.com/rs/zerolog/log"
)

// GetDashboardSummary aggregates all dashboard data
// Note: For simplicity and performance, we might want to run these in parallel or use a single complex query.
// For now, we'll fetch them sequentially or let the service layer handle aggregation if we want granular endpoints.
// The interface defined GetDashboardSummary as returning the full struct, so let's implement that.
func (r *poRepository) GetDashboardSummary(ctx context.Context) (*domain.DashboardSummary, error) {
	summary := &domain.DashboardSummary{}

	// 1. Status Summaries
	statusSummaries, err := r.getStatusSummaries(ctx)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch status summaries")
		return nil, fmt.Errorf("failed to get status summaries: %w", err)
	}
	summary.StatusSummaries = statusSummaries

	// 2. Lifecycle Funnel (reuse status summaries or fetch if different)
	// Funnel is essentially the same as status summary but might have different visualization needs.
	// We can map status summaries to funnel.
	for _, s := range statusSummaries {
		summary.LifecycleFunnel = append(summary.LifecycleFunnel, domain.POLifecycleFunnel{
			Stage:      s.Status,
			Count:      s.Count,
			TotalValue: s.TotalValue,
		})
	}

	// 3. Trends
	trends, err := r.GetPOTrend(ctx, "day") // Default to daily or weekly? Requirement says "past 5 days, or past 5 weeks". Let's default to last 30 days daily for now.
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch trends")
		return nil, fmt.Errorf("failed to get trends: %w", err)
	}
	summary.Trends = trends

	// 4. Aging
	aging, err := r.GetPOAging(ctx)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch aging data")
		return nil, fmt.Errorf("failed to get aging: %w", err)
	}
	summary.Aging = aging

	// 5. Supplier Performance
	perf, err := r.GetSupplierPerformance(ctx)
	if err != nil {
		log.Error().Err(err).Msg("po dashboard: failed to fetch supplier performance")
		return nil, fmt.Errorf("failed to get supplier performance: %w", err)
	}
	summary.SupplierPerformance = perf

	return summary, nil
}

type statusSummaryRow struct {
	StatusCode int     `db:"status_code"`
	Count      int     `db:"count"`
	TotalValue float64 `db:"total_value"`
	AvgDays    float64 `db:"avg_days"`
	DiffDays   int     `db:"diff_days"`
}

func (r *poRepository) getStatusSummaries(ctx context.Context) ([]domain.POStatusSummary, error) {
	// Status mapping: 1: Draft, 2: Released, 3: Sent, 4: Approved, 5: Arrived, 6: Received
	// We need to join with purchase_order_items to get value?
	// purchase_orders table has po_qty, received_qty. It doesn't seem to have total_amount directly?
	// Wait, migration 003_add_po_snapshots.sql has total_amount in po_snapshots.
	// purchase_order_items has amount.
	// Let's calculate total value from items.

	query := `
		WITH latest_snapshot AS (
			SELECT 
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots
			WHERE po_number <> ''
			GROUP BY po_number, sku
		),
		po_values AS (
			SELECT
				CONCAT(s.po_number, '::', s.sku) AS po_sku_identifier,
				MAX(s.status) AS status_code,
				SUM(s.total_amount) AS total_value,
				COALESCE(
					MAX(CASE WHEN s.status = 2 THEN s.po_released_at END),
					MAX(CASE WHEN s.status = 3 THEN s.po_sent_at END),
					MAX(CASE WHEN s.status = 4 THEN s.po_approved_at END),
					MAX(CASE WHEN s.status = 5 THEN s.po_arrived_at END),
					MAX(CASE WHEN s.status = 6 THEN s.po_received_at END),
					MAX(s.time)
				) AS status_change_at
			FROM po_snapshots s
			JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
			GROUP BY s.po_number, s.sku
		)
		SELECT 
			status_code,
			COUNT(po_sku_identifier) as count,
			COALESCE(SUM(total_value), 0) as total_value,
			COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - status_change_at))/86400), 0) as avg_days,
			COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - status_change_at))/86400)::int, 0) as diff_days
		FROM po_values
		GROUP BY status_code
		ORDER BY status_code
	`
	// Note: "Avg Days in Status" is tricky without history.
	// If we use po_snapshots, we can get exact duration.
	// For now, let's use a simple "Days since creation" or "Days since status change" if we had that column.
	// The purchase_orders table has timestamps for each status: po_released_at, po_sent_at, etc.
	// We can calculate duration based on current status timestamp vs next status or now.
	// Let's refine the query to be more accurate if possible, or stick to simple for MVP.
	// The requirement says "Avg. Days in Status".

	var rows []statusSummaryRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query); err != nil {
		return nil, err
	}

	results := make([]domain.POStatusSummary, len(rows))
	for i, row := range rows {
		results[i] = domain.POStatusSummary{
			Status:     domain.POStatusLabel(row.StatusCode),
			Count:      row.Count,
			TotalValue: row.TotalValue,
			AvgDays:    row.AvgDays,
			DiffDays:   row.DiffDays,
		}
	}

	return results, nil
}

func (r *poRepository) GetPOTrend(ctx context.Context, interval string) ([]domain.POTrend, error) {
	// Use po_snapshots for historical trend
	// Group by day and status (avoid TimescaleDB dependency)

	// Default to last 30 days
	type trendRow struct {
		Date       string `db:"date"`
		StatusCode int    `db:"status_code"`
		Count      int    `db:"count"`
	}

	query := `
		WITH bucketed AS (
			SELECT 
				date_trunc('day', time) AS bucket,
				status as status_code,
				po_number,
				sku
			FROM po_snapshots
			WHERE time > NOW() - INTERVAL '30 days'
		)
		SELECT 
			bucket::date::text as date,
			status_code,
			COUNT(DISTINCT CONCAT(po_number, '::', sku)) as count
		FROM bucketed
		GROUP BY bucket, status_code
		ORDER BY bucket, status_code
	`

	var rows []trendRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query); err != nil {
		return nil, err
	}

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
	// List POs that are not completed (e.g., not Received/Cancelled?)
	// Assuming status < 6 are active.

	query := `
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
	                FROM po_snapshots
	                WHERE po_number <> ''
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
	    `

	var rows []poAgingRow
	if err := sqlx.SelectContext(ctx, r.db, &rows, query); err != nil {
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
		}
	}

	return results, nil
}

func (r *poRepository) GetSupplierPerformance(ctx context.Context) ([]domain.SupplierPerformance, error) {
	// Lead time derived from PO snapshots: diff between PO sent and arrived timestamps

	query := `
	        WITH latest_snapshot AS (
	            SELECT
	                po_number,
	                sku,
	                supplier_id,
	                po_sent_at,
	                po_arrived_at,
	                ROW_NUMBER() OVER (PARTITION BY po_number, sku ORDER BY time DESC) as rn
	            FROM po_snapshots
	            WHERE po_number <> ''
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
	    `

	var results []domain.SupplierPerformance
	err := sqlx.SelectContext(ctx, r.db, &results, query)
	return results, err
}

// GetPOSnapshotItems fetches PO snapshot items filtered by status with pagination and sorting
func (r *poRepository) GetPOSnapshotItems(ctx context.Context, statusCode int, page, pageSize int, sortField, sortDirection string) (*domain.POSnapshotItemsResponse, error) {
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

	// Query to get latest snapshots for the given status
	query := fmt.Sprintf(`
		WITH latest_snapshot AS (
			SELECT 
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots
			WHERE status = $1
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
		LIMIT $2 OFFSET $3
	`, sortField, sortDirection)

	// Count query
	countQuery := `
		WITH latest_snapshot AS (
			SELECT 
				po_number,
				sku,
				MAX(time) AS latest_time
			FROM po_snapshots
			WHERE status = $1
			GROUP BY po_number, sku
		)
		SELECT COUNT(*)
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
	`

	// Execute count query
	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, statusCode); err != nil {
		log.Error().Err(err).Int("status_code", statusCode).Msg("failed to count PO snapshot items")
		return nil, fmt.Errorf("failed to count items: %w", err)
	}

	// Execute main query
	var items []domain.POSnapshotItem
	if err := sqlx.SelectContext(ctx, r.db, &items, query, statusCode, pageSize, offset); err != nil {
		log.Error().Err(err).Int("status_code", statusCode).Msg("failed to fetch PO snapshot items")
		return nil, fmt.Errorf("failed to fetch items: %w", err)
	}

	totalPages := (total + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}

	return &domain.POSnapshotItemsResponse{
		Items:      items,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	}, nil
}
