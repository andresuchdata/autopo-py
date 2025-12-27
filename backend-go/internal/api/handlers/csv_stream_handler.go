package handlers

import (
	"bufio"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"syscall"

	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/gin-gonic/gin"
)

// isClientDisconnect checks if the error indicates the client disconnected.
func isClientDisconnect(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.Canceled) ||
		errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, net.ErrClosed) ||
		errors.Is(err, syscall.EPIPE) ||
		errors.Is(err, syscall.ECONNRESET) {
		return true
	}
	// Also check error message for "broken pipe" or "connection reset"
	msg := err.Error()
	return strings.Contains(msg, "broken pipe") || strings.Contains(msg, "connection reset")
}

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
func (h *CSVStreamHandler) StreamCSV(c *gin.Context) {
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key is required"})
		return
	}

	compress := c.Query("compress") == "true"

	// Get object stream from storage
	stream, err := h.storage.GetObjectStream(c.Request.Context(), key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to get file: %v", err)})
		return
	}
	defer stream.Close()

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

	var out io.Writer = c.Writer
	var gzipWriter *gzip.Writer
	if compress {
		gzipWriter = gzip.NewWriter(c.Writer)
		out = gzipWriter
		defer gzipWriter.Close()
	}

	buf := bufio.NewWriterSize(out, 256*1024)
	defer buf.Flush()

	// Copy bytes in a loop so we can periodically flush to the client.
	copyBuf := make([]byte, 256*1024)
	bytesWritten := int64(0)
	for {
		n, rerr := stream.Read(copyBuf)
		if n > 0 {
			wn, werr := buf.Write(copyBuf[:n])
			bytesWritten += int64(wn)
			if werr != nil {
				if isClientDisconnect(werr) {
					fmt.Printf("[DEBUG] stream write canceled for key=%s: %v\n", key, werr)
					return
				}
				fmt.Printf("[ERROR] stream write error: %v\n", werr)
				return
			}

			// Flush every write to ensure true streaming
			_ = buf.Flush()
			if gzipWriter != nil {
				_ = gzipWriter.Flush()
			}
			if f, ok := c.Writer.(http.Flusher); ok {
				f.Flush()
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			if isClientDisconnect(rerr) {
				fmt.Printf("[DEBUG] stream read canceled for key=%s: %v\n", key, rerr)
				return
			}

			fmt.Printf("[ERROR] stream read error: %v\n", rerr)
			return
		}
	}

	_ = buf.Flush()
	if gzipWriter != nil {
		_ = gzipWriter.Close()
	}
	if f, ok := c.Writer.(http.Flusher); ok {
		f.Flush()
	}

	fmt.Printf("[INFO] Streamed %d bytes for key: %s\n", bytesWritten, key)
}
