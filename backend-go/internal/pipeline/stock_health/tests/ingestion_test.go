package stock_health_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
)

func TestStockHealthPipeline_GetSnapshotDate(t *testing.T) {
	p, _ := stock_health.NewStockHealthPipeline(stock_health.Config{InputDateFormat: "20060102"})

	tests := []struct {
		filename string
		expected string
	}{
		{"20220113_Miss Glam Padang.csv", "PADANG"},
		{"1. Miss Glam Padang.csv", "PADANG"},
		{"123. Miss Glam Padang.csv", "PADANG"},
		{"20251231_Padang.csv", "PADANG"},
		{"PEKANBARU.csv", "PEKANBARU"},
		{"002 Miss Glam Pekanbaru.csv", "PEKANBARU"},
	}

	for _, tt := range tests {
		got := p.GetStoreNameFromFilename(tt.filename)
		if got != tt.expected {
			t.Errorf("filename %q: got %q, want %q", tt.filename, got, tt.expected)
		}
	}
}

func TestStockHealthPipeline_ReadAndCleanCSV(t *testing.T) {
	content := "toko;brand;sku;nama;stok;daily_sales;max_daily_sales;lead_time;max_lead_time;sedang_po;hpp;harga;min_order\n" +
		"PADANG;BRAND1;SKU1;Item 1;10;2,5;4,0;3;5;0;1000;2000;5\n"

	tmpDir, _ := os.MkdirTemp("", "test_ingestion")
	defer os.RemoveAll(tmpDir)

	tmpFile := filepath.Join(tmpDir, "20251228_PADANG.csv")
	os.WriteFile(tmpFile, []byte(content), 0644)

	p, _ := stock_health.NewStockHealthPipeline(stock_health.Config{InputDateFormat: "20060102"})
	rows, _, err := p.ReadAndCleanCSV(tmpFile)

	if err != nil {
		t.Fatalf("ReadAndCleanCSV failed: %v", err)
	}

	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}

	row := rows[0]
	if row.Toko != "PADANG" {
		t.Errorf("expected Toko PADANG, got %q", row.Toko)
	}

	if row.DailySales != 2.5 {
		t.Errorf("expected DailySales 2.5, got %v", row.DailySales)
	}
}
