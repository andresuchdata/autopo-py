package drive

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DownloadOptions controls how files are pulled from Google Drive.
type DownloadOptions struct {
	FolderID    string
	DownloadDir string
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

	var localPaths []string
	for _, f := range files {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		ext := strings.ToLower(filepath.Ext(f.Name))
		if ext != ".csv" && ext != ".xlsx" {
			continue
		}

		if ext == ".csv" {
			localPath := filepath.Join(opts.DownloadDir, f.Name)
			out, err := os.Create(localPath)
			if err != nil {
				return nil, fmt.Errorf("failed to create local file %s: %w", localPath, err)
			}
			if err := d.service.DownloadFile(f.ID, out); err != nil {
				out.Close()
				return nil, fmt.Errorf("failed to download %s: %w", f.Name, err)
			}
			out.Close()
			localPaths = append(localPaths, localPath)
			continue
		}

		// XLSX: download then convert first sheet to CSV
		tmpXLSXPath := filepath.Join(opts.DownloadDir, f.Name)
		out, err := os.Create(tmpXLSXPath)
		if err != nil {
			return nil, fmt.Errorf("failed to create temp xlsx %s: %w", tmpXLSXPath, err)
		}
		if err := d.service.DownloadFile(f.ID, out); err != nil {
			out.Close()
			return nil, fmt.Errorf("failed to download %s: %w", f.Name, err)
		}
		out.Close()

		csvName := strings.TrimSuffix(f.Name, filepath.Ext(f.Name)) + ".csv"
		csvPath := filepath.Join(opts.DownloadDir, csvName)
		if err := convertXLSXToCSV(tmpXLSXPath, csvPath); err != nil {
			return nil, fmt.Errorf("failed to convert %s to csv: %w", f.Name, err)
		}
		// Best-effort remove temp XLSX
		_ = os.Remove(tmpXLSXPath)
		localPaths = append(localPaths, csvPath)
	}

	return localPaths, nil
}
