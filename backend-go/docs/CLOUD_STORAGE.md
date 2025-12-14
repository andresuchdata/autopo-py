# Cloud Storage Integration

## Overview

The stock health pipeline now supports S3-compatible cloud storage for managing raw inputs, intermediate processing artifacts, and final outputs. This allows the pipeline to operate independently of local file systems and enables better scalability and data persistence.

## Architecture

### Storage Layout

Cloud storage follows a hierarchical folder structure:

```
{bucket}/{prefix}/stock_health/
├── raw/
│   └── {YYYY}/{MM}/{DD}/
│       └── {input-files}.csv
├── intermediate/
│   ├── 1_cleaned_base/{YYYY}/{MM}/{DD}/
│   ├── 2_cleaned_merged/{YYYY}/{MM}/{DD}/
│   └── 3_with_metrics/{YYYY}/{MM}/{DD}/
└── output/
    └── {YYYY}/{MM}/{DD}/
        └── {YYYYMMDD}.csv
```

### Components

1. **Storage Client** (`internal/storage/storage.go`)
   - Generic `ObjectStorage` interface
   - S3-compatible implementation using `chartmuseum/storage`
   - Supports `ListObjects`, `DownloadObject`, `UploadObject`

2. **Pipeline Integration** (`internal/pipeline/stock_health/pipeline.go`)
   - Implements `CloudPipeline` interface
   - `FetchInputFile`: Downloads remote files to temp directory
   - `UploadAggregatedOutput`: Uploads final CSV to cloud storage
   - Intermediate CSVs uploaded directly without local persistence

3. **Worker** (`internal/pipeline/worker.go`)
   - Detects if pipeline implements `CloudPipeline`
   - Downloads input files before transformation
   - Cleans up temporary files after processing

4. **Streaming Aggregator** (`internal/pipeline/streaming_aggregator.go`)
   - Uploads aggregated output after flushing
   - Maintains local file for database seeding

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable cloud storage
CLOUD_STORAGE_ENABLED=true

# S3-compatible endpoint (e.g., MinIO, Wasabi, AWS S3)
CLOUD_STORAGE_ENDPOINT=https://storage.example.com

# Bucket name
CLOUD_STORAGE_BUCKET=pipeline-data

# Region (defaults to us-east-1)
CLOUD_STORAGE_REGION=us-east-1

# Credentials
CLOUD_STORAGE_ACCESS_KEY=your-access-key
CLOUD_STORAGE_SECRET_KEY=your-secret-key

# SSL/TLS (defaults to true)
CLOUD_STORAGE_USE_SSL=true

# Optional prefix for all keys
CLOUD_STORAGE_PREFIX=production
```

### Docker Compose

The `stock-pipeline` service in `docker-compose.yml` is pre-configured to use these environment variables. Simply set them in your `.env` file and run:

```bash
docker-compose up stock-pipeline
```

## Usage

### Local Development

When `CLOUD_STORAGE_ENABLED=false` (default), the pipeline operates normally using local directories:
- Downloads from Google Drive to `STOCK_HEALTH_DOWNLOAD_DIR`
- Writes intermediates to `STOCK_HEALTH_INTERMEDIATE_DIR`
- Writes outputs to `STOCK_HEALTH_OUTPUT_DIR`

### Cloud Storage Mode

When `CLOUD_STORAGE_ENABLED=true`:
1. **Raw files** are downloaded from Google Drive to local temp directory
2. **Raw files** are uploaded to `{bucket}/stock_health/raw/{YYYY}/{MM}/{DD}/` (backup) **concurrently** with processing
3. **Intermediate CSVs** are uploaded to `{bucket}/stock_health/intermediate/...` during processing
4. **Final aggregated CSV** is uploaded to `{bucket}/stock_health/output/{YYYY}/{MM}/{DD}/`
5. Local directories (`STOCK_HEALTH_DOWNLOAD_DIR`, etc.) are still used for temporary processing

**Performance Optimization**: Raw file uploads run in a background goroutine, allowing transformation and processing to start immediately without waiting for uploads to complete. The pipeline ensures all uploads finish before exiting.

### Hybrid Mode

You can optionally upload raw files to cloud storage after downloading from Google Drive by calling:

```go
remotePath, err := pipeline.UploadRawFile(ctx, snapshotDate, localPath)
```

This enables full cloud-based archival of the entire pipeline workflow.

## Testing

### Build

```bash
go build -o bin/seed ./cmd/seed
```

### Run with Cloud Storage

```bash
export CLOUD_STORAGE_ENABLED=true
export CLOUD_STORAGE_ENDPOINT=https://your-s3-endpoint.com
export CLOUD_STORAGE_BUCKET=your-bucket
export CLOUD_STORAGE_ACCESS_KEY=your-key
export CLOUD_STORAGE_SECRET_KEY=your-secret

./bin/seed pipeline-stock-health \
  --db-url "postgres://user:pass@localhost:5432/autopo?sslmode=disable" \
  --drive-folder-id "your-folder-id"
```

### Verify Uploads

Check your S3 bucket for the following structure:
```
stock_health/
├── intermediate/
│   ├── 2_cleaned_merged/2025/01/14/
│   └── 3_with_metrics/2025/01/14/
└── output/2025/01/14/20250114.csv
```

## Troubleshooting

### Connection Issues

If you see `failed to initialize cloud storage client`:
- Verify `CLOUD_STORAGE_ENDPOINT` is accessible
- Check credentials are correct
- Ensure bucket exists and is accessible

### Upload Failures

If intermediates or outputs fail to upload:
- Check bucket permissions (write access required)
- Verify network connectivity to storage endpoint
- Review logs for specific error messages

### Performance

For large files or slow networks:
- Consider adjusting `PIPELINE_WORKERS` (default: CPU count)
- Monitor temp directory disk usage
- Ensure adequate bandwidth for concurrent uploads

## Future Enhancements

- [ ] Support downloading raw files directly from cloud storage (skip Google Drive)
- [ ] Add retry logic for transient upload failures
- [ ] Implement parallel uploads for intermediate files
- [ ] Add DB_STATUS column to transformed CSVs for verification
- [ ] Support multiple cloud storage backends (Azure Blob, GCS)
