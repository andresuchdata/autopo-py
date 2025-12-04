package pipeline

import (
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// StreamingAggregator buffers transformed data and flushes to CSV in batches
type StreamingAggregator struct {
	pipeline      Pipeline
	config        PipelineConfig
	date          time.Time
	buffer        [][]TransformedRow
	bufferSize    int64
	mu            sync.Mutex
	flushCallback func(ctx context.Context, csvPath string) error
	lastFlush     time.Time
}

// NewStreamingAggregator creates a new streaming aggregator for a pipeline
func NewStreamingAggregator(
	pipeline Pipeline,
	config PipelineConfig,
	date time.Time,
	flushCallback func(ctx context.Context, csvPath string) error,
) *StreamingAggregator {
	return &StreamingAggregator{
		pipeline:      pipeline,
		config:        config,
		date:          date,
		buffer:        make([][]TransformedRow, 0, config.BatchSize),
		flushCallback: flushCallback,
		lastFlush:     time.Now(),
	}
}

// AddFileData adds transformed data from a single file to the buffer
func (sa *StreamingAggregator) AddFileData(ctx context.Context, rows []TransformedRow) error {
	sa.mu.Lock()
	defer sa.mu.Unlock()

	// Add to buffer
	sa.buffer = append(sa.buffer, rows)

	// Estimate size (rough calculation)
	for _, row := range rows {
		sa.bufferSize += int64(len(row.Data) * 100) // Rough estimate: 100 bytes per field
	}

	log.Printf("[%s] Buffer: %d files, ~%d bytes",
		sa.pipeline.Name(),
		len(sa.buffer),
		sa.bufferSize)

	// Check if we should flush
	shouldFlush := len(sa.buffer) >= sa.config.BatchSize ||
		sa.bufferSize >= sa.config.BatchSizeBytes ||
		time.Since(sa.lastFlush) >= sa.config.FlushInterval

	if shouldFlush {
		return sa.flushLocked(ctx)
	}

	return nil
}

// Finalize flushes any remaining data and writes the final aggregated CSV
func (sa *StreamingAggregator) Finalize(ctx context.Context) error {
	sa.mu.Lock()
	defer sa.mu.Unlock()

	if len(sa.buffer) == 0 {
		log.Printf("[%s] No data to finalize", sa.pipeline.Name())
		return nil
	}

	return sa.flushLocked(ctx)
}

// flushLocked writes the current buffer to CSV and triggers the seed callback
// Must be called with sa.mu locked
func (sa *StreamingAggregator) flushLocked(ctx context.Context) error {
	if len(sa.buffer) == 0 {
		return nil
	}

	log.Printf("[%s] Flushing %d files to CSV...", sa.pipeline.Name(), len(sa.buffer))

	// Flatten all rows
	var allRows []TransformedRow
	for _, fileRows := range sa.buffer {
		allRows = append(allRows, fileRows...)
	}

	// Ensure output directory exists
	if err := os.MkdirAll(sa.config.OutputDir, 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	// Write to CSV with date in filename
	csvPath := filepath.Join(
		sa.config.OutputDir,
		fmt.Sprintf("%s.csv", sa.date.Format("20060102")),
	)

	if err := sa.writeCSV(csvPath, allRows); err != nil {
		return fmt.Errorf("failed to write CSV: %w", err)
	}

	log.Printf("[%s] Wrote %d rows to %s", sa.pipeline.Name(), len(allRows), csvPath)

	// Trigger seed callback (calls analytics.ProcessFile)
	if sa.flushCallback != nil {
		if err := sa.flushCallback(ctx, csvPath); err != nil {
			return fmt.Errorf("flush callback failed: %w", err)
		}
	}

	// Clear buffer
	sa.buffer = sa.buffer[:0]
	sa.bufferSize = 0
	sa.lastFlush = time.Now()

	return nil
}

// writeCSV writes transformed rows to a CSV file
func (sa *StreamingAggregator) writeCSV(path string, rows []TransformedRow) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	if len(rows) == 0 {
		return nil
	}

	// Extract headers from first row
	var headers []string
	for key := range rows[0].Data {
		headers = append(headers, key)
	}

	// Write header
	if err := writer.Write(headers); err != nil {
		return err
	}

	// Write data rows
	for _, row := range rows {
		record := make([]string, len(headers))
		for i, header := range headers {
			if val, ok := row.Data[header]; ok {
				record[i] = fmt.Sprintf("%v", val)
			}
		}
		if err := writer.Write(record); err != nil {
			return err
		}
	}

	return nil
}

// GetBufferStats returns current buffer statistics
func (sa *StreamingAggregator) GetBufferStats() (fileCount int, byteSize int64) {
	sa.mu.Lock()
	defer sa.mu.Unlock()
	return len(sa.buffer), sa.bufferSize
}
