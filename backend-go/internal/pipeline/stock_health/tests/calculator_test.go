package stock_health_test

import (
	"testing"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
)

func TestInventoryCalculator_Calculate(t *testing.T) {
	specialSKUs := map[string]bool{"SPECIAL1": true}
	top100 := map[string]map[string]bool{
		"PADANG": {"TOP1": true},
	}
	ic := stock_health.NewInventoryCalculator(specialSKUs, top100)

	tests := []struct {
		name     string
		row      stock_health.RawStockRow
		expected stock_health.InventoryMetrics
	}{
		{
			name: "Normal calculation",
			row: stock_health.RawStockRow{
				SKU:           "SKU1",
				Toko:          "Padang",
				DailySales:    10.0,
				MaxDailySales: 15.0,
				LeadTime:      3.0,
				MaxLeadTime:   5.0,
				Stock:         20.0,
				SedangPO:      0.0,
				HPP:           1000.0,
				MinOrder:      5.0,
			},
			expected: stock_health.InventoryMetrics{
				SafetyStock:               45, // (15*5)-(10*3) = 75-30=45
				ReorderPoint:              75, // (10*3)+45 = 75
				TargetDaysCover:           30,
				QtyForTargetDaysCover:     300, // 10*30 = 300
				CurrentDaysStockCover:     2.0, // 20/10 = 2
				IsOpenPO:                  1,   // 2 < 30 and 20 <= 75
				InitialQtyPO:              280, // 300 - 20 - 0 = 280
				EmergencyPOQty:            0,
				UpdatedRegularPOQty:       280,
				FinalUpdatedRegularPOQty:  280,
				EmergencyPOCost:           0,
				FinalUpdatedRegularPOCost: 280000,
			},
		},
		{
			name: "Emergency PO for Top 100",
			row: stock_health.RawStockRow{
				SKU:           "TOP1",
				Toko:          "PADANG",
				DailySales:    10.0,
				MaxDailySales: 15.0,
				LeadTime:      3.0,
				MaxLeadTime:   5.0,
				Stock:         20.0,
				SedangPO:      10.0,
				HPP:           1000.0,
				MinOrder:      5.0,
			},
			expected: stock_health.InventoryMetrics{
				SafetyStock:               45,
				ReorderPoint:              75,
				EmergencyPOQty:            30, // (5-2)*10 = 30
				EmergencyPOCost:           30000,
				FinalUpdatedRegularPOCost: 270000, // (300-20-10)*1000 = 270000
			},
		},
		{
			name: "Minimum Order Enforcement when PO is open",
			row: stock_health.RawStockRow{
				SKU:           "SKU3",
				Toko:          "PADANG",
				DailySales:    1.0,
				MaxDailySales: 1.0,
				LeadTime:      1.0,
				MaxLeadTime:   1.0,
				Stock:         0.0,
				SedangPO:      0.0,
				HPP:           1000.0,
				MinOrder:      50.0,
			},
			expected: stock_health.InventoryMetrics{
				SafetyStock:              0,
				ReorderPoint:             1,
				IsOpenPO:                 1,
				InitialQtyPO:             30, // 30*1 - 0 = 30
				FinalUpdatedRegularPOQty: 50, // enforced min order 50
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ic.Calculate(&tt.row)
			if got.SafetyStock != tt.expected.SafetyStock {
				t.Errorf("SafetyStock: got %v, want %v", got.SafetyStock, tt.expected.SafetyStock)
			}
			if got.ReorderPoint != tt.expected.ReorderPoint {
				t.Errorf("ReorderPoint: got %v, want %v", got.ReorderPoint, tt.expected.ReorderPoint)
			}
			if got.EmergencyPOQty != tt.expected.EmergencyPOQty {
				t.Errorf("EmergencyPOQty: got %v, want %v", got.EmergencyPOQty, tt.expected.EmergencyPOQty)
			}
			if tt.name == "Minimum Order Enforcement when PO is open" {
				if got.FinalUpdatedRegularPOQty != tt.expected.FinalUpdatedRegularPOQty {
					t.Errorf("FinalUpdatedRegularPOQty: got %v, want %v", got.FinalUpdatedRegularPOQty, tt.expected.FinalUpdatedRegularPOQty)
				}
			}
		})
	}
}
