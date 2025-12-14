package storage

import "context"

// ObjectInfo represents metadata for a remote file/object.
type ObjectInfo struct {
	Key  string
	Size int64
}

// ObjectStorage captures the minimal S3-compatible operations the pipeline needs.
type ObjectStorage interface {
	ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error)
	DownloadObject(ctx context.Context, key string, destPath string) error
	UploadObject(ctx context.Context, key string, data []byte) error
}
