# Pipeline Commands Reference

This document provides comprehensive examples of all pipeline commands with various flag combinations for the stock health pipeline.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Stock Health Pipeline](#stock-health-pipeline)
  - [Google Drive Mode](#google-drive-mode)
  - [Legacy Database Mode](#legacy-database-mode)
  - [Reuse Local Files Mode](#reuse-local-files-mode)
  - [Cloud Storage Integration](#cloud-storage-integration)
- [Database Operations](#database-operations)
- [Common Workflows](#common-workflows)

---

## Prerequisites

Ensure Docker and Docker Compose are installed and the database service is running:

```bash
# Start the database
docker compose up -d db

# Check database health
docker compose ps db
```

---

## Environment Variables

### Core Database Configuration

```bash
# PostgreSQL (TimescaleDB) - Analytics Database
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=postgres
export DB_PASSWORD=postgres
export DB_NAME=autopo
export DB_SSLMODE=disable
export DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=${DB_SSLMODE}"
```

### Legacy CI3 MySQL Database Configuration

```bash
# Legacy CI3 Database (for direct data fetch)
export LEGACY_DB_HOST=your-mysql-host
export LEGACY_DB_PORT=3306
export LEGACY_DB_USER=your-mysql-user
export LEGACY_DB_PASSWORD=your-mysql-password
export LEGACY_DB_NAME=your-database-name
export LEGACY_DB_TIMEZONE=Asia/Jakarta
```

### Google Drive Configuration

```bash
# Google Drive API credentials (JSON format)
export GOOGLE_DRIVE_CREDENTIALS_JSON='{"type":"service_account",...}'
export STOCK_HEALTH_DRIVE_FOLDER_ID=your-folder-id
```

### Cloud Storage Configuration (S3-compatible)

```bash
export CLOUD_STORAGE_ENABLED=true
export CLOUD_STORAGE_ENDPOINT=https://s3.amazonaws.com
export CLOUD_STORAGE_BUCKET=your-bucket-name
export CLOUD_STORAGE_REGION=us-east-1
export CLOUD_STORAGE_ACCESS_KEY=your-access-key
export CLOUD_STORAGE_SECRET_KEY=your-secret-key
export CLOUD_STORAGE_USE_SSL=true
export CLOUD_STORAGE_PREFIX=autopo/stock_health
```

### Pipeline Configuration

```bash
export STOCK_HEALTH_SNAPSHOT_DATE=20250115
export STOCK_HEALTH_DOWNLOAD_DIR=./data/pipeline/stock_health/raw
export STOCK_HEALTH_INTERMEDIATE_DIR=./data/pipeline/stock_health/intermediate
export STOCK_HEALTH_OUTPUT_DIR=./data/pipeline/stock_health/output
export STOCK_HEALTH_PERSIST_DEBUG_LAYERS=true
export PIPELINE_WORKERS=4
```

---

## Stock Health Pipeline

### Google Drive Mode

#### 1. Basic Pipeline Run (Download from Drive)

```bash
docker compose run --rm stock-pipeline
```

This uses environment variables from `docker-compose.yml` and `.env` file.

#### 2. Run with Specific Snapshot Date

```bash
docker compose run --rm \
  -e STOCK_HEALTH_SNAPSHOT_DATE=20250115 \
  stock-pipeline
```

#### 3. Run with Custom Drive Folder

```bash
docker compose run --rm \
  -e STOCK_HEALTH_DRIVE_FOLDER_ID=your-folder-id \
  -e STOCK_HEALTH_SNAPSHOT_DATE=20250115 \
  stock-pipeline
```

#### 4. Direct Command (without docker-compose service)

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --drive-folder-id "${STOCK_HEALTH_DRIVE_FOLDER_ID}" \
  --snapshot-date 20250115 \
  --download-dir /app/data/pipeline/stock_health/raw \
  --intermediate-dir /app/data/pipeline/stock_health/intermediate \
  --output-dir /app/data/pipeline/stock_health/output \
  --pipeline-workers 4
```

---

### Legacy Database Mode

#### 1. Fetch All Active Stores from Legacy DB

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --legacy-db-host your-mysql-host \
  --legacy-db-port 3306 \
  --legacy-db-user your-user \
  --legacy-db-password your-password \
  --legacy-db-name your-database \
  --legacy-db-timezone Asia/Jakarta \
  --snapshot-date 20250115 \
  --download-dir /app/data/pipeline/stock_health/raw \
  --pipeline-workers 4
```

#### 2. Fetch Specific Stores by ID

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --legacy-db-host your-mysql-host \
  --legacy-db-user your-user \
  --legacy-db-password your-password \
  --legacy-db-name your-database \
  --legacy-store-ids 7,8,9 \
  --snapshot-date 20250115 \
  --download-dir /app/data/pipeline/stock_health/raw
```

#### 3. Legacy DB Mode with Environment Variables

```bash
# Set environment variables
export LEGACY_DB_HOST=your-mysql-host
export LEGACY_DB_USER=your-user
export LEGACY_DB_PASSWORD=your-password
export LEGACY_DB_NAME=your-database
export LEGACY_STORE_IDS=7,8,9
export STOCK_HEALTH_SNAPSHOT_DATE=20250115

# Run pipeline
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --legacy-db-host "${LEGACY_DB_HOST}" \
  --legacy-db-user "${LEGACY_DB_USER}" \
  --legacy-db-password "${LEGACY_DB_PASSWORD}" \
  --legacy-db-name "${LEGACY_DB_NAME}" \
  --legacy-store-ids "${LEGACY_STORE_IDS}" \
  --snapshot-date "${STOCK_HEALTH_SNAPSHOT_DATE}"
```

#### 4. Legacy DB with Cloud Storage Upload

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --legacy-db-host your-mysql-host \
  --legacy-db-user your-user \
  --legacy-db-password your-password \
  --legacy-db-name your-database \
  --snapshot-date 20250115 \
  --cloud-storage-enabled \
  --cloud-storage-endpoint https://s3.amazonaws.com \
  --cloud-storage-bucket your-bucket \
  --cloud-storage-access-key your-key \
  --cloud-storage-secret-key your-secret
```

---

### Reuse Local Files Mode

#### 1. Process Existing Local Files (Skip Download)

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --reuse-local \
  --download-dir /app/data/pipeline/stock_health/raw \
  --snapshot-date 20250115
```

#### 2. Reuse Local with Debug Layers

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --reuse-local \
  --persist-debug-layers \
  --download-dir /app/data/pipeline/stock_health/raw \
  --intermediate-dir /app/data/pipeline/stock_health/intermediate \
  --output-dir /app/data/pipeline/stock_health/output
```

---

### Cloud Storage Integration

#### 1. Enable Cloud Storage for All Artifacts

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --drive-folder-id "${STOCK_HEALTH_DRIVE_FOLDER_ID}" \
  --snapshot-date 20250115 \
  --cloud-storage-enabled \
  --cloud-storage-endpoint https://s3.amazonaws.com \
  --cloud-storage-bucket autopo-data \
  --cloud-storage-region us-east-1 \
  --cloud-storage-access-key "${CLOUD_STORAGE_ACCESS_KEY}" \
  --cloud-storage-secret-key "${CLOUD_STORAGE_SECRET_KEY}" \
  --cloud-storage-prefix stock_health
```

#### 2. Cloud Storage with MinIO (Self-hosted)

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --legacy-db-host your-mysql-host \
  --legacy-db-user your-user \
  --legacy-db-password your-password \
  --legacy-db-name your-database \
  --snapshot-date 20250115 \
  --cloud-storage-enabled \
  --cloud-storage-endpoint http://minio:9000 \
  --cloud-storage-bucket autopo \
  --cloud-storage-region us-east-1 \
  --cloud-storage-access-key minioadmin \
  --cloud-storage-secret-key minioadmin \
  --cloud-storage-use-ssl false
```

---

## Database Operations

### 1. Reset Database and Run Pipeline

```bash
docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --reset-db \
  --migrations-dir /app/scripts/migrations \
  --drive-folder-id "${STOCK_HEALTH_DRIVE_FOLDER_ID}" \
  --snapshot-date 20250115
```

### 2. Run Migrations Only

```bash
docker compose run --rm app /app/bin/seed migrate \
  --db-url "${DATABASE_URL}" \
  --migrations-dir /app/scripts/migrations
```

### 3. Seed Database with Sample Data

```bash
docker compose run --rm seeder
```

---

## Common Workflows

### Workflow 1: Daily Production Run (Google Drive)

```bash
#!/bin/bash
# daily-stock-health.sh

TODAY=$(date +%Y%m%d)

docker compose run --rm stock-pipeline \
  -e STOCK_HEALTH_SNAPSHOT_DATE="${TODAY}"
```

### Workflow 2: Nightly Sync from Legacy DB

```bash
#!/bin/bash
# nightly-legacy-sync.sh

TODAY=$(date +%Y%m%d)

docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --legacy-db-host "${LEGACY_DB_HOST}" \
  --legacy-db-user "${LEGACY_DB_USER}" \
  --legacy-db-password "${LEGACY_DB_PASSWORD}" \
  --legacy-db-name "${LEGACY_DB_NAME}" \
  --snapshot-date "${TODAY}" \
  --cloud-storage-enabled \
  --cloud-storage-endpoint "${CLOUD_STORAGE_ENDPOINT}" \
  --cloud-storage-bucket "${CLOUD_STORAGE_BUCKET}" \
  --cloud-storage-access-key "${CLOUD_STORAGE_ACCESS_KEY}" \
  --cloud-storage-secret-key "${CLOUD_STORAGE_SECRET_KEY}" \
  --pipeline-workers 8

# Invalidate cache after successful run
if [ $? -eq 0 ]; then
  curl -X POST http://localhost:8080/api/v1/etl/cache/invalidate/stock_health
fi
```

### Workflow 3: Backfill Historical Data

```bash
#!/bin/bash
# backfill-historical.sh

START_DATE="20241201"
END_DATE="20241231"

current_date="${START_DATE}"
while [ "${current_date}" != "${END_DATE}" ]; do
  echo "Processing ${current_date}..."
  
  docker compose run --rm app /app/bin/seed pipeline-stock-health \
    --db-url "${DATABASE_URL}" \
    --legacy-db-host "${LEGACY_DB_HOST}" \
    --legacy-db-user "${LEGACY_DB_USER}" \
    --legacy-db-password "${LEGACY_DB_PASSWORD}" \
    --legacy-db-name "${LEGACY_DB_NAME}" \
    --snapshot-date "${current_date}" \
    --pipeline-workers 4
  
  # Increment date
  current_date=$(date -d "${current_date} + 1 day" +%Y%m%d)
done
```

### Workflow 4: Test Single Store

```bash
#!/bin/bash
# test-single-store.sh

STORE_ID=7
DATE=20250115

docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --legacy-db-host "${LEGACY_DB_HOST}" \
  --legacy-db-user "${LEGACY_DB_USER}" \
  --legacy-db-password "${LEGACY_DB_PASSWORD}" \
  --legacy-db-name "${LEGACY_DB_NAME}" \
  --legacy-store-ids "${STORE_ID}" \
  --snapshot-date "${DATE}" \
  --persist-debug-layers \
  --download-dir ./data/test/raw \
  --intermediate-dir ./data/test/intermediate \
  --output-dir ./data/test/output
```

### Workflow 5: Development Mode (Local Files)

```bash
#!/bin/bash
# dev-reprocess.sh

# Place CSV files in ./data/pipeline/stock_health/raw/
# Then reprocess without downloading

docker compose run --rm app /app/bin/seed pipeline-stock-health \
  --db-url "${DATABASE_URL}" \
  --reuse-local \
  --persist-debug-layers \
  --download-dir /app/data/pipeline/stock_health/raw \
  --intermediate-dir /app/data/pipeline/stock_health/intermediate \
  --output-dir /app/data/pipeline/stock_health/output \
  --pipeline-workers 1
```

---

## Flag Reference

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--db-url` | string | - | PostgreSQL connection URL (required) |
| `--migrations-dir` | string | `./backend-go/scripts/migrations` | Migrations directory |
| `--reset-db` | bool | false | Drop schema and re-run migrations |
| `--drive-folder-id` | string | - | Google Drive folder ID |
| `--download-dir` | string | `./data/pipeline/stock_health/raw` | Local download directory |
| `--intermediate-dir` | string | `./data/pipeline/stock_health/intermediate` | Intermediate outputs directory |
| `--output-dir` | string | `./data/pipeline/stock_health/output` | Final output directory |
| `--snapshot-date` | string | - | Specific date to process (YYYYMMDD) |
| `--input-date-format` | string | `20060102` | Date format in filenames |
| `--persist-debug-layers` | bool | false | Persist cleaned_base layer |
| `--reuse-local` | bool | false | Skip download, use existing files |
| `--cloud-storage-enabled` | bool | false | Enable cloud storage |
| `--cloud-storage-endpoint` | string | - | S3-compatible endpoint |
| `--cloud-storage-bucket` | string | - | Bucket name |
| `--cloud-storage-region` | string | - | Bucket region |
| `--cloud-storage-access-key` | string | - | Access key ID |
| `--cloud-storage-secret-key` | string | - | Secret access key |
| `--cloud-storage-prefix` | string | - | Prefix inside bucket |
| `--cloud-storage-use-ssl` | bool | true | Use HTTPS |
| `--pipeline-workers` | int | CPU count | Concurrent workers |
| `--supplier-file` | string | - | Supplier master file path |
| `--top100-sku-dir` | string | - | Top 100 SKU files directory |
| `--legacy-db-host` | string | - | Legacy MySQL host |
| `--legacy-db-port` | string | `3306` | Legacy MySQL port |
| `--legacy-db-user` | string | - | Legacy MySQL user |
| `--legacy-db-password` | string | - | Legacy MySQL password |
| `--legacy-db-name` | string | - | Legacy MySQL database |
| `--legacy-db-timezone` | string | `Asia/Jakarta` | Legacy MySQL timezone |
| `--legacy-store-ids` | []string | - | Comma-separated store IDs |

---

## Troubleshooting

### Issue: "drive-folder-id is required"

**Solution:** Either provide `--drive-folder-id` flag or use legacy DB mode with `--legacy-db-host`.

### Issue: "failed to connect to legacy database"

**Solution:** Verify legacy DB credentials and network connectivity:
```bash
mysql -h your-host -u your-user -p your-database
```

### Issue: "no data fetched from legacy database"

**Solution:** Check if data exists for the snapshot date:
```sql
SELECT COUNT(*) FROM stok_store 
WHERE id_store = 7 
AND DATE(generate_date) = '2025-01-15';
```

### Issue: Pipeline runs but no output files

**Solution:** Check logs for errors and verify output directory permissions:
```bash
docker compose run --rm app ls -la /app/data/pipeline/stock_health/output
```

---

## Best Practices

1. **Use environment variables** for sensitive credentials (passwords, API keys)
2. **Enable cloud storage** for production to persist artifacts
3. **Start with single store** when testing new configurations
4. **Use `--persist-debug-layers`** during development for debugging
5. **Set appropriate `--pipeline-workers`** based on available resources
6. **Invalidate cache** after successful pipeline runs
7. **Monitor logs** for errors and performance metrics
8. **Backup database** before running with `--reset-db`

---

## See Also

- [ETL API Documentation](./ETL_API.md) - API endpoints for cache invalidation and job triggering
- [Architecture Documentation](./ARCHITECTURE.md) - System architecture overview
- [Development Guide](./DEVELOPMENT.md) - Local development setup
