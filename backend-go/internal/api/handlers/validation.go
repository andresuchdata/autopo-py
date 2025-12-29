package handlers

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"

	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

type ValidationHandler struct {
	storage storage.ObjectStorage
}

func NewValidationHandler(storage storage.ObjectStorage) *ValidationHandler {
	return &ValidationHandler{
		storage: storage,
	}
}

// GetReportContent returns the content of a specific sheet from a validation report
// Query params: key (cloud storage key), sheet (default: "validation")
func (h *ValidationHandler) GetReportContent(c *gin.Context) {
	key := c.Query("key")
	sheet := c.Query("sheet")
	if sheet == "" {
		sheet = "validation" // Default sheet
	}

	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key is required"})
		return
	}

	logger.Log.Info().Str("key", key).Str("sheet", sheet).Msg("Fetching report content")

	// Verify it's an XLSX file
	if strings.ToLower(filepath.Ext(key)) != ".xlsx" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only XLSX reports are supported"})
		return
	}

	// Download or stream the file
	// Since excelize needs a reader or file, we'll download to memory buffer
	content, err := h.storage.GetObjectContent(c.Request.Context(), key)
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("Failed to fetch report from storage")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch report"})
		return
	}

	// Parse Excel
	f, err := excelize.OpenReader(strings.NewReader(string(content)))
	if err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("Failed to parse Excel file")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse report file"})
		return
	}
	defer f.Close()

	// Check if sheet exists
	sheetIndex, err := f.GetSheetIndex(sheet)
	if err != nil || sheetIndex == -1 {
		// Sheet not found - return 404
		c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("sheet '%s' not found", sheet)})
		return
	}

	// Read rows
	rows, err := f.GetRows(sheet)
	if err != nil {
		logger.Log.Error().Err(err).Msg("Failed to get rows")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read rows"})
		return
	}

	// If sheet exists but has no data, return empty CSV/JSON (not 404)
	if len(rows) == 0 {
		if c.Query("format") == "csv" {
			c.Header("Content-Type", "text/csv")
			c.String(http.StatusOK, "")
		} else {
			c.JSON(http.StatusOK, []interface{}{})
		}
		return
	}

	// If only header row exists, return just the header
	if len(rows) == 1 {
		if c.Query("format") == "csv" {
			c.Header("Content-Type", "text/csv")
			// Write header with semicolon separator
			for j, cell := range rows[0] {
				if strings.ContainsAny(cell, ";\"\n") {
					rows[0][j] = fmt.Sprintf("\"%s\"", strings.ReplaceAll(cell, "\"", "\"\""))
				}
			}
			c.String(http.StatusOK, strings.Join(rows[0], ";"))
		} else {
			c.JSON(http.StatusOK, []interface{}{})
		}
		return
	}
	// Convert to JSON array of objects
	headers := rows[0]
	result := make([]map[string]string, 0, len(rows)-1)

	for i := 1; i < len(rows); i++ {
		row := rows[i]
		item := make(map[string]string)
		for j, cell := range row {
			if j < len(headers) {
				item[headers[j]] = cell
			}
		}
		// Initialize missing columns with empty string
		for j := len(row); j < len(headers); j++ {
			item[headers[j]] = ""
		}
		result = append(result, item)
	}

	// If the sheet is "Detail" or "Mismatches", we might want to return plain CSV string
	// for VirtualizedCSVViewer to handle parsing/performance better?
	// But JSON is fine for moderate size (e.g. < 5000 rows).
	// If the user wants CSV format for VirtualizedCSVViewer, we can format it as such.
	// VirtualizedCSVViewer uses PapaParse which takes URL or string.
	// Let's offer a "format=csv" option.

	format := c.Query("format")
	if format == "csv" {
		c.Header("Content-Type", "text/csv")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.csv\"", sheet))

		// Write CSV to response writer with semicolon separator
		w := c.Writer
		for i, row := range rows {
			// Escape fields if necessary (basic)
			for j, cell := range row {
				if strings.ContainsAny(cell, ";\"\n") {
					row[j] = fmt.Sprintf("\"%s\"", strings.ReplaceAll(cell, "\"", "\"\""))
				}
			}
			w.WriteString(strings.Join(row, ";") + "\n") // Use semicolon separator
			if i%100 == 0 {
				w.Flush()
			}
		}
		return
	}

	c.JSON(http.StatusOK, result)
}
