package validation

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
)

const (
	// Cloud storage prefix for top100 SKU files
	Top100CloudPrefix = "stock_health/top_100_sku/"
)

// SyncTop100FromCloud downloads top100 SKU files from cloud storage to local directory
func SyncTop100FromCloud(ctx context.Context, storageClient storage.ObjectStorage, localDir string) error {
	if storageClient == nil {
		return fmt.Errorf("storage client not configured")
	}

	logger.Log.Info().Str("prefix", Top100CloudPrefix).Msg("Syncing top100 SKU files from cloud")

	// List all files in the top100 prefix
	result, err := storageClient.ListObjects(ctx, Top100CloudPrefix, 1000, "")
	if err != nil {
		return fmt.Errorf("failed to list top100 files: %w", err)
	}

	if len(result.Objects) == 0 {
		logger.Log.Warn().Msg("No top100 files found in cloud storage")
		return nil
	}

	// Download each file
	for _, obj := range result.Objects {
		// Get file content
		content, err := storageClient.GetObjectContent(ctx, obj.Key)
		if err != nil {
			logger.Log.Error().Err(err).Str("key", obj.Key).Msg("Failed to download top100 file")
			continue
		}

		// Write to local file
		filename := filepath.Base(obj.Key)
		localPath := filepath.Join(localDir, filename)

		if err := writeFile(localPath, content); err != nil {
			logger.Log.Error().Err(err).Str("path", localPath).Msg("Failed to write top100 file")
			continue
		}

		logger.Log.Debug().Str("file", filename).Msg("Downloaded top100 file")
	}

	logger.Log.Info().Int("count", len(result.Objects)).Msg("Top100 sync completed")
	return nil
}

func writeFile(path string, content []byte) error {
	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := ensureDir(dir); err != nil {
		return err
	}

	// Write file
	return os.WriteFile(path, content, 0644)
}

func ensureDir(dir string) error {
	return os.MkdirAll(dir, 0755)
}
