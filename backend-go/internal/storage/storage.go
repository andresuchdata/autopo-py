package storage

import (
	"context"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"

	cmstorage "github.com/chartmuseum/storage"
)

// Config captures the minimal settings required to talk to an S3-compatible storage.
type Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	Region    string
	UseSSL    bool
	Prefix    string
}

// ObjectInfo describes a remote object.
type ObjectInfo struct {
	Key  string
	Size int64
}

// ObjectStorage is the abstraction consumed by the pipelines.
type ObjectStorage interface {
	ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error)
	DownloadObject(ctx context.Context, key string, destPath string) error
	UploadObject(ctx context.Context, key string, content []byte) error
	DeleteObject(ctx context.Context, key string) error
	DeletePrefix(ctx context.Context, prefix string) error
	GetObjectContent(ctx context.Context, key string) ([]byte, error)
}

type s3Client struct {
	backend cmstorage.Backend
}

// DownloadObject implements [ObjectStorage].
func (s *s3Client) DownloadObject(ctx context.Context, key string, destPath string) error {
	obj, err := s.backend.GetObject(key)
	if err != nil {
		return fmt.Errorf("failed to download %s: %w", key, err)
	}
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return fmt.Errorf("failed to create directories for %s: %w", destPath, err)
	}
	if err := os.WriteFile(destPath, obj.Content, 0o644); err != nil {
		return fmt.Errorf("failed to write %s: %w", destPath, err)
	}
	return nil
}

// ListObjects implements [ObjectStorage].
func (s *s3Client) ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	list, err := s.backend.ListObjects(prefix)
	if err != nil {
		return nil, fmt.Errorf("failed to list prefix %s: %w", prefix, err)
	}

	fmt.Printf("[DEBUG] ListObjects prefix=%q returned %d objects from chartmuseum backend\n", prefix, len(list))

	results := make([]ObjectInfo, 0, len(list))

	for _, obj := range list {
		key := obj.Path
		prefixTrim := strings.Trim(prefix, "/")
		if prefixTrim != "" {
			key = path.Join(prefixTrim, obj.Path)
		}
		fmt.Printf("[DEBUG] Object: path=%q size=%d\n", obj.Path, len(obj.Content))
		results = append(results, ObjectInfo{
			Key:  key,
			Size: int64(len(obj.Content)),
		})
	}

	return results, nil
}

// UploadObject implements [ObjectStorage].
func (s *s3Client) UploadObject(ctx context.Context, key string, content []byte) error {
	if err := s.backend.PutObject(key, content); err != nil {
		return fmt.Errorf("failed to upload %s: %w", key, err)
	}
	return nil
}

// DeleteObject implements [ObjectStorage].
func (s *s3Client) DeleteObject(ctx context.Context, key string) error {
	if err := s.backend.DeleteObject(key); err != nil {
		return fmt.Errorf("failed to delete %s: %w", key, err)
	}
	return nil
}

// DeletePrefix implements [ObjectStorage].
func (s *s3Client) DeletePrefix(ctx context.Context, prefix string) error {
	objects, err := s.ListObjects(ctx, prefix)
	if err != nil {
		return err
	}
	for _, obj := range objects {
		if err := s.DeleteObject(ctx, obj.Key); err != nil {
			return err
		}
	}
	return nil
}

// GetObjectContent implements [ObjectStorage].
func (s *s3Client) GetObjectContent(ctx context.Context, key string) ([]byte, error) {
	obj, err := s.backend.GetObject(key)
	if err != nil {
		return nil, fmt.Errorf("failed to get content of %s: %w", key, err)
	}
	return obj.Content, nil
}

// NewS3Client builds a chartmuseum-backed S3 client using the provided configuration.
func NewS3Client(cfg Config) (ObjectStorage, error) {
	if cfg.Endpoint == "" {
		return nil, fmt.Errorf("cloud storage endpoint is required")
	}
	if cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, fmt.Errorf("cloud storage credentials are required")
	}
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("cloud storage bucket is required")
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

	// chartmuseum/storage relies on AWS_* env vars for auth.
	os.Setenv("AWS_ACCESS_KEY_ID", cfg.AccessKey)
	os.Setenv("AWS_SECRET_ACCESS_KEY", cfg.SecretKey)
	os.Setenv("AWS_REGION", region)
	os.Setenv("AWS_DEFAULT_REGION", region)

	backend := cmstorage.NewAmazonS3BackendWithOptions(
		cfg.Bucket,
		strings.Trim(cfg.Prefix, "/"),
		region,
		endpoint,
		"",
		&cmstorage.AmazonS3Options{
			S3ForcePathStyle: boolPtr(true),
		},
	)

	return &s3Client{backend: backend}, nil
}

func boolPtr(b bool) *bool {
	return &b
}
