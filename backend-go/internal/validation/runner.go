package validation

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

// Runner manages the execution of the python validation script
type Runner struct {
	scriptPath string
	baseIndex  string // Path to the autopo/notebook directory
	storage    storage.ObjectStorage
	Workers    int // Number of parallel workers
}

// ValidationResult represents the output from validate.py
type ValidationResult struct {
	Date    string       `json:"date"`
	BaseDir string       `json:"base_dir"`
	Results []FileResult `json:"results"`
	Summary Summary      `json:"summary"`
}

type FileResult struct {
	File       string                 `json:"file"`
	Status     string                 `json:"status"`
	OutputFile string                 `json:"output_file,omitempty"`
	ReportFile string                 `json:"report_file,omitempty"`
	Error      string                 `json:"error,omitempty"`
	Metrics    map[string]interface{} `json:"metrics,omitempty"`
}

type Summary struct {
	Total   int `json:"total"`
	Success int `json:"success"`
	Failed  int `json:"failed"`
	Missing int `json:"missing"`
}

// NewRunner creates a new validation runner
func NewRunner(notebookBaseDir string, storageClient storage.ObjectStorage) *Runner {
	return &Runner{
		scriptPath: filepath.Join(notebookBaseDir, "scripts", "validate.py"),
		baseIndex:  notebookBaseDir,
		storage:    storageClient,
		Workers:    5, // Default to 5 workers
	}
}

// Run executes validation for all stores in parallel using goroutines
func (r *Runner) Run(ctx context.Context, date time.Time) (*ValidationResult, error) {
	dateStr := date.Format("2006-01-02")
	logger.Log.Info().Str("date", dateStr).Msg("Starting validation run")

	// 1. Discover input files
	files, err := r.discoverInputFiles(date)
	if err != nil {
		return nil, fmt.Errorf("failed to discover input files: %w", err)
	}

	if len(files) == 0 {
		return &ValidationResult{
			Date:    dateStr,
			BaseDir: r.baseIndex,
			Results: []FileResult{},
			Summary: Summary{Total: 0, Success: 0, Failed: 0, Missing: 0},
		}, nil
	}

	// 2. Validate each file in parallel using goroutines
	results := make([]FileResult, len(files))
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, r.Workers) // Limit concurrency

	for i, file := range files {
		wg.Add(1)
		go func(idx int, filename string) {
			defer wg.Done()
			semaphore <- struct{}{}        // Acquire
			defer func() { <-semaphore }() // Release

			results[idx] = r.validateSingleStore(ctx, date, filename)
		}(i, file)
	}

	wg.Wait()

	// 3. Aggregate results
	result := r.aggregateResults(date, results)

	// 4. Upload reports to cloud storage if enabled
	if r.storage != nil {
		r.uploadReports(ctx, date, result)
		r.uploadSummary(ctx, date, result)
	}

	logger.Log.Info().
		Int("total", result.Summary.Total).
		Int("success", result.Summary.Success).
		Msg("Validation run completed")

	return result, nil
}

// discoverInputFiles lists all CSV files in the input directory for the given date
func (r *Runner) discoverInputFiles(date time.Time) ([]string, error) {
	dateStr := date.Format("20060102") // YYYYMMDD format
	inputDir := filepath.Join(r.baseIndex, "data", "input", dateStr)

	entries, err := os.ReadDir(inputDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil // No input directory, return empty list
		}
		return nil, fmt.Errorf("failed to read input directory: %w", err)
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".csv" {
			files = append(files, entry.Name())
		}
	}

	return files, nil
}

// validateSingleStore runs validation for a single store file
func (r *Runner) validateSingleStore(ctx context.Context, date time.Time, storeFile string) FileResult {
	dateStr := date.Format("2006-01-02")

	// Create a temp file for JSON output
	tmpFile, err := os.CreateTemp("", "validation_*.json")
	if err != nil {
		return FileResult{
			File:   storeFile,
			Status: "error",
			Error:  fmt.Sprintf("failed to create temp file: %v", err),
		}
	}
	tmpPath := tmpFile.Name()
	tmpFile.Close()
	defer os.Remove(tmpPath)

	args := []string{
		r.scriptPath,
		"--date", dateStr,
		"--base-dir", r.baseIndex,
		"--json-out", tmpPath,
		"--store", storeFile,
	}

	cmd := exec.CommandContext(ctx, "python3", args...)
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return FileResult{
			File:   storeFile,
			Status: "error",
			Error:  fmt.Sprintf("validation script failed: %v", err),
		}
	}

	// Read result
	data, err := os.ReadFile(tmpPath)
	if err != nil {
		return FileResult{
			File:   storeFile,
			Status: "error",
			Error:  fmt.Sprintf("failed to read output: %v", err),
		}
	}

	var result FileResult
	if err := json.Unmarshal(data, &result); err != nil {
		return FileResult{
			File:   storeFile,
			Status: "error",
			Error:  fmt.Sprintf("failed to parse output: %v", err),
		}
	}

	return result
}

