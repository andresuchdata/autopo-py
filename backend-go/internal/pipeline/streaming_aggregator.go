package pipeline

import (
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
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
	wg            sync.WaitGroup
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

	// Flush any remaining data
	if err := sa.flushLocked(ctx); err != nil {
		return err
	}

	// Wait for all async operations to complete
	sa.wg.Wait()
	return nil
}

// flushLocked writes the current buffer to CSV and triggers the seed callback
// Must be called with sa.mu locked
func (sa *StreamingAggregator) flushLocked(ctx context.Context) error {
	if len(sa.buffer) == 0 {
		return nil
	}

	log.Printf("[%s] Calculation complete for batch of %d files. Saving buffered CSV asynchronously...", sa.pipeline.Name(), len(sa.buffer))

	// Shallow copy buffer for async processing
	bufferCopy := make([][]TransformedRow, len(sa.buffer))
	copy(bufferCopy, sa.buffer)

	// Flatten rows immediately if needed, or do it in async. Doing it async saves main thread time.
	// But we need to capture relevant data for the closure.

	// Date and config are constant/thread-safe or local copies needed?
	// sa.config is value receiver copy in struct? No, struct has copy.
	// sa.date is value.

	// Clear main buffer immediately so main thread can continue
	sa.buffer = sa.buffer[:0]
	sa.bufferSize = 0
	sa.lastFlush = time.Now()

	sa.wg.Add(1)
	go func(rowsBatch [][]TransformedRow) {
		defer sa.wg.Done()

		// Flatten
		var allRows []TransformedRow
		for _, fileRows := range rowsBatch {
			allRows = append(allRows, fileRows...)
		}

		// Ensure output directory exists
		if err := os.MkdirAll(sa.config.OutputDir, 0755); err != nil {
			log.Printf("ERROR [%s] Async flush failed: ensure dir: %v", sa.pipeline.Name(), err)
			return
		}

		// Write to CSV with date in filename
		// Note: using timestamp to allow multiple flushes per day if needed, but original logic was uniform per date.
		// If multiple flushes happen for same date, they might overwrite or need collision handling.
		// Original logic: fmt.Sprintf("%s.csv", sa.date.Format("20060102"))
		// Since we now support multiple concurrent batches, strict overwriting is dangerous.
		// Use timestamp in filename for uniqueness if multiple batches?
		// User requirement "output csv file... wait at end" suggests one big file or multiple?
		// Existing logic overwrote? No, it appended? No, os.Create overwrites.
		// If we stream, we should probably APPEND if file exists, or use unique names.
		// CAUTION: Original code overwrote `os.Create`. If `flushLocked` called multiple times, it would overwrite previous data!
		// But `StreamingAggregator` seems designed to flush periodically.
		// If flushing periodically, we MUST use unique filenames or Append.
		// Let's use unique filenames for safety in async batches: YYYYMMDD_HHMMSS_nanos.csv
		csvName := fmt.Sprintf("%s_%d.csv", sa.date.Format("20060102"), time.Now().UnixNano())
		csvPath := filepath.Join(sa.config.OutputDir, csvName)

		if err := sa.writeCSV(csvPath, allRows); err != nil {
			log.Printf("ERROR [%s] Async flush failed: write CSV: %v", sa.pipeline.Name(), err)
			return
		}

		log.Printf("[%s] CSV saved successfully: %s (%d rows)", sa.pipeline.Name(), csvPath, len(allRows))

		uploadPath := csvPath
		if cp, ok := sa.pipeline.(CloudPipeline); ok {
			if err := cp.UploadAggregatedOutput(ctx, sa.date, csvPath); err != nil {
				log.Printf("ERROR [%s] Async flush failed: upload: %v", sa.pipeline.Name(), err)
				// Don't return, try to proceed to callback?
			} else {
				uploadPath = csvPath
			}
		}

		// Trigger seed callback (calls analytics.ProcessFile)
		log.Printf("[%s] Debug: About to trigger flush callback. Callback is nil? %v", sa.pipeline.Name(), sa.flushCallback == nil)
		if sa.flushCallback != nil {
			log.Printf("[%s] Debug: Calling flush callback with path: %s", sa.pipeline.Name(), uploadPath)
			if err := sa.flushCallback(ctx, uploadPath); err != nil {
				log.Printf("ERROR [%s] Async flush callback failed: %v", sa.pipeline.Name(), err)
			} else {
				log.Printf("[%s] Debug: Flush callback completed successfully", sa.pipeline.Name())
			}
		}
	}(bufferCopy)

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

	// Extract headers from first row and sort them for consistent ordering
	var headers []string
	for key := range rows[0].Data {
		headers = append(headers, key)
	}
	sort.Strings(headers)

	// Write header
	if err := writer.Write(headers); err != nil {
		return err
	}

	// Write data rows
	for idx, row := range rows {
		record := make([]string, len(headers))
		for i, header := range headers {
			if val, ok := row.Data[header]; ok {
				record[i] = fmt.Sprintf("%v", val)
			}
		}

		// Debug first few rows
		if idx < 5 {
			dailySalesVal := row.Data["daily_sales"]
			maxDailySalesVal := row.Data["max_daily_sales"]
			log.Printf("[DEBUG AGGREGATOR] Row %d - daily_sales in map: %v (type: %T), max_daily_sales: %v (type: %T)",
				idx, dailySalesVal, dailySalesVal, maxDailySalesVal, maxDailySalesVal)
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
