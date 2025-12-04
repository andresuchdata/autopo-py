package stock_health

import "math"

// InventoryCalculator calculates inventory metrics based on the logic from main.ipynb
type InventoryCalculator struct {
	specialSKUs map[string]bool
}

// NewInventoryCalculator creates a new inventory calculator
func NewInventoryCalculator(specialSKUs map[string]bool) *InventoryCalculator {
	return &InventoryCalculator{
		specialSKUs: specialSKUs,
	}
}

// Calculate computes all inventory metrics for a stock row
// This ports the logic from calculate_inventory_metrics() in main.ipynb
func (ic *InventoryCalculator) Calculate(row *RawStockRow) InventoryMetrics {
	metrics := InventoryMetrics{}

	// 1. Safety stock = (Max Daily Sales × Max Lead Time) - (Daily Sales × Lead Time)
	safetyStock := (row.MaxDailySales * row.MaxLeadTime) - (row.DailySales * row.LeadTime)
	metrics.SafetyStock = int(math.Ceil(math.Max(0, safetyStock)))

	// 2. Reorder point = (Daily Sales × Lead Time) + Safety Stock
	reorderPoint := (row.DailySales * row.LeadTime) + float64(metrics.SafetyStock)
	metrics.ReorderPoint = int(math.Ceil(math.Max(0, reorderPoint)))

	// 3. Target days cover (30 or 60 days based on special SKUs)
	metrics.TargetDaysCover = 30
	if ic.specialSKUs[row.SKU] {
		metrics.TargetDaysCover = 60
	}

	// 4. Quantity for target days cover
	qtyForTarget := row.DailySales * float64(metrics.TargetDaysCover)
	metrics.QtyForTargetDaysCover = int(math.Ceil(math.Max(0, qtyForTarget)))

	// 5. Current days stock cover
	if row.DailySales > 0 {
		metrics.CurrentDaysStockCover = row.Stock / row.DailySales
	} else {
		metrics.CurrentDaysStockCover = 0
	}

	// 6. Is open PO flag
	if metrics.CurrentDaysStockCover < float64(metrics.TargetDaysCover) &&
		row.Stock <= float64(metrics.ReorderPoint) {
		metrics.IsOpenPO = 1
	} else {
		metrics.IsOpenPO = 0
	}

	// 7. Initial PO quantity
	initialQty := float64(metrics.QtyForTargetDaysCover) - row.Stock - row.SedangPO
	if metrics.IsOpenPO == 1 {
		metrics.InitialQtyPO = int(math.Max(0, math.Ceil(initialQty)))
	} else {
		metrics.InitialQtyPO = 0
	}

	// 8. Emergency PO quantity
	emergencyQty := (row.MaxLeadTime - metrics.CurrentDaysStockCover) * row.DailySales
	if row.SedangPO > 0 {
		metrics.EmergencyPOQty = int(math.Max(0, emergencyQty))
	} else {
		metrics.EmergencyPOQty = int(math.Max(0, math.Ceil(emergencyQty)))
	}

	// 9. Updated regular PO quantity
	updatedRegular := metrics.InitialQtyPO - metrics.EmergencyPOQty
	metrics.UpdatedRegularPOQty = int(math.Max(0, float64(updatedRegular)))

	// 10. Final updated regular PO quantity (enforce minimum order)
	if metrics.UpdatedRegularPOQty > 0 && float64(metrics.UpdatedRegularPOQty) < row.MinOrder {
		metrics.FinalUpdatedRegularPOQty = int(row.MinOrder)
	} else {
		metrics.FinalUpdatedRegularPOQty = metrics.UpdatedRegularPOQty
	}

	// 11. Calculate costs
	metrics.EmergencyPOCost = float64(metrics.EmergencyPOQty) * row.HPP
	metrics.FinalUpdatedRegularPOCost = float64(metrics.FinalUpdatedRegularPOQty) * row.HPP

	return metrics
}
