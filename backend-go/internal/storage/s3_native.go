package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type nativeS3Client struct {
	client *s3.Client
	bucket string
	prefix string
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

func (c *nativeS3Client) ListObjects(ctx context.Context, prefix string) ([]ObjectInfo, error) {
	// Combine base prefix with query prefix
	fullPrefix := prefix
	if c.prefix != "" {
		fullPrefix = c.prefix + "/" + prefix
	}

	fmt.Printf("[DEBUG] Native S3 ListObjects: bucket=%q prefix=%q\n", c.bucket, fullPrefix)

	input := &s3.ListObjectsV2Input{
		Bucket: aws.String(c.bucket),
		Prefix: aws.String(fullPrefix),
	}

	result, err := c.client.ListObjectsV2(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to list objects: %w", err)
	}

	fmt.Printf("[DEBUG] Native S3 returned %d objects\n", len(result.Contents))

	var objects []ObjectInfo
	for _, obj := range result.Contents {
		if obj.Key == nil {
			continue
		}

		key := *obj.Key
		// Strip the base prefix if present
		if c.prefix != "" && len(key) > len(c.prefix) {
			key = key[len(c.prefix)+1:]
		}

		size := int64(0)
		if obj.Size != nil {
			size = *obj.Size
		}

		fmt.Printf("[DEBUG] Object: key=%q size=%d\n", key, size)

		objects = append(objects, ObjectInfo{
			Key:  key,
			Size: size,
		})
	}

	return objects, nil
}

func (c *nativeS3Client) GetObjectContent(ctx context.Context, key string) ([]byte, error) {
	fullKey := key
	if c.prefix != "" {
		fullKey = c.prefix + "/" + key
	}

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

func (c *nativeS3Client) DownloadObject(ctx context.Context, key string, destPath string) error {
	_, err := c.GetObjectContent(ctx, key)
	if err != nil {
		return err
	}

	// Write to file (implementation would go here, reusing existing logic)
	return fmt.Errorf("not implemented")
}

func (c *nativeS3Client) UploadObject(ctx context.Context, key string, content []byte) error {
	fullKey := key
	if c.prefix != "" {
		fullKey = c.prefix + "/" + key
	}

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
	fullKey := key
	if c.prefix != "" {
		fullKey = c.prefix + "/" + key
	}

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

func (c *nativeS3Client) DeletePrefix(ctx context.Context, prefix string) error {
	objects, err := c.ListObjects(ctx, prefix)
	if err != nil {
		return err
	}

	for _, obj := range objects {
		if err := c.DeleteObject(ctx, obj.Key); err != nil {
			return err
		}
	}

	return nil
}
