package stock_health

import (
	"bufio"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
)

// readAndCleanCSV reads a CSV file into RawStockRow slice.
func (p *StockHealthPipeline) readAndCleanCSV(path string) ([]RawStockRow, []string, error) {
	// Derive store name and contribution from the filename, matching notebook logic
	storeName := p.getStoreNameFromFilename(path)
	contributionPct := p.getContributionPct(storeName)

	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.TrimLeadingSpace = true

	// Auto-detect delimiter from first line if needed
	fileForCheck, err := os.Open(path)
	if err == nil {
		bufReader := bufio.NewReader(fileForCheck)
		firstLine, _ := bufReader.ReadString('\n')
		fileForCheck.Close()

		reader.Comma = pipeline.DetectCSVDelimiter(firstLine)
	}

	header, err := reader.Read()
	if err != nil {
		return nil, nil, err
	}

	colIndex := func(names ...string) int {
		if len(names) == 0 {
			return -1
		}
		targets := make(map[string]struct{}, len(names))
		for _, name := range names {
			targets[normalizeColumnName(name)] = struct{}{}
		}
		for i, h := range header {
			if _, ok := targets[normalizeColumnName(h)]; ok {
				return i
			}
		}
		return -1
	}

	idxBrand := colIndex("brand")
	idxSKU := colIndex("sku")
	idxNama := colIndex("nama", "product name")
	idxToko := colIndex("store", "toko", "nama store")
	idxStock := colIndex("stock", "stok")
	idxDailySales := colIndex("daily_sales", "daily sales")
	idxMaxDailySales := colIndex("max_daily_sales", "max. daily sales", "max daily sales")
	idxLeadTime := colIndex("lead_time", "lead time")

	log.Printf("[DEBUG PIPELINE] Column indices - DailySales: %d, MaxDailySales: %d, Stock: %d",
		idxDailySales, idxMaxDailySales, colIndex("stock", "stok"))
	idxMaxLeadTime := colIndex("max_lead_time", "max. lead time", "max lead time")
	idxSedangPO := colIndex("sedang_po", "sedang po")
	idxHPP := colIndex("hpp")
	idxHarga := colIndex("harga")
	idxMinOrder := colIndex("min_order", "min. order", "min order")

	rows := make([]RawStockRow, 0)
	for {
		record, err := reader.Read()
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return nil, nil, err
		}

		get := func(idx int) string {
			if idx < 0 || idx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[idx])
		}

		parseFloat := func(idx int) float64 {
			if idx < 0 || idx >= len(record) {
				return 0
			}
			v := strings.TrimSpace(record[idx])
			if v == "" {
				return 0
			}

			// Detect format:
			// ID/EU: 1.234,56 or 0,56 or 10.000
			// US: 1,234.56 or 0.56 or 10,000

			hasComma := strings.Contains(v, ",")
			hasDot := strings.Contains(v, ".")

			if hasComma && hasDot {
				lastDot := strings.LastIndex(v, ".")
				lastComma := strings.LastIndex(v, ",")
				if lastDot < lastComma {
					// 1.234,56 -> ID format: remove dots, replace comma with dot
					v = strings.ReplaceAll(v, ".", "")
					v = strings.ReplaceAll(v, ",", ".")
				} else {
					// 1,234.56 -> US format: remove commas
					v = strings.ReplaceAll(v, ",", "")
				}
			} else if hasComma {
				// Only comma (0,56) -> ID decimal
				v = strings.ReplaceAll(v, ",", ".")
			} else if hasDot {
				// Only dot (10.000 or 0.5)
				// Heuristic: if strictly blocks of 3 digits after dot, treat as thousand separator
				parts := strings.Split(v, ".")
				isThousand := true
				if len(parts) > 1 {
					for i := 1; i < len(parts); i++ {
						if len(parts[i]) != 3 {
							isThousand = false
							break
						}
					}
				} else {
					isThousand = false
				}

				if isThousand {
					v = strings.ReplaceAll(v, ".", "")
				}
				// else: treat as decimal (0.5), do nothing
			}

			f, _ := strconv.ParseFloat(v, 64)
			return f
		}

		// parse once so we can keep both scaled and original values if needed later
		parsedDaily := parseFloat(idxDailySales)
		parsedMaxDaily := parseFloat(idxMaxDailySales)

		row := RawStockRow{
			Brand:             get(idxBrand),
			SKU:               get(idxSKU),
			Nama:              get(idxNama),
			Toko:              get(idxToko),
			Stock:             parseFloat(idxStock),
			DailySales:        parsedDaily,
			MaxDailySales:     parsedMaxDaily,
			LeadTime:          parseFloat(idxLeadTime),
			MaxLeadTime:       parseFloat(idxMaxLeadTime),
			SedangPO:          parseFloat(idxSedangPO),
			HPP:               parseFloat(idxHPP),
			Harga:             parseFloat(idxHarga),
			MinOrder:          parseFloat(idxMinOrder),
			Contribution:      contributionPct,
			OrigDailySales:    parsedDaily,
			OrigMaxDailySales: parsedMaxDaily,
		}

		rows = append(rows, row)
	}

	return rows, header, nil
}

// getStoreNameFromFilename extracts a normalized store name from the filename.
func (p *StockHealthPipeline) getStoreNameFromFilename(path string) string {
	base := filepath.Base(path)
	name := strings.TrimSuffix(base, filepath.Ext(base))

	// Strip leading date prefix if it matches the configured layout followed by '_'
	layout := p.config.InputDateFormat
	if layout == "" {
		layout = "20060102"
	}
	if len(name) > len(layout)+1 && name[len(layout)] == '_' {
		if _, err := fmt.Sscanf(name[:len(layout)], layout); err == nil {
			name = name[len(layout)+1:]
		}
	}

	parts := strings.Fields(name)
	if len(parts) >= 3 && strings.EqualFold(parts[1], "miss") && strings.EqualFold(parts[2], "glam") {
		// e.g. "002 Miss Glam Pekanbaru" -> "PEKANBARU"
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[3:], " ")))
	}
	if len(parts) >= 2 && strings.EqualFold(parts[0], "miss") && strings.EqualFold(parts[1], "glam") {
		// e.g. "Miss Glam Padang" -> "PADANG"
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[2:], " ")))
	}
	if len(parts) > 1 {
		// Fallback: drop the first token (often a sequence number)
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[1:], " ")))
	}
	if len(parts) == 1 {
		return strings.ToUpper(strings.TrimSpace(parts[0]))
	}
	return ""
}

// getContributionPct looks up the contribution percentage for a store
func (p *StockHealthPipeline) getContributionPct(storeName string) float64 {
	if p.config.StoreContributions == nil {
		return 100
	}
	key := strings.ToUpper(strings.TrimSpace(storeName))
	if key == "" {
		return 100
	}
	if v, ok := p.config.StoreContributions[key]; ok {
		return v
	}

	return 100
}
