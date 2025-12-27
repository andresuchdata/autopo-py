package handlers

import (
	"bufio"
	"compress/gzip"
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/gin-gonic/gin"
)

type CSVStreamHandler struct {
	storage storage.ObjectStorage
}

func NewCSVStreamHandler(s storage.ObjectStorage) *CSVStreamHandler {
	return &CSVStreamHandler{storage: s}
}

// StreamCSV streams a CSV file from storage with chunked transfer encoding
// Query params:
//   - key: the object key to stream
//   - compress: optional, set to "true" to enable gzip compression
//   - chunk_rows: optional, number of rows per chunk (default 1000)
func (h *CSVStreamHandler) StreamCSV(c *gin.Context) {
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key is required"})
		return
	}

	compress := c.Query("compress") == "true"
	chunkRows := 1000
	if chunkRowsStr := c.Query("chunk_rows"); chunkRowsStr != "" {
		if parsed, err := strconv.Atoi(chunkRowsStr); err == nil && parsed > 0 {
			chunkRows = parsed
		}
	}

	// Get object content from storage
	content, err := h.storage.GetObjectContent(c.Request.Context(), key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get file: %v", err)})
		return
	}

	// Set headers for streaming
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Transfer-Encoding", "chunked")
	c.Header("X-Content-Type-Options", "nosniff")

	if compress {
		c.Header("Content-Encoding", "gzip")
	}

	// Flush headers immediately
	c.Writer.WriteHeader(http.StatusOK)
	if f, ok := c.Writer.(http.Flusher); ok {
		f.Flush()
	}

	// Create CSV reader from content
	csvReader := csv.NewReader(strings.NewReader(string(content)))
	csvReader.LazyQuotes = true
	csvReader.TrimLeadingSpace = true

	var writer io.Writer = c.Writer
	var gzipWriter *gzip.Writer

	if compress {
		gzipWriter = gzip.NewWriter(c.Writer)
		writer = gzipWriter
		defer gzipWriter.Close()
	}

	bufWriter := bufio.NewWriter(writer)
	csvWriter := csv.NewWriter(bufWriter)

	rowCount := 0
	for {
		record, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			// Log error but continue to avoid breaking the stream
			fmt.Printf("[WARN] CSV read error at row %d: %v\n", rowCount, err)
			continue
		}

		if err := csvWriter.Write(record); err != nil {
			fmt.Printf("[ERROR] CSV write error at row %d: %v\n", rowCount, err)
			return
		}

		rowCount++

		// Flush every chunkRows rows
		if rowCount%chunkRows == 0 {
			csvWriter.Flush()
			if err := bufWriter.Flush(); err != nil {
				fmt.Printf("[ERROR] Buffer flush error: %v\n", err)
				return
			}
			if gzipWriter != nil {
				if err := gzipWriter.Flush(); err != nil {
					fmt.Printf("[ERROR] Gzip flush error: %v\n", err)
					return
				}
			}
			if f, ok := c.Writer.(http.Flusher); ok {
				f.Flush()
			}
		}
	}

	// Final flush
	csvWriter.Flush()
	if err := bufWriter.Flush(); err != nil {
		fmt.Printf("[ERROR] Final buffer flush error: %v\n", err)
		return
	}
	if gzipWriter != nil {
		if err := gzipWriter.Close(); err != nil {
			fmt.Printf("[ERROR] Gzip close error: %v\n", err)
		}
	}
	if f, ok := c.Writer.(http.Flusher); ok {
		f.Flush()
	}

	fmt.Printf("[INFO] Streamed %d rows for key: %s\n", rowCount, key)
}
