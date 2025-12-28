package stock_health_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
)

func TestStockHealthPipeline_IngestionMetrics(t *testing.T) {
	// Sample CSV with varied data formats and multiple rows
	content := "toko;brand;sku;nama;stok;daily_sales;max_daily_sales;lead_time;max_lead_time;sedang_po;hpp;harga;min_order\n" +
		"PADANG;BRAND1;SKU1;Item 1;100;10;15;3;5;0;1000;2000;0\n" + // stok=100, val=100000
		"PADANG;BRAND1;SKU2;Item 2;50;5;10;3;5;20;2500;5000;0\n" + // stok=50, val=125000
		"PADANG;BRAND2;SKU3;Item 3;200;2,5;4,0;7;10;0;500;1000;10\n" // stok=200, val=100000

	tmpDir, _ := os.MkdirTemp("", "test_metrics")
	defer os.RemoveAll(tmpDir)

	tmpFile := filepath.Join(tmpDir, "20251228_PADANG.csv")
	os.WriteFile(tmpFile, []byte(content), 0644)

	p, _ := stock_health.NewStockHealthPipeline(stock_health.Config{InputDateFormat: "20060102"})
	rows, _, err := p.ReadAndCleanCSV(tmpFile)

	if err != nil {
		t.Fatalf("ReadAndCleanCSV failed: %v", err)
	}

	// 1. Same number of rows
	expectedRows := 3
	if len(rows) != expectedRows {
		t.Errorf("expected %d rows, got %d", expectedRows, len(rows))
	}

	// 2. Same number of unique SKUs
	skus := make(map[string]bool)
	totalStock := 0.0
	totalValue := 0.0
	for _, r := range rows {
		skus[r.SKU] = true
		totalStock += r.Stock
		totalValue += (r.Stock * r.HPP)
	}

	expectedUniques := 3
	if len(skus) != expectedUniques {
		t.Errorf("expected %d unique SKUs, got %d", expectedUniques, len(skus))
	}

	// 3. Same total stock quantity
	expectedStock := 350.0 // 100 + 50 + 200
	if totalStock != expectedStock {
		t.Errorf("expected total stock %v, got %v", expectedStock, totalStock)
	}

	// 4. Same total value (qty * hpp)
	expectedValue := 325000.0 // 100,000 + 125,000 + 100,000
	if totalValue != expectedValue {
		t.Errorf("expected total value %v, got %v", expectedValue, totalValue)
	}
}
