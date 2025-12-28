package stock_health

import (
	"bufio"
	"encoding/csv"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"io"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
)

// ReadAndCleanCSV reads a CSV file into RawStockRow slice.
func (p *StockHealthPipeline) ReadAndCleanCSV(path string) ([]RawStockRow, []string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()

	return p.readAndCleanRows(file, path)
}

// readAndCleanRows reads a CSV from a reader into RawStockRow slice.
func (p *StockHealthPipeline) readAndCleanRows(r io.Reader, pathForFallback string) ([]RawStockRow, []string, error) {
	// We need to peek or read a bit to detect delimiter.
	// If r is already a seeker we could seek back, but it might be a network stream.
	// Best to use a bufio.Reader.
	br := bufio.NewReader(r)

	// Create a new reader from the buffered reader
	reader := csv.NewReader(br)
	reader.TrimLeadingSpace = true

	// Detect delimiter from first line if possible
	peek, _ := br.Peek(1000) // peek up to 1000 bytes
	if len(peek) > 0 {
		firstLine := string(peek)
		if idx := strings.Index(firstLine, "\n"); idx != -1 {
			firstLine = firstLine[:idx]
		}
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

		// Determine store name: prioritize column if available
		rowToko := get(idxToko)
		if rowToko == "" {
			rowToko = p.GetStoreNameFromFilename(pathForFallback)
		}

		// parse once
		parsedDaily := parseFloat(idxDailySales)
		parsedMaxDaily := parseFloat(idxMaxDailySales)

		row := RawStockRow{
			Brand:         get(idxBrand),
			SKU:           get(idxSKU),
			Nama:          get(idxNama),
			Toko:          rowToko,
			Stock:         parseFloat(idxStock),
			DailySales:    parsedDaily,
			MaxDailySales: parsedMaxDaily,
			LeadTime:      parseFloat(idxLeadTime),
			MaxLeadTime:   parseFloat(idxMaxLeadTime),
			SedangPO:      parseFloat(idxSedangPO),
			HPP:           parseFloat(idxHPP),
			Harga:         parseFloat(idxHarga),
			MinOrder:      parseFloat(idxMinOrder),
		}

		rows = append(rows, row)
	}

	return rows, header, nil
}

// GetStoreNameFromFilename extracts a normalized store name from the filename.
func (p *StockHealthPipeline) GetStoreNameFromFilename(path string) string {
	base := filepath.Base(path)
	name := strings.TrimSuffix(base, filepath.Ext(base))

	// 1. Strip leading date prefix if it matches the configured layout followed by '_'
	layout := p.config.InputDateFormat
	if layout == "" {
		layout = "20060102"
	}
	if len(name) > len(layout)+1 && name[len(layout)] == '_' {
		dateStr := name[:len(layout)]
		if _, err := time.Parse(layout, dateStr); err == nil {
			name = name[len(layout)+1:]
		}
	}

	// 2. Tokenize and clean
	parts := strings.Fields(name)
	if len(parts) == 0 {
		return ""
	}

	// 3. Robustly strip common prefixes (sequence numbers, Miss Glam)
	startIdx := 0
	for startIdx < len(parts) {
		token := parts[startIdx]
		tokenLower := strings.ToLower(token)

		// Strip sequence numbers like "1.", "123." or just "002"
		isNumeric := true
		for _, c := range strings.TrimSuffix(token, ".") {
			if c < '0' || c > '9' {
				isNumeric = false
				break
			}
		}
		if isNumeric && len(token) > 0 {
			startIdx++
			continue
		}

		// Strip "Miss Glam"
		if tokenLower == "miss" && startIdx+1 < len(parts) && strings.ToLower(parts[startIdx+1]) == "glam" {
			startIdx += 2
			continue
		}

		// If we reach a token that isn't a known prefix, this is likely the store name
		break
	}

	// 4. Join remaining parts
	if startIdx < len(parts) {
		return strings.ToUpper(strings.TrimSpace(strings.Join(parts[startIdx:], " ")))
	}

	// Final fallback: if everything was stripped, just use the last token (best effort)
	return strings.ToUpper(parts[len(parts)-1])
}
