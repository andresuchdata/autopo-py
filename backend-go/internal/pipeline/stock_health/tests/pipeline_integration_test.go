package stock_health_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
)

func TestStockHealthPipeline_Transform(t *testing.T) {
	// Sample CSV
	content := "toko;brand;sku;nama;stok;daily_sales;max_daily_sales;lead_time;max_lead_time;sedang_po;hpp;harga;min_order\n" +
		"PADANG;BRAND1;SKU1;Item 1;10;1;2;3;5;0;1000;2000;0\n"

	tmpDir, _ := os.MkdirTemp("", "test_pipeline_int")
	defer os.RemoveAll(tmpDir)

	tmpFile := filepath.Join(tmpDir, "20251228_PADANG.csv")
	os.WriteFile(tmpFile, []byte(content), 0644)

	// Suppress debug layers for test to avoid folder creation spam
	p, _ := stock_health.NewStockHealthPipeline(stock_health.Config{
		InputDateFormat:    "20060102",
		PersistDebugLayers: false,
		IntermediateDir:    tmpDir,
		OutputDir:          tmpDir,
	})

	ctx := context.Background()
	results, err := p.Transform(ctx, tmpFile)

	if err != nil {
		t.Fatalf("Transform failed: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	data := results[0].Data
	if data["sku"] != "SKU1" {
		t.Errorf("expected SKU SKU1, got %v", data["sku"])
	}

	// Verify a few calculated metrics
	if data["safety_stock"] != 7 { // (2*5) - (1*3) = 10 - 3 = 7
		t.Errorf("expected safety_stock 7, got %v", data["safety_stock"])
	}
	if data["is_open_po"] != 1 { // Stock 10 < Target 30 and <= ROP 10
		t.Errorf("expected is_open_po 1, got %v", data["is_open_po"])
	}
}
