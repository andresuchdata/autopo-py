package drive

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// DownloadOptions controls how files are pulled from Google Drive.
type DownloadOptions struct {
	FolderID    string
	DownloadDir string
	// DateLayout is the Go time layout (e.g. "20060102") used to parse
	// snapshot dates from Drive subfolder names like 20251201.
	DateLayout   string
	SnapshotDate string
}

// Downloader wraps Service to download files from a specific folder.
type Downloader struct {
	service *Service
}

// NewDownloader creates a new Downloader.
func NewDownloader(s *Service) *Downloader {
	return &Downloader{service: s}
}

// DownloadFolderCSV downloads all non-trashed CSV and XLSX files from the given Drive folder
// into DownloadDir and returns local CSV paths.
//
//   - CSV files are downloaded directly.
//   - XLSX files are downloaded to a temporary .xlsx, then the first sheet is converted
//     to CSV in DownloadDir and the temporary .xlsx is removed.
func (d *Downloader) DownloadFolderCSV(ctx context.Context, opts DownloadOptions) ([]string, error) {
	if opts.DownloadDir == "" {
		return nil, fmt.Errorf("download dir is required")
	}
	if err := os.MkdirAll(opts.DownloadDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create download dir: %w", err)
	}

	files, err := d.service.ListFiles(opts.FolderID)
	if err != nil {
		return nil, err
	}

	// We expect the root folder to contain date-named subfolders (e.g. 20251201),
	// each containing an "input" subfolder with per-store files.
	var localPaths []string
	for _, f := range files {
		// Only consider folders at the root level for date grouping
		if f.MimeType != "application/vnd.google-apps.folder" {
			continue
		}

		dateStr := strings.TrimSpace(f.Name)
		if opts.DateLayout != "" {
			if len(dateStr) < len(opts.DateLayout) {
				continue
			}
			// Skip folders that don't parse as a date
			if _, err := time.Parse(opts.DateLayout, dateStr[:len(opts.DateLayout)]); err != nil {
				continue
			}
		}

		if opts.SnapshotDate != "" {
			if len(dateStr) < len(opts.SnapshotDate) || !strings.HasPrefix(dateStr, opts.SnapshotDate) {
				continue
			}
		}

		childFiles, err := d.service.ListFiles(f.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to list files in date folder %s: %w", f.Name, err)
		}

		var inputFolderID string
		for _, cf := range childFiles {
			if cf.MimeType == "application/vnd.google-apps.folder" && strings.EqualFold(strings.TrimSpace(cf.Name), "input") {
				inputFolderID = cf.ID
				break
			}
		}
		if inputFolderID == "" {
			continue
		}

		inputFiles, err := d.service.ListFiles(inputFolderID)
		if err != nil {
			return nil, fmt.Errorf("failed to list files in input folder for %s: %w", f.Name, err)
		}

		for _, cf := range inputFiles {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			default:
			}

			ext := strings.ToLower(filepath.Ext(cf.Name))
			if ext != ".csv" && ext != ".xlsx" {
				continue
			}

			// Prefix local filename with the date folder so the pipeline can
			// derive snapshot date from the filename.
			baseName := fmt.Sprintf("%s_%s", dateStr, cf.Name)
			if ext == ".csv" {
				localPath := filepath.Join(opts.DownloadDir, baseName)
				out, err := os.Create(localPath)
				if err != nil {
					return nil, fmt.Errorf("failed to create local file %s: %w", localPath, err)
				}
				if err := d.service.DownloadFile(cf.ID, out); err != nil {
					out.Close()
					return nil, fmt.Errorf("failed to download %s: %w", cf.Name, err)
				}
				out.Close()
				localPaths = append(localPaths, localPath)
				continue
			}

			// XLSX: download then convert first sheet to CSV
			tmpXLSXPath := filepath.Join(opts.DownloadDir, baseName)
			out, err := os.Create(tmpXLSXPath)
			if err != nil {
				return nil, fmt.Errorf("failed to create temp xlsx %s: %w", tmpXLSXPath, err)
			}
			if err := d.service.DownloadFile(cf.ID, out); err != nil {
				out.Close()
				return nil, fmt.Errorf("failed to download %s: %w", cf.Name, err)
			}
			out.Close()

			csvName := strings.TrimSuffix(baseName, filepath.Ext(baseName)) + ".csv"
			csvPath := filepath.Join(opts.DownloadDir, csvName)
			if err := convertXLSXToCSV(tmpXLSXPath, csvPath); err != nil {
				return nil, fmt.Errorf("failed to convert %s to csv: %w", cf.Name, err)
			}
			// Best-effort remove temp XLSX
			_ = os.Remove(tmpXLSXPath)
			localPaths = append(localPaths, csvPath)
		}
	}

	return localPaths, nil
}
