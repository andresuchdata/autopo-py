package stock_health

import "time"

// RawStockRow represents a single row from the input XLSX file
type RawStockRow struct {
	Brand         string
	SKU           string
	Nama          string  // Product name
	Stock         float64 // Current stock (Stok)
	DailySales    float64 // Average daily sales
	MaxDailySales float64 // Maximum daily sales
	LeadTime      float64 // Lead time in days
	MaxLeadTime   float64 // Maximum lead time in days
	SedangPO      float64 // Currently on PO
	HPP           float64 // Cost price
	Harga         float64 // Selling price
	MinOrder      float64 // Minimum order quantity
	Toko          string  // Store name
	Contribution  float64 // Store contribution percentage
}

// InventoryMetrics holds calculated inventory metrics
type InventoryMetrics struct {
	SafetyStock               int     // Safety stock level
	ReorderPoint              int     // Reorder point
	TargetDaysCover           int     // Target days of stock cover (30 or 60)
	QtyForTargetDaysCover     int     // Quantity needed for target days
	CurrentDaysStockCover     float64 // Current days of stock cover
	IsOpenPO                  int     // Flag: 1 if PO should be opened
	InitialQtyPO              int     // Initial PO quantity
	EmergencyPOQty            int     // Emergency PO quantity
	UpdatedRegularPOQty       int     // Updated regular PO quantity
	FinalUpdatedRegularPOQty  int     // Final regular PO quantity (with min order)
	EmergencyPOCost           float64 // Cost of emergency PO
	FinalUpdatedRegularPOCost float64 // Cost of final regular PO
}

// TransformedStockRow represents a fully processed row with all calculations
type TransformedStockRow struct {
	// Original fields
	Brand string
	SKU   string
	Nama  string
	Toko  string
	Stock float64
	HPP   float64
	Harga float64

	// Sales metrics
	DailySales    float64
	MaxDailySales float64

	// Lead time
	LeadTime    float64
	MaxLeadTime float64

	// PO info
	SedangPO float64
	MinOrder float64

	// Store info
	Contribution float64

	// Calculated metrics
	Metrics InventoryMetrics

	// Supplier info (merged later)
	SupplierStore string // Nama Store from supplier data
	SupplierName  string // Nama Supplier
	SupplierPhone string // No HP
}

// SupplierData represents supplier information
type SupplierData struct {
	SKU          string
	Brand        string
	NamaStore    string // Store name
	NamaSupplier string // Supplier name
	NoHP         string // Phone number
}

// StoreContribution represents contribution percentage for each store
type StoreContribution struct {
	StoreName    string
	Contribution float64 // Percentage (0-100)
}

// Config holds configuration for the stock health pipeline
type Config struct {
	SpecialSKUs        map[string]bool // SKUs that need 60 days cover instead of 30
	SupplierData       []SupplierData
	StoreContributions []StoreContribution
	PadangStoreName    string // Reference store name (usually "Miss Glam Padang")
	InputDateFormat    string // Date format in input filenames
	OutputDir          string // Directory for output CSVs

	// Hybrid intermediate persistence configuration
	// IntermediateDir is the root directory for per-file intermediate outputs
	// The pipeline will use the following subdirectories under this root:
	//   1_cleaned_base/     - cleaned pre-join table (only if PersistDebugLayers is true)
	//   2_cleaned_merged/   - cleaned+merged table (always written when PersistMergedOnly is true)
	//   3_with_metrics/     - table with calculated inventory metrics
	IntermediateDir    string
	PersistMergedOnly  bool
	PersistDebugLayers bool
}

// ProcessingSummary holds summary statistics for a processed file
type ProcessingSummary struct {
	FileName        string
	Location        string
	ContributionPct float64
	TotalRows       int
	PadangSuppliers int
	OtherSuppliers  int
	NoSupplier      int
	Status          string
	ProcessingTime  time.Duration
}

// OutputFormat defines the type of output CSV to generate
type OutputFormat string

const (
	FormatComplete  OutputFormat = "complete"  // All columns
	FormatM2        OutputFormat = "m2"        // M2 format: Toko, SKU, HPP, final_updated_regular_po_qty
	FormatEmergency OutputFormat = "emergency" // Emergency PO: Brand, SKU, Nama, Toko, HPP, emergency_po_qty, emergency_po_cost
)
