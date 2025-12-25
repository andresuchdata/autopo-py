package legacydb

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strconv"

	stockhealth "github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
)

// WriteStoreCSV writes stock health rows to a CSV file matching the legacy export format
// Filename format: {snapshotDate}_Miss Glam {StoreName}.csv
func WriteStoreCSV(rows []stockhealth.RawStockRow, storeName, snapshotDate, outputDir string) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create output directory: %w", err)
	}

	// Format filename to match legacy export: YYYYMMDD_Miss Glam StoreName.csv
	filename := fmt.Sprintf("%s_Miss Glam %s.csv", snapshotDate, storeName)
	filePath := filepath.Join(outputDir, filename)

	file, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create CSV file: %w", err)
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	// Write header matching the subset of columns needed for PO calculation
	header := []string{
		"Toko",
		"Brand",
		"SKU",
		"Nama",
		"HPP",
		"Harga",
		"Min Order",
		"Stok",
		"Daily Sales",
		"Max. Daily Sales",
		"Lead Time",
		"Max. Lead Time",
		"Sedang PO",
	}

	if err := writer.Write(header); err != nil {
		return "", fmt.Errorf("failed to write CSV header: %w", err)
	}

	// Write data rows
	for _, row := range rows {
		record := []string{
			row.Toko,
			row.Brand,
			row.SKU,
			row.Nama,
			formatFloat(row.HPP),
			formatFloat(row.Harga),
			formatFloat(row.MinOrder),
			formatFloat(row.Stock),
			formatFloat(row.DailySales),
			formatFloat(row.MaxDailySales),
			formatFloat(row.LeadTime),
			formatFloat(row.MaxLeadTime),
			formatFloat(row.SedangPO),
		}

		if err := writer.Write(record); err != nil {
			return "", fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	if err := writer.Error(); err != nil {
		return "", fmt.Errorf("CSV writer error: %w", err)
	}

	return filePath, nil
}

func formatFloat(f float64) string {
	// Format with 2 decimal places, removing trailing zeros
	s := strconv.FormatFloat(f, 'f', 2, 64)
	// Remove trailing zeros after decimal point
	if len(s) > 0 && s[len(s)-1] == '0' {
		for len(s) > 0 && s[len(s)-1] == '0' {
			s = s[:len(s)-1]
		}
		if len(s) > 0 && s[len(s)-1] == '.' {
			s = s[:len(s)-1]
		}
	}
	return s
}
