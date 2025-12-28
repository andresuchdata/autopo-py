package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

type nativeS3Client struct {
	client *s3.Client
	bucket string
	prefix string
}

func (c *nativeS3Client) applyBasePrefix(path string, ensureTrailingSlash bool) string {
	base := strings.Trim(c.prefix, "/")
	sub := strings.Trim(path, "/")

	switch {
	case base == "" && sub == "":
		if ensureTrailingSlash {
			return ""
		}
		return ""
	case base == "":
		if ensureTrailingSlash && sub != "" && !strings.HasSuffix(sub, "/") {
			return sub + "/"
		}
		return sub
	case sub == "":
		if ensureTrailingSlash && base != "" && !strings.HasSuffix(base, "/") {
			return base + "/"
		}
		return base
	default:
		combined := base + "/" + sub
		if ensureTrailingSlash && !strings.HasSuffix(combined, "/") {
			return combined + "/"
		}
		return combined
	}
}

func (c *nativeS3Client) stripBasePrefix(key string) string {
	base := strings.Trim(c.prefix, "/")
	if base == "" {
		return key
	}

	withSlash := base + "/"
	keyTrimmed := strings.TrimPrefix(key, "/")
	if strings.HasPrefix(keyTrimmed, withSlash) {
		return strings.TrimPrefix(keyTrimmed, withSlash)
	}

	return key
}

// NewNativeS3Client creates a native AWS SDK v2 S3 client that works with Cloudflare R2
func NewNativeS3Client(cfg Config) (ObjectStorage, error) {
	if cfg.Endpoint == "" {
		return nil, fmt.Errorf("cloud storage endpoint is required")
	}
	if cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, fmt.Errorf("cloud storage credentials are required")
	}
	if cfg.Bucket == "" {
		return nil, fmt.Errorf("cloud storage bucket is required")
	}

	// Create AWS config with static credentials
	awsCfg := aws.Config{
		Region: cfg.Region,
		Credentials: credentials.NewStaticCredentialsProvider(
			cfg.AccessKey,
			cfg.SecretKey,
			"",
		),
	}

	// Create S3 client with custom endpoint resolver for R2
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(cfg.Endpoint)
		o.UsePathStyle = true // Required for R2
	})

	return &nativeS3Client{
		client: client,
		bucket: cfg.Bucket,
		prefix: cfg.Prefix,
	}, nil
}

func (c *nativeS3Client) ListObjects(ctx context.Context, prefix string, limit int, cursor string) (ListObjectsResult, error) {
	fullPrefix := c.applyBasePrefix(prefix, true)

	fmt.Printf("[DEBUG] Native S3 ListObjects: bucket=%q prefix=%q limit=%d cursor=%q\n", c.bucket, fullPrefix, limit, cursor)

	input := &s3.ListObjectsV2Input{
		Bucket:    aws.String(c.bucket),
		Prefix:    aws.String(fullPrefix),
		Delimiter: aws.String("/"),
	}

	if limit > 0 {
		maxKeys := int32(limit)
		if maxKeys > 1000 {
			maxKeys = 1000
		}
		input.MaxKeys = aws.Int32(maxKeys)
	}

	if cursor != "" {
		input.ContinuationToken = aws.String(cursor)
	}

	result, err := c.client.ListObjectsV2(ctx, input)
	if err != nil {
		return ListObjectsResult{}, fmt.Errorf("failed to list objects: %w", err)
	}

	fmt.Printf("[DEBUG] Native S3 returned %d objects\n", len(result.Contents))

	objects := make([]ObjectInfo, 0, len(result.Contents))
	for _, obj := range result.Contents {
		if obj.Key == nil {
			continue
		}

		key := c.stripBasePrefix(*obj.Key)

		size := int64(0)
		if obj.Size != nil {
			size = *obj.Size
		}

		objects = append(objects, ObjectInfo{
			Key:  key,
			Size: size,
		})
	}

	nextCursor := ""
	if result.NextContinuationToken != nil {
		nextCursor = *result.NextContinuationToken
	}

	return ListObjectsResult{
		Objects:    objects,
		NextCursor: nextCursor,
	}, nil
}

func (c *nativeS3Client) GetObjectContent(ctx context.Context, key string) ([]byte, error) {
	fullKey := c.applyBasePrefix(key, false)

	input := &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(fullKey),
	}

	result, err := c.client.GetObject(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to get object %s: %w", key, err)
	}
	defer result.Body.Close()

	content, err := io.ReadAll(result.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read object content: %w", err)
	}

	return content, nil
}

func (c *nativeS3Client) GetObjectStream(ctx context.Context, key string) (io.ReadCloser, error) {
	fullKey := c.applyBasePrefix(key, false)

	input := &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(fullKey),
	}

	result, err := c.client.GetObject(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to get object %s: %w", key, err)
	}

	// Caller must close.
	return result.Body, nil
}

