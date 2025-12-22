package analytics

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Locale string

const (
	LocaleID Locale = "id"
	LocaleUS Locale = "us"
)

type ParseConfig struct {
	Locale Locale
}

func ParseConfigFromOptions(localeStr string) ParseConfig {
	loc := LocaleID
	switch strings.ToLower(localeStr) {
	case "us":
		loc = LocaleUS
	case "id", "":
		loc = LocaleID
	default:
		log.Printf("unknown locale %q, defaulting to id", localeStr)
		loc = LocaleID
	}

	return ParseConfig{Locale: loc}
}

func detectPipelineType(path string) string {
	dir := filepath.Dir(path)
	for dir != "." && dir != string(filepath.Separator) {
		base := filepath.Base(dir)
		if base == "stock_health" || base == "po_snapshots" {
			return base
		}
		next := filepath.Dir(dir)
		if next == dir {
			break
		}
		dir = next
	}
	return ""
}

func parseSnapshotTimeFromFilename(path string) (time.Time, error) {
	base := filepath.Base(path)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if len(base) < 8 {
		return time.Time{}, fmt.Errorf("filename %s does not contain yyyymmdd", path)
	}
	return time.Parse("20060102", base[:8])
}

func parseNullableTime(value string, formats []string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" || value == "0000-00-00 00:00:00" {
		return nil
	}

	value = normalizeTimestampSeparators(value)

	for _, layout := range formats {
		if t, err := time.Parse(layout, value); err == nil {
			return &t
		}
	}
	return nil
}

func normalizeTimestampSeparators(value string) string {
	parts := strings.Fields(value)
	if len(parts) < 2 {
		return value
	}
	timePart := parts[len(parts)-1]
	if strings.Contains(timePart, ".") && !strings.Contains(timePart, ":") {
		timePart = strings.ReplaceAll(timePart, ".", ":")
		parts[len(parts)-1] = timePart
		return strings.Join(parts, " ")
	}
	return value
}

func toNullTime(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return *t
}

func normalizeNumericString(val string) string {
	val = strings.TrimSpace(val)
	if val == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range val {
		if (r >= '0' && r <= '9') || r == ',' || r == '.' || r == '-' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func localizedStringToFloat(val string) float64 {
	val = normalizeNumericString(val)
	if val == "" || val == "-" {
		return 0
	}

	hasComma := strings.Contains(val, ",")
	hasDot := strings.Contains(val, ".")

	switch {
	case hasComma && hasDot:
		lastDot := strings.LastIndex(val, ".")
		lastComma := strings.LastIndex(val, ",")
		if lastDot < lastComma {
			val = strings.ReplaceAll(val, ".", "")
			val = strings.ReplaceAll(val, ",", ".")
		} else {
			val = strings.ReplaceAll(val, ",", "")
		}
	case hasComma:
		val = strings.ReplaceAll(val, ",", ".")
	default:
		parts := strings.Split(val, ".")
		isThousand := len(parts) > 1
		if isThousand {
			for i := 1; i < len(parts); i++ {
				if len(parts[i]) != 3 {
					isThousand = false
					break
				}
			}
		}
		if isThousand {
			val = strings.ReplaceAll(val, ".", "")
		}
	}

	parsed, err := strconv.ParseFloat(val, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func localizedStringToInt(val string) int {
	f := localizedStringToFloat(val)
	return int(math.Round(f))
}

func parseBoolString(val string) bool {
	val = strings.TrimSpace(strings.ToLower(val))
	switch val {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func toNullableInt64(v sql.NullInt64) interface{} {
	if v.Valid {
		return v.Int64
	}
	return nil
}

func formatSupplierID(v sql.NullInt64) string {
	if v.Valid {
		return strconv.FormatInt(v.Int64, 10)
	}

	return "NULL"
}

func truncateString(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

func normalizeColumnName(name string) string {
	// Normalize to lowercase and remove spaces, dots, underscores
	name = strings.ToLower(strings.TrimSpace(name))
	name = strings.ReplaceAll(name, " ", "")
	name = strings.ReplaceAll(name, "_", "")
	name = strings.ReplaceAll(name, ".", "")
	return name
}

func parseOptionalFloat(record []string, colMap map[string]int, column string) float64 {
	idx, ok := colMap[column]
	if !ok || idx >= len(record) {
		return 0
	}
	value := strings.TrimSpace(record[idx])
	if value == "" {
		return 0
	}
	value = strings.ReplaceAll(value, ",", "")
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0
	}
	return parsed
}

func parseOptionalInt(value string) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0
	}
	return parsed
}

// normalizeSKU normalizes SKU values by trimming whitespace
func normalizeSKU(value string) string {
	return strings.TrimSpace(value)
}
