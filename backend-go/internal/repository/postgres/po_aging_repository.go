package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/jmoiron/sqlx"
	"github.com/rs/zerolog/log"
)

const defaultAgingSummaryLimit = 10

type poAgingRow struct {
	PONumber     string  `db:"po_number"`
	StatusCode   int     `db:"status_code"`
	Quantity     int     `db:"po_qty"`
	TotalAmount  float64 `db:"total_amount"`
	DaysInStatus int     `db:"days_in_status"`
}

func (r *poRepository) GetPOAging(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POAging, error) {
	return r.getPOAgingWithFilter(ctx, filter, defaultAgingSummaryLimit)
}

func (r *poRepository) getPOAgingWithFilter(ctx context.Context, filter *domain.DashboardFilter, limit int) ([]domain.POAging, error) {
	if limit <= 0 {
		limit = defaultAgingSummaryLimit
	}

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
                COALESCE(sup.name, '') as supplier_name,
                COALESCE(fs.supplier_id, 0) as supplier_id,
                COALESCE(SUM(fs.quantity_ordered), 0) as po_qty,
                COALESCE(SUM(fs.total_amount), 0) as total_amount,
                COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - fs.time))/86400)::int, 0) as days_in_status,
                MAX(fs.po_released_at) as po_released_at,
                MAX(fs.po_sent_at) as po_sent_at,
                MAX(fs.po_arrived_at) as po_arrived_at,
                MAX(fs.po_received_at) as po_received_at,
                NULL::timestamptz as eta
            FROM filtered_snapshots fs
            JOIN latest_snapshot ls ON fs.po_number = ls.po_number AND fs.sku = ls.sku AND fs.time = ls.latest_time
            LEFT JOIN suppliers sup ON fs.supplier_id = sup.id
            WHERE COALESCE(fs.status, -1) IN (0,1,2,3,4,5,9)
            GROUP BY fs.po_number, fs.status, sup.name, fs.supplier_id
        )
        SELECT 
            po_number,
            status_code,
            supplier_id,
            supplier_name,
            po_qty,
            total_amount,
            days_in_status,
            po_released_at,
            po_sent_at,
            po_arrived_at,
            po_received_at,
            eta
        FROM po_aging
        ORDER BY days_in_status DESC
        LIMIT $%d
    `, filterClause, len(filterArgs)+1)

	if filterClause != "" {
		log.Debug().Msg("po dashboard: aging applying filter")
	}

	type summaryRow struct {
		poAgingRow
		SupplierID   *int64     `db:"supplier_id"`
		SupplierName string     `db:"supplier_name"`
		POReleasedAt *time.Time `db:"po_released_at"`
		POSentAt     *time.Time `db:"po_sent_at"`
		POArrivedAt  *time.Time `db:"po_arrived_at"`
		POReceivedAt *time.Time `db:"po_received_at"`
		ETA          *time.Time `db:"eta"`
	}

	var rows []summaryRow
	args := append(filterArgs, limit)
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, args...); err != nil {
		log.Error().Err(err).Msg("po repository: get aging with filter failed")
		return nil, err
	}

	results := make([]domain.POAging, len(rows))
	formatTime := func(t *time.Time) *string {
		if t == nil {
			return nil
		}
		s := t.Format(time.RFC3339)
		return &s
	}

	for i, row := range rows {
		results[i] = domain.POAging{
			PONumber:     row.PONumber,
			Status:       domain.POStatusLabel(row.StatusCode),
			SupplierName: row.SupplierName,
			Quantity:     row.Quantity,
			Value:        row.TotalAmount,
			DaysInStatus: row.DaysInStatus,
			POReleasedAt: formatTime(row.POReleasedAt),
			POSentAt:     formatTime(row.POSentAt),
			POArrivedAt:  formatTime(row.POArrivedAt),
			POReceivedAt: formatTime(row.POReceivedAt),
			ETA:          formatTime(row.ETA),
		}
	}
	return results, nil
}

func (r *poRepository) GetPOAgingItems(ctx context.Context, page, pageSize int, sortField, sortDirection, status string) (*domain.POAgingResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

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

	var statusClause string
	var args []interface{}
	idx := 1
	if status != "" && status != "ALL" {
		statusClause = fmt.Sprintf("AND pd.status_code = $%d", idx)
		sc, _ := domain.ParsePOStatus(status)
		args = append(args, sc)
		idx++
	}

	cte := `
        WITH latest_snapshot AS (
            SELECT po_number, sku, status, quantity_ordered, COALESCE(total_amount, 0) as total_amount, 
                   po_released_at, po_sent_at, po_approved_at, po_arrived_at, po_received_at, supplier_id, NULL::timestamptz as eta,
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
                   MAX(supplier_id) as supplier_id, MAX(eta) as eta
            FROM latest_snapshot GROUP BY po_number
        ),
        po_days AS (
            SELECT po_number, status_code, supplier_id, po_qty, total_amount,
                   po_released_at, po_sent_at, po_arrived_at, po_received_at, eta,
                   COALESCE(EXTRACT(DAY FROM (NOW() - COALESCE(CASE status_code  
                        WHEN 2 THEN po_released_at WHEN 3 THEN po_sent_at WHEN 4 THEN po_approved_at 
                        WHEN 5 THEN po_arrived_at WHEN 6 THEN po_received_at ELSE last_status_change_at END, last_status_change_at, NOW()))), 0)::int as days_in_status
            FROM po_aggregate WHERE status_code < 6
        )
    `

	countQuery := cte + fmt.Sprintf(` SELECT COUNT(*) FROM po_days pd WHERE 1=1 %s`, statusClause)

	query := cte + fmt.Sprintf(`
        SELECT pd.po_number, pd.status_code, pd.po_qty, pd.total_amount, pd.days_in_status, COALESCE(s.name, '') as supplier_name,
               pd.po_released_at, pd.po_sent_at, pd.po_arrived_at, pd.po_received_at, pd.eta
        FROM po_days pd
        LEFT JOIN suppliers s ON pd.supplier_id = s.id
        WHERE 1=1 %s
        ORDER BY %s %s
        LIMIT $%d OFFSET $%d
    `, statusClause, sortCol, sortDirection, idx, idx+1)

	var total int
	if err := r.db.GetContext(ctx, &total, countQuery, args...); err != nil {
		return nil, err
	}

	qArgs := append(args, pageSize, offset)
	type rowType struct {
		poAgingRow
		SupplierName string     `db:"supplier_name"`
		POReleasedAt *time.Time `db:"po_released_at"`
		POSentAt     *time.Time `db:"po_sent_at"`
		POArrivedAt  *time.Time `db:"po_arrived_at"`
		POReceivedAt *time.Time `db:"po_received_at"`
		ETA          *time.Time `db:"eta"`
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
			ETA:          formatTime(r.ETA),
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
