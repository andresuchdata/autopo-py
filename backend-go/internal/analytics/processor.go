// internal/analytics/processor.go
package analytics

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/lib/pq"
)

// AnalyticsProcessor handles processing of analytics data
type AnalyticsProcessor struct {
	db       *sql.DB
	resolver *EntityIDResolver
	cfg      ParseConfig
}

func NewAnalyticsProcessor(db *sql.DB, cfg ParseConfig) *AnalyticsProcessor {
	return &AnalyticsProcessor{
		db:       db,
		resolver: NewEntityIDResolver(db),
		cfg:      cfg,
	}
}

const analyticsBatchSize = 1000

// ProcessFile processes either stock health or PO snapshot files based on the file path
func (p *AnalyticsProcessor) ProcessFile(ctx context.Context, filePath string) error {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("PANIC in ProcessFile for %s: %v", filePath, r)
		}
	}()

	log.Printf("DEBUG PROCESSOR: Starting ProcessFile for: %s", filePath)
	pipelineType := detectPipelineType(filePath)
	log.Printf("DEBUG PROCESSOR: Detected pipeline type: '%s'", pipelineType)

	switch pipelineType {
	case "stock_health":
		return p.processStockHealthFile(ctx, filePath)
	case "po_snapshots":
		return p.processPOSnapshotFile(ctx, filePath)
	default:
		return fmt.Errorf("unknown file type in directory hierarchy: %s", filepath.Dir(filePath))
	}
}

func (p *AnalyticsProcessor) flushPOSnapshotBatch(ctx context.Context, tx *sql.Tx, batch []poSnapshotRecord) error {
	if len(batch) == 0 {
		return nil
	}

	seen := make(map[poSnapshotKey]int, len(batch))
	unique := make([]poSnapshotRecord, 0, len(batch))
	duplicateCount := 0
	var lastDuplicate poSnapshotRecord

	for _, rec := range batch {
		key := makePOSnapshotKey(rec)
		if idx, exists := seen[key]; exists {
			duplicateCount++
			lastDuplicate = rec
			unique[idx] = rec
			continue
		}
		seen[key] = len(unique)
		unique = append(unique, rec)
	}

	if duplicateCount > 0 {
		log.Printf("Skipped %d duplicate PO snapshots in batch (keeping latest). Sample duplicate: upload %s (po=%s sku=%s brand_id=%d store_id=%d supplier_id=%s)",
			duplicateCount,
			lastDuplicate.snapshotTime.Format(time.RFC3339),
			lastDuplicate.poNumber,
			lastDuplicate.sku,
			lastDuplicate.brandID,
			lastDuplicate.storeID,
			formatSupplierID(lastDuplicate.supplierID))
	}

	valueStrings := make([]string, 0, len(unique))
	args := make([]interface{}, 0, len(unique)*18)
	for i, rec := range unique {
		base := i*18 + 1
		valueStrings = append(valueStrings, fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
			base, base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10, base+11, base+12, base+13, base+14, base+15, base+16, base+17))
		args = append(args,
			rec.snapshotTime,
			rec.poNumber,
			rec.productID,
			rec.sku,
			rec.productName,
			toNullableInt64(rec.brandID),
			rec.storeID,
			toNullableInt64(rec.supplierID),
			rec.quantityOrdered,
			rec.unitPrice,
			rec.totalAmount,
			rec.status,
			toNullTime(rec.releasedAt),
			toNullTime(rec.sentAt),
			toNullTime(rec.approvedAt),
			toNullTime(rec.arrivedAt),
			toNullTime(rec.receivedAt),
			rec.quantityReceived,
		)
	}

	query := fmt.Sprintf(`
		INSERT INTO po_snapshots (
			time, po_number, product_id, sku, product_name,
			brand_id, store_id, supplier_id, quantity_ordered, unit_price,
			total_amount, status, po_released_at, po_sent_at, po_approved_at,
			po_arrived_at, po_received_at, quantity_received
		) VALUES %s
		ON CONFLICT (time, po_number, sku)
		DO UPDATE SET
			quantity_ordered = EXCLUDED.quantity_ordered,
			unit_price = EXCLUDED.unit_price,
			total_amount = EXCLUDED.total_amount,
			status = EXCLUDED.status,
			po_released_at = EXCLUDED.po_released_at,
			po_sent_at = EXCLUDED.po_sent_at,
			po_approved_at = EXCLUDED.po_approved_at,
			po_arrived_at = EXCLUDED.po_arrived_at,
			po_received_at = EXCLUDED.po_received_at,
			quantity_received = EXCLUDED.quantity_received,
			updated_at = NOW()
	`, strings.Join(valueStrings, ","))

	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("failed to upsert po snapshots batch: %w", err)
	}
	return nil
}

func (p *AnalyticsProcessor) ensureProductsBulk(ctx context.Context, tx *sql.Tx, skus map[string]struct{}) (map[string]int, error) {
	result := make(map[string]int, len(skus))
	if len(skus) == 0 {
		return result, nil
	}
	skuList := make([]string, 0, len(skus))
	for sku := range skus {
		skuList = append(skuList, sku)
	}

	rows, err := tx.QueryContext(ctx,
		`SELECT sku, id FROM products WHERE sku = ANY($1)`,
		pq.Array(skuList),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load product ids: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var sku string
		var id int
		if err := rows.Scan(&sku, &id); err != nil {
			return nil, fmt.Errorf("failed to scan product id: %w", err)
		}
		result[sku] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("product id rows error: %w", err)
	}

	insertStmt := `
		INSERT INTO products (sku, name, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (sku) DO UPDATE
			SET name = EXCLUDED.name,
			    updated_at = NOW()
		RETURNING id
	`
	for _, sku := range skuList {
		if _, exists := result[sku]; exists {
			continue
		}
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, sku, "Product "+sku).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert product %s: %w", sku, err)
		}
		result[sku] = id
	}
	return result, nil
}

