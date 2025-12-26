package stock_health

import (
	"encoding/csv"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

// normalizeColumnName normalizes column names for case-insensitive matching
var columnNameSanitizer = strings.NewReplacer(" ", "", "_", "", ".", "", "-", "", "/", "")

func normalizeColumnName(name string) string {
	name = strings.TrimSpace(strings.ToLower(name))
	return columnNameSanitizer.Replace(name)
}

// normalizeStoreNameForSupplier normalizes store names from both stock files
// and supplier master so they can be joined reliably.
func normalizeStoreNameForSupplier(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	// Reuse getStoreNameFromFilename-style normalization where possible by
	// uppercasing and trimming common prefixes like "Miss Glam".
	upper := strings.ToUpper(name)
	parts := strings.Fields(upper)
	if len(parts) >= 3 && parts[0] == "MISS" && parts[1] == "GLAM" {
		return strings.TrimSpace(strings.Join(parts[2:], " "))
	}
	return strings.TrimSpace(upper)
}

// normalizeStoreNameForFile creates a filesystem-safe version of store name for file naming
func normalizeStoreNameForFile(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "unknown"
	}
	// Replace spaces and special characters with underscores
	replacer := strings.NewReplacer(
		" ", "_",
		"/", "_",
		"\\", "_",
		":", "_",
		"*", "_",
		"?", "_",
		"\"", "_",
		"<", "_",
		">", "_",
		"|", "_",
	)
	return strings.ToLower(replacer.Replace(name))
}

// getStoreNameFromGenericFilename extracts store name from filename
func getStoreNameFromGenericFilename(path string, inputDateFormat string) string {
	base := filepath.Base(path)
	name := strings.TrimSuffix(base, filepath.Ext(base))
	// Strip leading date prefix if it matches the configured layout followed by '_'
	layout := inputDateFormat
	if layout == "" {
		layout = "20060102"
	}
	if len(name) > len(layout)+1 && name[len(layout)] == '_' {
		if _, err := time.Parse(layout, name[:len(layout)]); err == nil {
			name = name[len(layout)+1:]
		}
	}
	parts := strings.Fields(name)
	if len(parts) >= 3 && strings.EqualFold(parts[1], "miss") && strings.EqualFold(parts[2], "glam") {
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[3:], " ")))
	}
	if len(parts) >= 2 && strings.EqualFold(parts[0], "miss") && strings.EqualFold(parts[1], "glam") {
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[2:], " ")))
	}
	if len(parts) > 1 {
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[1:], " ")))
	}
	if len(parts) == 1 {
		return strings.ToUpper(strings.TrimSpace(parts[0]))
	}
	return ""
}

// loadTop100SKUsByStore loads top 100 SKU files for each store
func loadTop100SKUsByStore(dir string, inputDateFormat string) map[string]map[string]bool {
	res := make(map[string]map[string]bool)
	if strings.TrimSpace(dir) == "" {
		return res
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return res
	}
	// We derive store key from filename using the same convention as the notebook.
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".xlsx" && ext != ".csv" {
			continue
		}
		path := filepath.Join(dir, name)
		storeKey := getStoreNameFromGenericFilename(path, inputDateFormat)
		if storeKey == "" {
			continue
		}
		var skus []string
		if ext == ".xlsx" {
			skus = readTop100FromXLSX(path)
		} else {
			skus = readTop100FromCSV(path)
		}
		if len(skus) == 0 {
			continue
		}
		set := make(map[string]bool)
		for _, sku := range skus {
			sku = strings.TrimSpace(sku)
			if sku == "" {
				continue
			}
			set[sku] = true
		}
		if len(set) > 0 {
			res[storeKey] = set
		}
	}
	return res
}

func readTop100FromXLSX(path string) []string {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil
	}
	sheet := sheets[0]
	rows, err := f.Rows(sheet)
	if err != nil {
		return nil
	}
	defer rows.Close()
	// Read header to locate SKU column
	if !rows.Next() {
		return nil
	}
	header, err := rows.Columns()
	if err != nil {
		return nil
	}
	skuIdx := 0
	for i, h := range header {
		if normalizeColumnName(h) == "sku" {
			skuIdx = i
			break
		}
	}

	var out []string
	for rows.Next() {
		record, err := rows.Columns()
		if err != nil {
			break
		}
		if skuIdx >= len(record) {
			continue
		}
		sku := strings.TrimSpace(record[skuIdx])
		if sku == "" {
			continue
		}
		out = append(out, sku)
		if len(out) >= 100 {
			break
		}
	}
	return out
}

func readTop100FromCSV(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.TrimLeadingSpace = true
	header, err := r.Read()
	if err != nil {
		return nil
	}
	skuIdx := 0
	for i, h := range header {
		if normalizeColumnName(h) == "sku" {
			skuIdx = i
			break
		}
	}
	var out []string
	for {
		rec, err := r.Read()
		if err != nil {
			break
		}
		if skuIdx >= len(rec) {
			continue
		}
		sku := strings.TrimSpace(rec[skuIdx])
		if sku == "" {
			continue
		}
		out = append(out, sku)
		if len(out) >= 100 {
			break
		}
	}
	return out
}
