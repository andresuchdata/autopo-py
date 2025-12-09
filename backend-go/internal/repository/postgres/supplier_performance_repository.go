package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/jmoiron/sqlx"
	"github.com/rs/zerolog/log"
)

const defaultSupplierPerformanceLimit = 10

func (r *poRepository) GetSupplierPerformanceItems(ctx context.Context, page, pageSize int, sortField, sortDirection string) (*domain.SupplierPerformanceResponse, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	validSortFields := map[string]string{
		"supplier_name": "s.name",
		"avg_lead_time": "avg_lead_time",
	}
	sortCol, ok := validSortFields[sortField]
	if !ok {
		sortCol = "avg_lead_time"
	}
	if sortDirection != "asc" && sortDirection != "desc" {
		sortDirection = "asc"
	}

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
            SELECT DISTINCT ON (po_number)
                po_number,
                supplier_id,
                po_sent_at,
                po_arrived_at
            FROM valid_pos
            WHERE rn = 1
        )
    `

	countQuery := cte + `
        SELECT COUNT(DISTINCT s.id)
        FROM latest_pos lp
        JOIN suppliers s ON lp.supplier_id = s.id
    `

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

	var total int
	if err := r.db.GetContext(ctx, &total, countQuery); err != nil {
		return nil, err
	}

	var rows []domain.SupplierPerformance
	if err := sqlx.SelectContext(ctx, r.db, &rows, query, pageSize, offset); err != nil {
		return nil, err
	}

	totalPages := (total + pageSize - 1) / pageSize
	if totalPages < 1 {
		totalPages = 1
	}
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
	return r.getSupplierPerformanceWithFilter(ctx, nil, defaultSupplierPerformanceLimit)
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

func (r *poRepository) getSupplierPerformanceWithFilter(ctx context.Context, filter *domain.DashboardFilter, limit int) ([]domain.SupplierPerformance, error) {
	if limit <= 0 {
		limit = defaultSupplierPerformanceLimit
	}

	filterClause, filterArgs := buildDashboardFilterClause(filter, "s.", 1)

	query := fmt.Sprintf(`
            WITH valid_pos AS (
                SELECT
                    po_number,
                    sku,
                    supplier_id,
                    po_sent_at,
                    po_arrived_at,
                    ROW_NUMBER() OVER (PARTITION BY po_number, sku ORDER BY time DESC) as rn
                FROM po_snapshots s
                WHERE s.po_number <> '' 
                  AND s.po_sent_at > '2000-01-01' 
                  AND s.po_arrived_at > '2000-01-01'
                  %s
            ),
            po_level AS (
                SELECT
                    po_number,
                    MAX(supplier_id) as supplier_id,
                    MAX(po_sent_at) as po_sent_at,
                    MAX(po_arrived_at) as po_arrived_at
                FROM valid_pos
                WHERE rn = 1
                GROUP BY po_number
            ),
            supplier_aggregated AS (
                SELECT
                    supplier_id,
                    COUNT(*) as total_pos,
                    AVG(EXTRACT(EPOCH FROM (po_arrived_at - po_sent_at))/86400) as avg_lead_time,
                    MIN(EXTRACT(EPOCH FROM (po_arrived_at - po_sent_at))/86400) as min_lead_time,
                    MAX(EXTRACT(EPOCH FROM (po_arrived_at - po_sent_at))/86400) as max_lead_time
                FROM po_level
                WHERE supplier_id IS NOT NULL
                GROUP BY supplier_id
            )
            SELECT 
                s.id as supplier_id,
                s.name as supplier_name,
                sa.avg_lead_time,
                sa.total_pos,
                sa.min_lead_time,
                sa.max_lead_time
            FROM supplier_aggregated sa
            JOIN suppliers s ON sa.supplier_id = s.id
            ORDER BY sa.avg_lead_time ASC, s.name ASC
            LIMIT %d
        `, filterClause, limit)

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