func ensureSuppliersBulk(ctx context.Context, tx *sql.Tx, names map[string]string) (map[string]int, error) {
	result := make(map[string]int, len(names))
	if len(names) == 0 {
		return result, nil
	}
	lowerNames := make([]string, 0, len(names))
	for key := range names {
		lowerNames = append(lowerNames, key)
	}
	rows, err := tx.QueryContext(ctx,
		`SELECT LOWER(name) AS key, id FROM suppliers WHERE LOWER(name) = ANY($1)`,
		pq.Array(lowerNames),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load supplier ids: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var id int
		if err := rows.Scan(&key, &id); err != nil {
			return nil, fmt.Errorf("failed to scan supplier id: %w", err)
		}
		result[key] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("supplier rows error: %w", err)
	}

	insertStmt := `
		INSERT INTO suppliers (name, created_at, updated_at)
		VALUES ($1, NOW(), NOW())
		RETURNING id
	`
	for key, displayName := range names {
		if _, exists := result[key]; exists {
			continue
		}
		displayName = truncateString(displayName, 255)
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, displayName).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert supplier %s: %w", displayName, err)
		}
		result[key] = id
	}
	return result, nil
}

func (p *AnalyticsProcessor) ensureProductsWithNamesBulk(ctx context.Context, tx *sql.Tx, skuNames map[string]string) (map[string]int, error) {
	if len(skuNames) == 0 {
		return map[string]int{}, nil
	}
	skus := make(map[string]struct{}, len(skuNames))
	for sku := range skuNames {
		skus[sku] = struct{}{}
	}
	productIDs, err := p.ensureProductsBulk(ctx, tx, skus)
	if err != nil {
		return nil, err
	}

	insertStmt := `
		INSERT INTO products (sku, name, created_at, updated_at)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (sku) DO UPDATE
			SET name = EXCLUDED.name,
			    updated_at = NOW()
		RETURNING id
	`
	for sku, name := range skuNames {
		if name == "" {
			name = "Product " + sku
		}
		name = truncateString(name, 255)
		if _, exists := productIDs[sku]; exists {
			continue
		}
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, sku, name).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert product %s: %w", sku, err)
		}
		productIDs[sku] = id
	}
	return productIDs, nil
}

func (p *AnalyticsProcessor) updateProductHPPBulk(ctx context.Context, tx *sql.Tx, skuHPP map[string]float64) error {
	if len(skuHPP) == 0 {
		return nil
	}
	const stmt = `
		UPDATE products
		SET hpp = $2, updated_at = NOW()
		WHERE sku = $1 AND (hpp IS NULL OR hpp = 0)
	`
	for sku, hpp := range skuHPP {
		if hpp <= 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, stmt, sku, hpp); err != nil {
			return fmt.Errorf("failed to update hpp for sku %s: %w", sku, err)
		}
	}
	return nil
}

func ensureStoresBulk(ctx context.Context, tx *sql.Tx, names map[string]string) (map[string]int, error) {
	result := make(map[string]int, len(names))
	if len(names) == 0 {
		return result, nil
	}
	lowerNames := make([]string, 0, len(names))
	for key := range names {
		lowerNames = append(lowerNames, key)
	}
	rows, err := tx.QueryContext(ctx,
		`SELECT LOWER(name) AS key, id FROM stores WHERE LOWER(name) = ANY($1)`,
		pq.Array(lowerNames),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load store ids: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var key string
		var id int
		if err := rows.Scan(&key, &id); err != nil {
			return nil, fmt.Errorf("failed to scan store id: %w", err)
		}
		result[key] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store rows error: %w", err)
	}

	insertStmt := `
		INSERT INTO stores (name, created_at, updated_at)
		VALUES ($1, NOW(), NOW())
		ON CONFLICT (LOWER(name)) WHERE original_id IS NULL DO UPDATE SET updated_at = NOW()
		RETURNING id
	`
	for key, displayName := range names {
		if _, exists := result[key]; exists {
			continue
		}
		displayName = truncateString(displayName, 255)
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, displayName).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert store %s: %w", displayName, err)
		}
		result[key] = id
	}
	return result, nil
}

func ensureBrandsBulk(ctx context.Context, tx *sql.Tx, names map[string]string) (map[string]int, error) {
	result := make(map[string]int, len(names))
	if len(names) == 0 {
		return result, nil
	}

	lowerNames := make([]string, 0, len(names))
	for key := range names {
		lowerNames = append(lowerNames, key)
	}

	rows, err := tx.QueryContext(ctx,
		`SELECT LOWER(name) AS key, id FROM brands WHERE LOWER(name) = ANY($1)`,
		pq.Array(lowerNames),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load brand ids: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var id int
		if err := rows.Scan(&key, &id); err != nil {
			return nil, fmt.Errorf("failed to scan brand id: %w", err)
		}
		result[key] = id
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("brand rows error: %w", err)
	}

	insertStmt := `
		INSERT INTO brands (name, created_at, updated_at)
		VALUES ($1, NOW(), NOW())
		ON CONFLICT (LOWER(name)) WHERE original_id IS NULL DO UPDATE SET updated_at = NOW()
		RETURNING id
	`
	for key, displayName := range names {
		if _, exists := result[key]; exists {
			continue
		}
		displayName = truncateString(displayName, 255)
		var id int
		if err := tx.QueryRowContext(ctx, insertStmt, displayName).Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to upsert brand %s: %w", displayName, err)
		}
		result[key] = id
	}
	return result, nil
}
