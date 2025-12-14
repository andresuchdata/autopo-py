package storage

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/chartmuseum/storage"
)

// SevallaConfig encapsulates the connection info for Sevalla (S3-compatible) storage.
type SevallaConfig struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	Region    string
	UseSSL    bool
}

// SevallaClient implements ObjectStorage for Sevalla / S3-compatible services.
type SevallaClient struct {
	backend storage.Backend
}

// NewSevallaClient builds a new SevallaClient backed by chartmuseum's Amazon storage backend.
func NewSevallaClient(cfg SevallaConfig) (*SevallaClient, error) {
	if cfg.Endpoint == "" {
		return nil, fmt.Errorf("sevalla endpoint must be provided")
	}
	if cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, fmt.Errorf("sevalla credentials must be provided")
	}
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("sevalla bucket must be provided")
	}

	endpoint := cfg.Endpoint
	if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		scheme := "https"
		if !cfg.UseSSL {
			scheme = "http"
		}
		endpoint = fmt.Sprintf("%s://%s", scheme, strings.TrimPrefix(cfg.Endpoint, "//"))
	}

	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		region = "us-east-1"
	}

	os.Setenv("AWS_ACCESS_KEY_ID", cfg.AccessKey)
	os.Setenv("AWS_SECRET_ACCESS_KEY", cfg.SecretKey)
	os.Setenv("AWS_REGION", region)
	os.Setenv("AWS_DEFAULT_REGION", region)

	backend := storage.NewAmazonS3BackendWithOptions(
		cfg.Bucket,
		"", // no prefix
		region,
		endpoint,
		"",
		&storage.AmazonS3Options{
			S3ForcePathStyle: awsBool(true),
		},
	)

	return &SevallaClient{
		backend: backend,
	}, nil
}

// ListObjects lists all objects for a given prefix.
func (c *SevallaClient) ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	files, err := c.backend.ListObjects(prefix)
	if err != nil {
		return nil, fmt.Errorf("sevalla list failed: %w", err)
	}
	results := make([]ObjectInfo, 0)
	for _, object := range files {
		results = append(results, ObjectInfo{
			Key:  object.Path,
			Size: int64(len(object.Content)),
		})
	}
	return results, nil
}

// DownloadObject downloads an object to the provided destination path.
func (c *SevallaClient) DownloadObject(ctx context.Context, key, destPath string) error {
	object, err := c.backend.GetObject(key)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("failed creating directory for %s: %w", destPath, err)
	}
	if err := os.WriteFile(destPath, object.Content, 0o644); err != nil {
		return fmt.Errorf("failed writing %s: %w", destPath, err)
	}
	return nil
}

var _ ObjectStorage = (*SevallaClient)(nil)

func awsBool(v bool) *bool {
	return &v
}
