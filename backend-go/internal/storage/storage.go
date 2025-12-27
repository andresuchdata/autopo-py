package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
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
	Key  string `json:"key"`
	Size int64  `json:"size"`
}

type ListObjectsResult struct {
	Objects    []ObjectInfo `json:"objects"`
	NextCursor string       `json:"nextCursor,omitempty"`
}

// ObjectStorage is the abstraction consumed by the pipelines.
type ObjectStorage interface {
	ListObjects(ctx context.Context, prefix string, limit int, cursor string) (ListObjectsResult, error)
	ListPrefixes(ctx context.Context, prefix string) ([]string, error)
	DownloadObject(ctx context.Context, key string, destPath string) error
	UploadObject(ctx context.Context, key string, content []byte) error
	DeleteObject(ctx context.Context, key string) error
	DeletePrefix(ctx context.Context, prefix string) error
	GetObjectContent(ctx context.Context, key string) ([]byte, error)
	GetObjectStream(ctx context.Context, key string) (io.ReadCloser, error)
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
func (s *s3Client) ListObjects(ctx context.Context, prefix string, limit int, cursor string) (ListObjectsResult, error) {
	list, err := s.backend.ListObjects(prefix)
	if err != nil {
		return ListObjectsResult{}, fmt.Errorf("failed to list prefix %s: %w", prefix, err)
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

	sort.Slice(results, func(i, j int) bool {
		return results[i].Key < results[j].Key
	})

	start := 0
	if cursor != "" {
		if idx, err := strconv.Atoi(cursor); err == nil && idx >= 0 && idx < len(results) {
			start = idx
		} else if err == nil && idx >= len(results) {
			start = len(results)
		}
	}

	if limit <= 0 {
		limit = len(results) - start
	}
	end := start + limit
	if end > len(results) {
		end = len(results)
	}

	nextCursor := ""
	if end < len(results) {
		nextCursor = strconv.Itoa(end)
	}

	page := make([]ObjectInfo, 0, end-start)
	if start < end {
		page = append(page, results[start:end]...)
	}

	return ListObjectsResult{
		Objects:    page,
		NextCursor: nextCursor,
	}, nil
}

// ListPrefixes returns the immediate child folders for a given prefix.
func (s *s3Client) ListPrefixes(ctx context.Context, prefix string) ([]string, error) {
	objectsCursor := ""
	found := make(map[string]struct{})

	for {
		page, err := s.ListObjects(ctx, prefix, 1000, objectsCursor)
		if err != nil {
			return nil, err
		}

		base := strings.Trim(prefix, "/")
		if base != "" {
			base += "/"
		}

		for _, obj := range page.Objects {
			relative := strings.TrimPrefix(obj.Key, base)
			parts := strings.Split(relative, "/")
			if len(parts) > 1 && parts[0] != "" {
				found[parts[0]] = struct{}{}
			}
		}

		if page.NextCursor == "" {
			break
		}
		objectsCursor = page.NextCursor
	}

	result := make([]string, 0, len(found))
	for key := range found {
		result = append(result, key)
	}
	sort.Strings(result)
	return result, nil
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
	cursor := ""
	for {
		page, err := s.ListObjects(ctx, prefix, 1000, cursor)
		if err != nil {
			return err
		}
		for _, obj := range page.Objects {
			if err := s.DeleteObject(ctx, obj.Key); err != nil {
				return err
			}
		}
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
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

// GetObjectStream implements [ObjectStorage].
// Note: chartmuseum backend does not expose a streaming reader, so this wraps the full content.
func (s *s3Client) GetObjectStream(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := s.backend.GetObject(key)
	if err != nil {
		return nil, fmt.Errorf("failed to get object %s: %w", key, err)
	}
	return io.NopCloser(bytes.NewReader(obj.Content)), nil
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