func (c *nativeS3Client) DownloadObject(ctx context.Context, key string, destPath string) error {
	_, err := c.GetObjectContent(ctx, key)
	if err != nil {
		return err
	}

	// Write to file (implementation would go here, reusing existing logic)
	return fmt.Errorf("not implemented")
}

func (c *nativeS3Client) UploadObject(ctx context.Context, key string, content []byte) error {
	fullKey := c.applyBasePrefix(key, false)

	input := &s3.PutObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(fullKey),
		Body:   bytes.NewReader(content),
	}

	_, err := c.client.PutObject(ctx, input)
	if err != nil {
		return fmt.Errorf("failed to upload object %s: %w", key, err)
	}

	return nil
}

func (c *nativeS3Client) DeleteObject(ctx context.Context, key string) error {
	fullKey := c.applyBasePrefix(key, false)

	input := &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(fullKey),
	}

	_, err := c.client.DeleteObject(ctx, input)
	if err != nil {
		return fmt.Errorf("failed to delete object %s: %w", key, err)
	}

	return nil
}

func (c *nativeS3Client) DeleteObjects(ctx context.Context, keys []string) error {
	if len(keys) == 0 {
		return nil
	}

	// S3 DeleteObjects can handle up to 1000 keys at once
	const batchSize = 1000
	for i := 0; i < len(keys); i += batchSize {
		end := i + batchSize
		if end > len(keys) {
			end = len(keys)
		}

		batch := keys[i:end]
		objectIds := make([]types.ObjectIdentifier, len(batch))
		for j, key := range batch {
			fullKey := c.applyBasePrefix(key, false)
			objectIds[j] = types.ObjectIdentifier{
				Key: aws.String(fullKey),
			}
		}

		_, err := c.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(c.bucket),
			Delete: &types.Delete{
				Objects: objectIds,
				Quiet:   aws.Bool(true),
			},
		})
		if err != nil {
			return fmt.Errorf("failed to bulk delete objects: %w", err)
		}
	}

	return nil
}

func (c *nativeS3Client) DeletePrefix(ctx context.Context, prefix string) error {
	fullPrefix := c.applyBasePrefix(prefix, true)
	cursor := ""
	for {
		// List ALL objects under prefix without delimiter to get everything recursively
		input := &s3.ListObjectsV2Input{
			Bucket: aws.String(c.bucket),
			Prefix: aws.String(fullPrefix),
		}
		if cursor != "" {
			input.ContinuationToken = aws.String(cursor)
		}

		result, err := c.client.ListObjectsV2(ctx, input)
		if err != nil {
			return fmt.Errorf("failed to list objects for deletion: %w", err)
		}

		if len(result.Contents) > 0 {
			objectIds := make([]types.ObjectIdentifier, len(result.Contents))
			for i, obj := range result.Contents {
				objectIds[i] = types.ObjectIdentifier{
					Key: obj.Key,
				}
			}

			_, err = c.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
				Bucket: aws.String(c.bucket),
				Delete: &types.Delete{
					Objects: objectIds,
					Quiet:   aws.Bool(true),
				},
			})
			if err != nil {
				return fmt.Errorf("failed to delete objects in prefix: %w", err)
			}
		}

		if result.NextContinuationToken == nil {
			break
		}
		cursor = *result.NextContinuationToken
	}

	return nil
}

func (c *nativeS3Client) ListPrefixes(ctx context.Context, prefix string) ([]string, error) {
	fullPrefix := c.applyBasePrefix(prefix, true)

	fmt.Printf("[DEBUG] Native S3 ListPrefixes: bucket=%q prefix=%q\n", c.bucket, fullPrefix)

	var prefixes []string
	var cursor *string

	for {
		input := &s3.ListObjectsV2Input{
			Bucket:    aws.String(c.bucket),
			Prefix:    aws.String(fullPrefix),
			Delimiter: aws.String("/"),
		}

		if cursor != nil {
			input.ContinuationToken = cursor
		}

		result, err := c.client.ListObjectsV2(ctx, input)
		if err != nil {
			return nil, fmt.Errorf("failed to list prefixes: %w", err)
		}

		baseForTrim := strings.Trim(fullPrefix, "/")
		if baseForTrim != "" {
			baseForTrim += "/"
		}

		for _, cp := range result.CommonPrefixes {
			if cp.Prefix == nil {
				continue
			}
			full := *cp.Prefix
			// Strip the base prefix and the input prefix to get just the folder name
			trimmed := strings.TrimPrefix(full, fullPrefix)
			trimmed = strings.TrimSuffix(trimmed, "/")
			if trimmed == "" {
				continue
			}
			prefixes = append(prefixes, trimmed)
		}

		if result.NextContinuationToken == nil {
			break
		}
		cursor = result.NextContinuationToken
	}

	sort.Strings(prefixes)
	return prefixes, nil
}
