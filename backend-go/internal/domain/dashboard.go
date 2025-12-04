package domain

// POStatusSummary represents the summary card data for a specific PO status
type POStatusSummary struct {
	Status     string  `json:"status" db:"status"`
	Count      int     `json:"count" db:"count"`
	TotalValue float64 `json:"total_value" db:"total_value"`
	AvgDays    float64 `json:"avg_days" db:"avg_days"`
	DiffDays   int     `json:"diff_days" db:"diff_days"` // Difference in days from current date (for "big number") - wait, the requirement says "big number on the center is date of the respective status become the status... and difference with current date". Let's assume this means average duration or similar. Actually looking at image: "8" for Released, "24" for Sent. It seems to be the Count?
	// Re-reading requirement: "big number on the center is date of the respective status become the status (PO Released, Sent, etc) and difference with current date"
	// Image shows: "PO Released 8", "PO Sent 24". These look like Counts.
	// Below it says "67 Rp 37.1 mio".
	// Let's stick to the image as the primary source of truth for "Big Number". It is likely the Count.
	// The "date of respective status" might be the small text?
	// Let's provide all necessary data.
}

// POLifecycleFunnel represents the funnel chart data
type POLifecycleFunnel struct {
	Stage      string  `json:"stage"`
	Count      int     `json:"count"`
	TotalValue float64 `json:"total_value"`
}

// POTrend represents a data point in the trend chart
type POTrend struct {
	Date   string `json:"date" db:"date"`     // e.g., "Week 1", "2023-10-25"
	Status string `json:"status" db:"status"` // e.g., "Released", "Sent"
	Count  int    `json:"count" db:"count"`
}

// POAging represents a PO in the aging table
type POAging struct {
	PONumber     string  `json:"po_number" db:"po_number"`
	Status       string  `json:"status" db:"status_label"` // "Arrived", "Approved" etc.
	Quantity     int     `json:"quantity" db:"po_qty"`
	Value        float64 `json:"value" db:"total_amount"` // Calculated from items or stored
	DaysInStatus int     `json:"days_in_status" db:"days_in_status"`
}

// SupplierPerformance represents a supplier's performance metric
type SupplierPerformance struct {
	SupplierID   int64   `json:"supplier_id" db:"supplier_id"`
	SupplierName string  `json:"supplier_name" db:"supplier_name"`
	AvgLeadTime  float64 `json:"avg_lead_time" db:"avg_lead_time"` // Days
}

// DashboardSummary aggregates all dashboard data
type DashboardSummary struct {
	StatusSummaries     []POStatusSummary     `json:"status_summaries"`
	LifecycleFunnel     []POLifecycleFunnel   `json:"lifecycle_funnel"`
	Trends              []POTrend             `json:"trends"`
	Aging               []POAging             `json:"aging"`
	SupplierPerformance []SupplierPerformance `json:"supplier_performance"`
}

// POSnapshotItem represents a single PO snapshot item for the detail dialog
type POSnapshotItem struct {
	PONumber     string  `json:"po_number" db:"po_number"`
	BrandName    string  `json:"brand_name" db:"brand_name"`
	SKU          string  `json:"sku" db:"sku"`
	ProductName  string  `json:"product_name" db:"product_name"`
	StoreName    string  `json:"store_name" db:"store_name"`
	UnitPrice    float64 `json:"unit_price" db:"unit_price"`
	TotalAmount  float64 `json:"total_amount" db:"total_amount"`
	POQty        int     `json:"po_qty" db:"po_qty"`
	ReceivedQty  *int    `json:"received_qty" db:"received_qty"`
	POReleasedAt *string `json:"po_released_at" db:"po_released_at"`
	POSentAt     *string `json:"po_sent_at" db:"po_sent_at"`
	POApprovedAt *string `json:"po_approved_at" db:"po_approved_at"`
	POArrivedAt  *string `json:"po_arrived_at" db:"po_arrived_at"`
}

// POSnapshotItemsResponse represents the paginated response for PO snapshot items
type POSnapshotItemsResponse struct {
	Items      []POSnapshotItem `json:"items"`
	Total      int              `json:"total"`
	Page       int              `json:"page"`
	PageSize   int              `json:"page_size"`
	TotalPages int              `json:"total_pages"`
}
