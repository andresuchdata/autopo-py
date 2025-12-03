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
				MAX(s.status_label) AS status_label,
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
		INITCAP(status_label) as status,
		COUNT(po_sku_identifier) as count,
		COALESCE(SUM(total_value), 0) as total_value,
		COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - status_change_at))/86400), 0) as avg_days,
		COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - status_change_at))/86400)::int, 0) as diff_days
	FROM po_values
	GROUP BY status_label, status_code
	ORDER BY status_code
	`
	// Note: "Avg Days in Status" is tricky without history.
	// If we use po_snapshots, we can get exact duration.
	// For now, let's use a simple "Days since creation" or "Days since status change" if we had that column.
	// The purchase_orders table has timestamps for each status: po_released_at, po_sent_at, etc.
	// We can calculate duration based on current status timestamp vs next status or now.
	// Let's refine the query to be more accurate if possible, or stick to simple for MVP.
	// The requirement says "Avg. Days in Status".

	var results []domain.POStatusSummary
	err := sqlx.SelectContext(ctx, r.db, &results, query)
	return results, err
}

func (r *poRepository) GetPOTrend(ctx context.Context, interval string) ([]domain.POTrend, error) {
	// Use po_snapshots for historical trend
	// Group by day and status (avoid TimescaleDB dependency)

	// Default to last 30 days
	query := `
		WITH bucketed AS (
			SELECT 
				date_trunc('day', time) AS bucket,
				status_label,
				po_number,
				sku
			FROM po_snapshots
			WHERE time > NOW() - INTERVAL '30 days'
		)
		SELECT 
			bucket::date::text as date,
			INITCAP(status_label) as status,
			COUNT(DISTINCT CONCAT(po_number, '::', sku)) as count
		FROM bucketed
		GROUP BY bucket, status_label
		ORDER BY bucket, status_label
	`

	var results []domain.POTrend
	err := sqlx.SelectContext(ctx, r.db, &results, query)
	return results, err
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
        SELECT 
            po.po_number,
            po.status as status_code,
            po.po_qty,
            COALESCE(poi.total_amount, 0) as total_amount,
            COALESCE(EXTRACT(DAY FROM (NOW() - GREATEST(po.po_released_at, po.po_sent_at, po.po_approved_at, po.po_arrived_at, po.created_at))), 0)::int as days_in_status
        FROM purchase_orders po
        LEFT JOIN (
            SELECT po_id, SUM(amount) as total_amount 
            FROM purchase_order_items 
            GROUP BY po_id
        ) poi ON po.id = poi.po_id
        WHERE po.status < 6 -- Exclude Received/Completed if desired, or show all. Requirement says "PO Aging vs Today". Usually implies open POs.
        ORDER BY days_in_status DESC
        LIMIT 10
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
	// Lead time: Diff PO Sent date and PO Arrived date

	query := `
		SELECT 
			s.id as supplier_id,
			s.name as supplier_name,
			AVG(EXTRACT(EPOCH FROM (po.po_arrived_at - po.po_sent_at))/86400) as avg_lead_time
		FROM purchase_orders po
		JOIN suppliers s ON po.supplier_id = s.id
		WHERE po.po_sent_at IS NOT NULL AND po.po_arrived_at IS NOT NULL
		GROUP BY s.id, s.name
		ORDER BY avg_lead_time ASC
		LIMIT 5
	`

	var results []domain.SupplierPerformance
	err := sqlx.SelectContext(ctx, r.db, &results, query)
	return results, err
}

// GetPOSnapshotItems fetches PO snapshot items filtered by status with pagination and sorting
func (r *poRepository) GetPOSnapshotItems(ctx context.Context, status string, page, pageSize int, sortField, sortDirection string) (*domain.POSnapshotItemsResponse, error) {
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
			WHERE status_label = LOWER($1)
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
			WHERE status_label = LOWER($1)
			GROUP BY po_number, sku
		)
		SELECT COUNT(*)
		FROM po_snapshots s
		JOIN latest_snapshot ls ON s.po_number = ls.po_number AND s.sku = ls.sku AND s.time = ls.latest_time
	`

	// Execute count query
	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, status); err != nil {
		log.Error().Err(err).Str("status", status).Msg("failed to count PO snapshot items")
		return nil, fmt.Errorf("failed to count items: %w", err)
	}

	// Execute main query
	var items []domain.POSnapshotItem
	if err := sqlx.SelectContext(ctx, r.db, &items, query, status, pageSize, offset); err != nil {
		log.Error().Err(err).Str("status", status).Msg("failed to fetch PO snapshot items")
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
