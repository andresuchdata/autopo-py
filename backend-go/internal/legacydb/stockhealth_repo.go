package legacydb

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	stockhealth "github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
)

// StockHealthRepository handles fetching stock health data from the legacy CI3 database
type StockHealthRepository struct {
	db *sql.DB
}

// NewStockHealthRepository creates a new repository instance
func NewStockHealthRepository(db *sql.DB) *StockHealthRepository {
	return &StockHealthRepository{db: db}
}

// StoreSnapshot represents the metadata for a store's snapshot
type StoreSnapshot struct {
	StoreID   int
	StoreName string
	Date      time.Time
}

// FetchStoreSnapshot retrieves stock health data for a specific store and date
// This mirrors the logic from ModelPurchaseOrderAuto::exportSuggestion()
// Returns only the subset of columns needed for PO calculation
func (r *StockHealthRepository) FetchStoreSnapshot(ctx context.Context, storeID int, snapshotDate time.Time) ([]stockhealth.RawStockRow, string, error) {
	// Format date as YYYY-MM-DD for MySQL DATE() comparison
	dateStr := snapshotDate.Format("2006-01-02")

	// This query is ported from ModelPurchaseOrderAuto::exportSuggestion()
	// We only select the columns needed for PO calculation:
	// Toko, Brand, SKU, Name, HPP, Harga, Kategori Brand, Kategori, Subkategori,
	// Stok, Daily Sales, Max. Daily Sales, Lead Time, Max. Lead Time, Sedang PO
	query := `
		SELECT 
			ap_store.store AS toko,
			brand.brand,
			ap_produk.id_produk AS sku,
			ap_produk.nama_produk AS nama,
			au_produk_store.hpp,
			au_produk_store.harga_jual AS harga,
			au_kategori_brand.kategori AS kategori_brand,
			ap_kategori_1.kategori_level_1 AS kategori,
			ap_kategori_2.kategori_3 AS subkategori,
			au_produk_store.min_order,
			stok_store.stok,
			au_produk_store.daily_sales,
			au_produk_store.max_daily_sales,
			au_produk_store.lead_time,
			au_produk_store.max_lead_time,
			au_produk_store.sedang_po
		FROM stok_store
		LEFT JOIN au_produk_store 
			ON au_produk_store.id_store = stok_store.id_store 
			AND au_produk_store.id_produk = stok_store.id_produk 
			AND au_produk_store.nama_produk NOT LIKE 'UPLOAD KETIGA'
		LEFT JOIN ap_produk ON ap_produk.id_produk = stok_store.id_produk
		LEFT JOIN ap_store ON ap_store.id_store = stok_store.id_store
		LEFT JOIN au_produk_global 
			ON au_produk_global.id_produk = stok_store.id_produk 
			AND DATE(au_produk_global.generate_date) = ?
		LEFT JOIN brand ON brand.id_brand = ap_produk.id_brand
		LEFT JOIN au_kategori_brand ON au_kategori_brand.id_kategori_brand = brand.id_kategori_brand
		LEFT JOIN ap_kategori_1 ON ap_kategori_1.id = ap_produk.id_subkategori
		LEFT JOIN ap_kategori_2 ON ap_kategori_2.id = ap_produk.id_subkategori_2
		WHERE stok_store.id_store = ?
			AND ap_produk.id_produk NOT LIKE 'F%'
			AND ap_produk.id_produk NOT LIKE 'T%'
			AND ap_produk.status = 1
		GROUP BY ap_produk.id_produk
		ORDER BY brand.brand ASC, ap_produk.nama_produk ASC
	`

	rows, err := r.db.QueryContext(ctx, query, dateStr, storeID)
	if err != nil {
		return nil, "", fmt.Errorf("failed to query store snapshot: %w", err)
	}
	defer rows.Close()

	var results []stockhealth.RawStockRow
	var storeName string

	for rows.Next() {
		var row stockhealth.RawStockRow
		var toko, brand, sku, nama sql.NullString
		var hpp, harga, stok, dailySales, maxDailySales, leadTime, maxLeadTime, sedangPO, minOrder sql.NullFloat64
		var kategoriBrand, kategori, subkategori sql.NullString

		err := rows.Scan(
			&toko,
			&brand,
			&sku,
			&nama,
			&hpp,
			&harga,
			&kategoriBrand,
			&kategori,
			&subkategori,
			&minOrder,
			&stok,
			&dailySales,
			&maxDailySales,
			&leadTime,
			&maxLeadTime,
			&sedangPO,
		)
		if err != nil {
			return nil, "", fmt.Errorf("failed to scan row: %w", err)
		}

		// Store name from first row
		if storeName == "" && toko.Valid {
			storeName = toko.String
		}

		row.Toko = nullStringValue(toko)
		row.Brand = nullStringValue(brand)
		row.SKU = nullStringValue(sku)
		row.Nama = nullStringValue(nama)
		row.HPP = nullFloat64Value(hpp)
		row.Harga = nullFloat64Value(harga)
		row.MinOrder = nullFloat64Value(minOrder)
		row.Stock = nullFloat64Value(stok)
		row.DailySales = nullFloat64Value(dailySales)
		row.MaxDailySales = nullFloat64Value(maxDailySales)
		row.LeadTime = nullFloat64Value(leadTime)
		row.MaxLeadTime = nullFloat64Value(maxLeadTime)
		row.SedangPO = nullFloat64Value(sedangPO)

		row.OrigDailySales = row.DailySales
		row.OrigMaxDailySales = row.MaxDailySales

		results = append(results, row)
	}

	if err := rows.Err(); err != nil {
		return nil, "", fmt.Errorf("error iterating rows: %w", err)
	}

	return results, storeName, nil
}

// GetActiveStoreIDs returns a list of store IDs from the legacy database
// Returns all stores without filtering by status (matching the original query behavior)
func (r *StockHealthRepository) GetActiveStoreIDs(ctx context.Context) ([]int, error) {
	query := `SELECT id_store FROM ap_store ORDER BY id_store`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query stores: %w", err)
	}
	defer rows.Close()

	var storeIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("failed to scan store ID: %w", err)
		}
		storeIDs = append(storeIDs, id)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating store IDs: %w", err)
	}

	return storeIDs, nil
}

// GetStoreNameByID retrieves the store name for a given store ID
func (r *StockHealthRepository) GetStoreNameByID(ctx context.Context, storeID int) (string, error) {
	var storeName string
	query := `SELECT store FROM ap_store WHERE id_store = ?`
	err := r.db.QueryRowContext(ctx, query, storeID).Scan(&storeName)
	if err != nil {
		return "", fmt.Errorf("failed to get store name for ID %d: %w", storeID, err)
	}
	return storeName, nil
}

func nullStringValue(ns sql.NullString) string {
	if ns.Valid {
		return strings.TrimSpace(ns.String)
	}
	return ""
}

func nullFloat64Value(nf sql.NullFloat64) float64 {
	if nf.Valid {
		return nf.Float64
	}
	return 0
}
