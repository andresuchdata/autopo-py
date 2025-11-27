// backend-go/internal/domain/models.go
package domain

import "time"

// Store represents a store location
type Store struct {
	ID        int64     `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// POResult represents the result of processing a PO record
type POResult struct {
	ID             int64     `json:"id" db:"id"`
	StoreID        int64     `json:"store_id" db:"store_id"`
	StoreName      string    `json:"store_name" db:"-"`
	SKU            string    `json:"sku" db:"sku"`
	ProductName    string    `json:"product_name" db:"product_name"`
	Stock          int       `json:"stock" db:"stock"`
	DailySales     float64   `json:"daily_sales" db:"daily_sales"`
	StockCoverDays float64   `json:"stock_cover_days" db:"stock_cover_days"`
	Status         string    `json:"status" db:"status"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}

// UploadedFile represents an uploaded file for processing
type UploadedFile struct {
	Filename string
	Path     string
	Size     int64
}

// StoreResult represents the result of processing a store's PO file
type StoreResult struct {
	StoreName   string    `json:"store_name"`
	TotalItems  int       `json:"total_items"`
	ProcessedAt time.Time `json:"processed_at"`
}

// PORecord represents a single record from a PO file
type PORecord struct {
	SKU         string
	ProductName string
	Stock       int
	DailySales  float64
}

// StockHealth represents the stock health status for a product in a store
type StockHealth struct {
	ID             int64     `json:"id" db:"id"`
	StoreID        int64     `json:"store_id" db:"store_id"`
	StoreName      string    `json:"store_name" db:"store_name"`
	SKUID          string    `json:"sku_id" db:"sku_id"`
	SKUCode        string    `json:"sku_code" db:"sku_code"`
	ProductName    string    `json:"product_name" db:"product_name"`
	BrandID        int64     `json:"brand_id" db:"brand_id"`
	BrandName      string    `json:"brand_name" db:"brand_name"`
	CurrentStock   int       `json:"current_stock" db:"current_stock"`
	DaysOfCover    int       `json:"days_of_cover" db:"days_of_cover"`
	StockDate      time.Time `json:"stock_date" db:"stock_date"`
	LastUpdated    time.Time `json:"last_updated" db:"last_updated"`
	StockCondition string    `json:"stock_condition" db:"stock_condition"`
}

// StockHealthSummary represents a summary of stock conditions
type StockHealthSummary struct {
	Condition string `json:"condition" db:"stock_condition"`
	Count     int    `json:"count" db:"count"`
}

// TimeSeriesData represents time series data for stock health
type TimeSeriesData struct {
	Date  string `json:"date" db:"date"`
	Count int    `json:"count" db:"count"`
}

// StockHealthFilter represents filters for stock health queries
type StockHealthFilter struct {
	StoreIDs  []int64  `json:"store_ids"`
	SKUIds    []string `json:"sku_ids"`
	BrandIDs  []int64  `json:"brand_ids"`
	Condition string   `json:"condition"`
	Page      int      `json:"page"`
	PageSize  int      `json:"page_size"`
}

// StockHealthDashboard represents the dashboard data
type StockHealthDashboard struct {
	Summary    []StockHealthSummary        `json:"summary"`
	TimeSeries map[string][]TimeSeriesData `json:"time_series"`
}
