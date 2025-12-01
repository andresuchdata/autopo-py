// backend-go/internal/domain/models.go
package domain

import "time"

// Store represents a store location
type Store struct {
	ID         int64     `json:"id" db:"id"`
	Name       string    `json:"name" db:"name"`
	OriginalID string    `json:"original_id" db:"original_id"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time `json:"updated_at" db:"updated_at"`
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
	ID              int64     `json:"id" db:"id"`
	StoreID         int64     `json:"store_id" db:"store_id"`
	StoreName       string    `json:"store_name" db:"store_name"`
	SKUID           string    `json:"sku_id" db:"sku_id"`
	SKUCode         string    `json:"sku_code" db:"sku_code"`
	ProductName     string    `json:"product_name" db:"product_name"`
	BrandID         int64     `json:"brand_id" db:"brand_id"`
	BrandName       string    `json:"brand_name" db:"brand_name"`
	CurrentStock    int       `json:"current_stock" db:"current_stock"`
	DailySales      float64   `json:"daily_sales" db:"daily_sales"`
	DailyStockCover float64   `json:"daily_stock_cover" db:"daily_stock_cover"`
	DaysOfCover     int       `json:"days_of_cover" db:"days_of_cover"`
	StockDate       time.Time `json:"stock_date" db:"stock_date"`
	LastUpdated     time.Time `json:"last_updated" db:"last_updated"`
	StockCondition  string    `json:"stock_condition" db:"stock_condition"`
	HPP             float64   `json:"hpp" db:"hpp"`
}

// StockHealthSummary represents a summary of stock conditions
type StockHealthSummary struct {
	Condition  string  `json:"condition" db:"stock_condition"`
	Count      int     `json:"count" db:"count"`
	TotalStock int64   `json:"total_stock" db:"total_stock"`
	TotalValue float64 `json:"total_value" db:"total_value"`
}

// ConditionBreakdown represents counts per condition for brands or stores
type ConditionBreakdown struct {
	BrandID    int64   `json:"brand_id,omitempty" db:"brand_id"`
	Brand      string  `json:"brand,omitempty" db:"brand_name"`
	StoreID    int64   `json:"store_id,omitempty" db:"store_id"`
	Store      string  `json:"store,omitempty" db:"store_name"`
	Condition  string  `json:"condition" db:"stock_condition"`
	Count      int     `json:"count" db:"count"`
	TotalStock int64   `json:"total_stock" db:"total_stock"`
	TotalValue float64 `json:"total_value" db:"total_value"`
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
	StockDate string   `json:"stock_date"`
	Page      int      `json:"page"`
	PageSize  int      `json:"page_size"`
	Grouping  string   `json:"grouping"`
	SortField string   `json:"sort_field"`
	SortDir   string   `json:"sort_direction"`
}

// StockHealthDashboard represents the dashboard data
type StockHealthDashboard struct {
	Summary        []StockHealthSummary        `json:"summary"`
	TimeSeries     map[string][]TimeSeriesData `json:"time_series"`
	BrandBreakdown []ConditionBreakdown        `json:"brand_breakdown"`
	StoreBreakdown []ConditionBreakdown        `json:"store_breakdown"`
}

// Brand represents a brand entity
type Brand struct {
	ID         int64     `json:"id" db:"id"`
	Name       string    `json:"name" db:"name"`
	OriginalID string    `json:"original_id" db:"original_id"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time `json:"updated_at" db:"updated_at"`
}

// Supplier represents a supplier entity
type Supplier struct {
	ID          int64     `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	OriginalID  string    `json:"original_id" db:"original_id"`
	MinPurchase float64   `json:"min_purchase" db:"min_purchase"`
	TradingTerm string    `json:"trading_term" db:"trading_term"`
	PromoFactor string    `json:"promo_factor" db:"promo_factor"`
	DelayFactor string    `json:"delay_factor" db:"delay_factor"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// Product represents a product entity
type Product struct {
	ID         int64     `json:"id" db:"id"`
	SKUCode    string    `json:"sku_code" db:"sku"`
	Name       string    `json:"name" db:"name"`
	BrandID    int64     `json:"brand_id" db:"brand_id"`
	SupplierID int64     `json:"supplier_id" db:"supplier_id"`
	HPP        float64   `json:"hpp" db:"hpp"`
	Price      float64   `json:"price" db:"price"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time `json:"updated_at" db:"updated_at"`
}

// DailyStockData represents the daily stock and sales data
type DailyStockData struct {
	ID                        int64     `json:"id" db:"id"`
	Date                      time.Time `json:"date" db:"date"`
	StoreID                   int64     `json:"store_id" db:"store_id"`
	ProductID                 int64     `json:"product_id" db:"product_id"`
	Stock                     int       `json:"stock" db:"stock"`
	DailySales                float64   `json:"daily_sales" db:"daily_sales"`
	MaxDailySales             float64   `json:"max_daily_sales" db:"max_daily_sales"`
	OrigDailySales            float64   `json:"orig_daily_sales" db:"orig_daily_sales"`
	OrigMaxDailySales         float64   `json:"orig_max_daily_sales" db:"orig_max_daily_sales"`
	LeadTime                  int       `json:"lead_time" db:"lead_time"`
	MaxLeadTime               int       `json:"max_lead_time" db:"max_lead_time"`
	MinOrder                  int       `json:"min_order" db:"min_order"`
	IsInPadang                bool      `json:"is_in_padang" db:"is_in_padang"`
	SafetyStock               int       `json:"safety_stock" db:"safety_stock"`
	ReorderPoint              int       `json:"reorder_point" db:"reorder_point"`
	SedangPO                  int       `json:"sedang_po" db:"sedang_po"`
	IsOpenPO                  bool      `json:"is_open_po" db:"is_open_po"`
	InitialQtyPO              int       `json:"initial_qty_po" db:"initial_qty_po"`
	EmergencyPOQty            int       `json:"emergency_po_qty" db:"emergency_po_qty"`
	UpdatedRegularPOQty       int       `json:"updated_regular_po_qty" db:"updated_regular_po_qty"`
	FinalUpdatedRegularPOQty  int       `json:"final_updated_regular_po_qty" db:"final_updated_regular_po_qty"`
	EmergencyPOCost           float64   `json:"emergency_po_cost" db:"emergency_po_cost"`
	FinalUpdatedRegularPOCost float64   `json:"final_updated_regular_po_cost" db:"final_updated_regular_po_cost"`
	ContributionPct           float64   `json:"contribution_pct" db:"contribution_pct"`
	ContributionRatio         float64   `json:"contribution_ratio" db:"contribution_ratio"`
	SalesContribution         float64   `json:"sales_contribution" db:"sales_contribution"`
	TargetDays                int       `json:"target_days" db:"target_days"`
	TargetDaysCover           int       `json:"target_days_cover" db:"target_days_cover"`
	DailyStockCover           float64   `json:"daily_stock_cover" db:"daily_stock_cover"`
	CreatedAt                 time.Time `json:"created_at" db:"created_at"`
}
