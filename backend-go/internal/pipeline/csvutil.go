package pipeline

import "strings"

// DetectCSVDelimiter returns ',' or ';' by comparing delimiter occurrences in a sample line.
// This is intentionally simple and mirrors existing behavior in pipeline tasks.
func DetectCSVDelimiter(sampleLine string) rune {
	if strings.Count(sampleLine, ";") > strings.Count(sampleLine, ",") {
		return ';'
	}
	return ','
}

// NormalizeHeaderKey normalizes a CSV column name for robust lookups.
// It lowercases, trims spaces, and removes common separators.
func NormalizeHeaderKey(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, ".", "")
	return s
}
