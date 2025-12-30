package domain

// UpdateETARequest represents the request to update ETA for a PO item or all items in a PO
type UpdateETARequest struct {
	PONumber string  `json:"po_number"`
	SKU      *string `json:"sku"` // If nil, apply to all items in PO
	ETA      string  `json:"eta"` // YYYY-MM-DD
}

// PODetail represents detailed information for a single Purchase Order
type PODetail struct {
	PONumber     string           `json:"po_number" db:"po_number"`
	SupplierID   int64            `json:"supplier_id" db:"supplier_id"`
	SupplierName string           `json:"supplier_name" db:"supplier_name"`
	StoreName    string           `json:"store_name" db:"store_name"`
	BrandName    string           `json:"brand_name" db:"brand_name"`
	Status       string           `json:"status" db:"-"`
	StatusCode   int              `json:"status_code" db:"status"`
	POQty        int              `json:"po_qty" db:"po_qty"`
	ReceivedQty  int              `json:"received_qty" db:"received_qty"`
	TotalAmount  float64          `json:"total_amount" db:"total_amount"` // Actually sum of items amount? Or from PO table?
	POReleasedAt *string          `json:"po_released_at" db:"po_released_at"`
	POSentAt     *string          `json:"po_sent_at" db:"po_sent_at"`
	POApprovedAt *string          `json:"po_approved_at" db:"po_approved_at"`
	POArrivedAt  *string          `json:"po_arrived_at" db:"po_arrived_at"`
	POReceivedAt *string          `json:"po_received_at" db:"po_received_at"`
	Items        []POSnapshotItem `json:"items"` // Reusing POSnapshotItem for simplicity as it has all needed fields
}
