package legacydb

import (
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	stockhealth "github.com/andresuchdata/autopo-py/backend-go/internal/pipeline/stock_health"
)

// WriteStoreCSV writes stock health rows to a CSV file matching the legacy export format
// Filename format: {snapshotDate}_Miss Glam {StoreName}.csv
func WriteStoreCSV(rows []stockhealth.RawStockRow, storeName, snapshotDate, outputDir string) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create output directory: %w", err)
	}

	// Clean up store name: if it already starts with "Miss Glam", don't prepended it again.
	cleanStoreName := strings.TrimSpace(storeName)
	if strings.HasPrefix(strings.ToLower(cleanStoreName), "miss glam") {
		// Just use the name as is (it already has the prefix)
	} else {
		cleanStoreName = "Miss Glam " + cleanStoreName
	}

	// Format filename to match legacy export: YYYYMMDD_Miss Glam StoreName.csv
	filename := fmt.Sprintf("%s_%s.csv", snapshotDate, cleanStoreName)
	filePath := filepath.Join(outputDir, filename)

	file, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create CSV file: %w", err)
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	writer.Comma = ';' // Use semicolon for Indonesian locale
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

func formatFloat(v float64) string {
	// Use Indonesian locale conventions: thousands separator as dot and decimal separator as comma.
	// Matching the logic from stock_health/util.go but simplified if needed.
	s := strconv.FormatFloat(v, 'f', 2, 64)
	parts := strings.Split(s, ".")
	intPart := parts[0]
	fracPart := ""
	if len(parts) > 1 {
		fracPart = parts[1]
	}

	// Format integer part with dot as thousands separator
	if len(intPart) > 3 {
		var buf []byte
		count := 0
		for i := len(intPart) - 1; i >= 0; i-- {
			buf = append(buf, intPart[i])
			count++
			if count == 3 && i != 0 {
				buf = append(buf, '.')
				count = 0
			}
		}
		// Reverse buf
		for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
			buf[i], buf[j] = buf[j], buf[i]
		}
		intPart = string(buf)
	}

	res := intPart
	if v < 0 {
		// handle negative if needed, though unlikely for these fields
	}

	// For legacy compatibility, we might want to strip trailing zeros, but the request says "comma as decimal".
	// Let's keep 2 decimals for consistency unless it's .00
	if fracPart == "00" {
		return res
	}
	// Strip one trailing zero if it's there
	if strings.HasSuffix(fracPart, "0") {
		fracPart = fracPart[:1]
	}

	return res + "," + fracPart
}
