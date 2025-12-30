package datasource

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/drive"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

// GoogleDriveSource implements DataSource for Google Drive
type GoogleDriveSource struct {
	driveService *drive.Service
	folderID     string
	localDir     string
}

// NewGoogleDriveSource creates a new Google Drive data source
func NewGoogleDriveSource(credentialsJSON, folderID, localDir string) (*GoogleDriveSource, error) {
	driveService, err := drive.NewService(credentialsJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to create drive service: %w", err)
	}

	// Create local directory if it doesn't exist
	if err := os.MkdirAll(localDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create local directory: %w", err)
	}

	return &GoogleDriveSource{
		driveService: driveService,
		folderID:     folderID,
		localDir:     localDir,
	}, nil
}

// GetName returns the name of the data source
func (s *GoogleDriveSource) GetName() string {
	return "google_drive"
}

// FetchData downloads files from Google Drive for the given date and stores
func (s *GoogleDriveSource) FetchData(ctx context.Context, date time.Time, storeIDs []int, storeNames []string) ([]string, error) {
	logger.Log.Info().
		Str("source", "google_drive").
		Str("date", date.Format("2006-01-02")).
		Int("store_count", len(storeIDs)).
		Int("name_count", len(storeNames)).
		Msg("Fetching data from Google Drive")

	// 1. Find a subfolder matching the date
	targetFolderID, err := s.findSubfolderForDate(ctx, date)
	if err != nil {
		logger.Log.Warn().Err(err).Msg("Failed to find date-specific subfolder, falling back to parent folder")
		targetFolderID = s.folderID
	}

	// 2. List files in the target folder
	files, err := s.driveService.ListFiles(targetFolderID)
	if err != nil {
		return nil, fmt.Errorf("failed to list files: %w", err)
	}

	// If no CSV files are found, check for an 'input' subfolder
	hasCSV := false
	for _, f := range files {
		if filepath.Ext(f.Name) == ".csv" {
			hasCSV = true
			break
		}
	}

	if !hasCSV {
		for _, f := range files {
			if f.MimeType == "application/vnd.google-apps.folder" && (strings.EqualFold(f.Name, "input")) {
				subFiles, err := s.driveService.ListFiles(f.ID)
				if err == nil && len(subFiles) > 0 {
					files = subFiles
					break
				}
			}
		}
	}

	var downloadedFiles []string

	// 3. Download each file
	for _, file := range files {
		// Skip folders
		if file.MimeType == "application/vnd.google-apps.folder" {
			continue
		}

		// Filter by store names if provided
		if len(storeNames) > 0 {
			match := false
			lowerFileName := strings.ToLower(file.Name)
			for _, name := range storeNames {
				if strings.Contains(lowerFileName, strings.ToLower(name)) {
					match = true
					break
				}
			}
			if !match {
				logger.Log.Debug().Str("file", file.Name).Msg("Skipping file (no store name match)")
				continue
			}
		}

		localPath := filepath.Join(s.localDir, file.Name)
		f, err := os.Create(localPath)
		if err != nil {
			logger.Log.Error().Err(err).Str("file", file.Name).Msg("Failed to create local file")
			continue
		}

		if err := s.driveService.DownloadFile(file.ID, f); err != nil {
			f.Close()
			logger.Log.Error().Err(err).Str("file", file.Name).Msg("Failed to download file")
			continue
		}
		f.Close()

		downloadedFiles = append(downloadedFiles, localPath)
	}

	logger.Log.Info().
		Int("downloaded", len(downloadedFiles)).
		Int("total_listed", len(files)).
		Msg("Completed Google Drive download")

	return downloadedFiles, nil
}

func (s *GoogleDriveSource) findSubfolderForDate(_ context.Context, date time.Time) (string, error) {
	items, err := s.driveService.ListFiles(s.folderID)
	if err != nil {
		return "", err
	}

	formats := []string{"20060102", "02-01-2006", "2006-01-02"}
	dateStr := date.Format("2006-01-02") // For logging

	for _, item := range items {
		if item.MimeType != "application/vnd.google-apps.folder" {
			continue
		}

		// Try to parse folder name as date
		for _, format := range formats {
			parsed, err := time.Parse(format, item.Name)
			if err == nil && parsed.Truncate(24*time.Hour).Equal(date.Truncate(24*time.Hour)) {
				return item.ID, nil
			}
		}
	}

	return "", fmt.Errorf("no subfolder found for date %s", dateStr)
}

// Validate checks if the Google Drive source is properly configured
func (s *GoogleDriveSource) Validate() error {
	if s.driveService == nil {
		return fmt.Errorf("drive service not initialized")
	}

	if s.folderID == "" {
		return fmt.Errorf("folder ID not set")
	}

	// Test access to the folder
	_, err := s.driveService.ListFiles(s.folderID)
	if err != nil {
		return fmt.Errorf("failed to access Google Drive folder: %w", err)
	}

	return nil
}

// Close cleans up resources
func (s *GoogleDriveSource) Close() error {
	// Google Drive service doesn't need explicit cleanup
	return nil
}
