package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/urfave/cli/v2"
)

type sevallaDownloader struct {
	client   storage.ObjectStorage
	baseDir  string
	stockDir string
	poDir    string
}

func newSevallaDownloader(c *cli.Context) (*sevallaDownloader, error) {
	cfg := storage.SevallaConfig{
		Endpoint:  c.String("sevalla-endpoint"),
		AccessKey: c.String("sevalla-access-key"),
		SecretKey: c.String("sevalla-secret-key"),
		Bucket:    c.String("sevalla-bucket"),
		Region:    c.String("sevalla-region"),
		UseSSL:    c.Bool("sevalla-use-ssl"),
	}

	client, err := storage.NewSevallaClient(cfg)
	if err != nil {
		return nil, err
	}

	baseDir := c.String("sevalla-download-dir")
	if baseDir == "" {
		baseDir = "./data/tmp/sevalla"
	}

	stockDir := filepath.Join(baseDir, "stock_health")
	poDir := filepath.Join(baseDir, "po_snapshots")

	for _, dir := range []string{stockDir, poDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("failed to ensure download dir %s: %w", dir, err)
		}
	}

	return &sevallaDownloader{
		client:   client,
		baseDir:  baseDir,
		stockDir: stockDir,
		poDir:    poDir,
	}, nil
}

func (d *sevallaDownloader) downloadStockHealth(ctx context.Context, prefix, override string) ([]string, error) {
	return d.downloadObjects(ctx, prefix, override, d.stockDir)
}

func (d *sevallaDownloader) downloadPOSnapshots(ctx context.Context, prefix, override string) ([]string, error) {
	return d.downloadObjects(ctx, prefix, override, d.poDir)
}

func (d *sevallaDownloader) downloadObjects(ctx context.Context, prefix, override, destDir string) ([]string, error) {
	var keys []string

	if override != "" {
		keys = []string{resolveObjectKey(prefix, override)}
	} else {
		listPrefix := strings.TrimSpace(prefix)
		objects, err := d.client.ListObjects(ctx, listPrefix)
		if err != nil {
			return nil, fmt.Errorf("failed to list Sevalla objects for prefix %s: %w", listPrefix, err)
		}
		for _, obj := range objects {
			if strings.HasSuffix(strings.ToLower(obj.Key), ".csv") {
				keys = append(keys, obj.Key)
			}
		}
	}

	if len(keys) == 0 {
		return nil, fmt.Errorf("no CSV files found for prefix %s", prefix)
	}

	localPaths := make([]string, 0, len(keys))
	for _, key := range keys {
		localPath := filepath.Join(destDir, objectRelativePath(prefix, key))
		if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
			return nil, fmt.Errorf("failed to prepare directory for %s: %w", localPath, err)
		}
		if err := d.client.DownloadObject(ctx, key, localPath); err != nil {
			return nil, err
		}
		localPaths = append(localPaths, localPath)
	}

	sort.Strings(localPaths)
	return localPaths, nil
}

func resolveObjectKey(prefix, override string) string {
	if override == "" {
		return strings.TrimSpace(prefix)
	}
	if prefix == "" {
		return strings.TrimPrefix(override, "/")
	}

	prefixTrimmed := strings.TrimSuffix(strings.TrimSpace(prefix), "/")
	overrideTrimmed := strings.TrimPrefix(strings.TrimSpace(override), "/")

	if strings.HasPrefix(overrideTrimmed, prefixTrimmed) {
		return overrideTrimmed
	}
	return fmt.Sprintf("%s/%s", prefixTrimmed, overrideTrimmed)
}

func objectRelativePath(prefix, key string) string {
	if prefix == "" {
		return key
	}
	prefixTrimmed := strings.TrimSuffix(strings.TrimSpace(prefix), "/")
	rel := strings.TrimPrefix(key, prefixTrimmed+"/")
	if rel == "" {
		return filepath.Base(key)
	}
	return rel
}