// aggregateResults combines individual file results into a ValidationResult
func (r *Runner) aggregateResults(date time.Time, results []FileResult) *ValidationResult {
	summary := Summary{
		Total: len(results),
	}

	for _, res := range results {
		switch res.Status {
		case "success":
			summary.Success++
		case "error":
			summary.Failed++
		case "missing_output":
			summary.Missing++
		}
	}

	return &ValidationResult{
		Date:    date.Format("2006-01-02"),
		BaseDir: r.baseIndex,
		Results: results,
		Summary: summary,
	}
}

func (r *Runner) uploadReports(ctx context.Context, date time.Time, result *ValidationResult) {
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 10) // Limit to 10 concurrent uploads

	for i := range result.Results {
		if result.Results[i].ReportFile == "" {
			continue
		}

		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			semaphore <- struct{}{}        // Acquire
			defer func() { <-semaphore }() // Release

			res := &result.Results[idx]

			// reportFile is absolute path from validate.py
			f, err := os.Open(res.ReportFile)
			if err != nil {
				logger.Log.Error().Err(err).Str("file", res.ReportFile).Msg("Failed to open report for upload")
				return
			}

			data, err := os.ReadFile(res.ReportFile)
			f.Close()
			if err != nil {
				logger.Log.Error().Err(err).Str("file", res.ReportFile).Msg("Failed to read report for upload")
				return
			}

			// Target key: stock_health/validation/YYYY/MM/DD/<filename>
			filename := filepath.Base(res.ReportFile)
			key := fmt.Sprintf("stock_health/validation/%s/%s", date.Format("2006/01/02"), filename)

			if err := r.storage.UploadObject(ctx, key, data); err != nil {
				logger.Log.Error().Err(err).Str("key", key).Msg("Failed to upload validation report")
			} else {
				logger.Log.Info().Str("key", key).Msg("Uploaded validation report")
				res.ReportFile = key // Update to cloud key
			}
		}(i)
	}

	wg.Wait()
}

func (r *Runner) uploadSummary(ctx context.Context, date time.Time, result *ValidationResult) {
	// Marshal the result to JSON
	summaryData, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		logger.Log.Error().Err(err).Msg("Failed to marshal validation summary")
		return
	}

	// Upload to cloud storage: stock_health/validation/YYYY/MM/DD/_summary.json
	key := fmt.Sprintf("stock_health/validation/%s/_summary.json", date.Format("2006/01/02"))
	if err := r.storage.UploadObject(ctx, key, summaryData); err != nil {
		logger.Log.Error().Err(err).Str("key", key).Msg("Failed to upload validation summary")
	} else {
		logger.Log.Info().Str("key", key).Msg("Uploaded validation summary")
	}
}

// GetResults retrieves existing validation results for a date from cloud storage
func (r *Runner) GetResults(ctx context.Context, date time.Time) (*ValidationResult, error) {
	if r.storage == nil {
		return nil, fmt.Errorf("cloud storage not configured")
	}

	// Try to fetch summary JSON from cloud storage
	key := fmt.Sprintf("stock_health/validation/%s/_summary.json", date.Format("2006/01/02"))
	logger.Log.Info().Str("key", key).Msg("Fetching validation summary from cloud")

	data, err := r.storage.GetObjectContent(ctx, key)
	if err != nil {
		// If not found, return nil (not an error, just no results yet)
		logger.Log.Debug().Err(err).Str("key", key).Msg("No validation summary found")
		return nil, nil
	}

	var result ValidationResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to parse validation summary: %w", err)
	}

	logger.Log.Info().Str("date", date.Format("2006-01-02")).Msg("Retrieved validation results from cloud")
	return &result, nil
}
