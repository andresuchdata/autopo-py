# Railway Deployment Guide

## Overview

This guide covers deploying the stock health pipeline to Railway with support for:
- Web server (main service)
- Manual pipeline runs
- Scheduled cron jobs

## Deployment Setup

### 1. Main Web Service

Deploy the main application with these environment variables:

```bash
# Database (Railway PostgreSQL)
DATABASE_URL=${{Postgres.DATABASE_URL}}
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_NAME=${{Postgres.PGDATABASE}}

# Cloud Storage (Cloudflare R2 or S3-compatible)
CLOUD_STORAGE_ENABLED=true
CLOUD_STORAGE_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
CLOUD_STORAGE_BUCKET=your-bucket-name
CLOUD_STORAGE_REGION=auto
CLOUD_STORAGE_ACCESS_KEY=your-access-key
CLOUD_STORAGE_SECRET_KEY=your-secret-key
CLOUD_STORAGE_USE_SSL=true

# Google Drive Integration
GOOGLE_DRIVE_CREDENTIALS_JSON={"type":"service_account",...}
STOCK_HEALTH_DRIVE_FOLDER_ID=your-folder-id

# Application
SERVER_PORT=8080
SERVER_MODE=release
```

**Start Command:**
```bash
/app/bin/app
```

### 2. Cron Job Service (Stock Health Pipeline)

Create a separate Railway service for scheduled pipeline runs:

**Environment Variables:**
```bash
# Database (same as main service)
DATABASE_URL=${{Postgres.DATABASE_URL}}
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}
DB_NAME=${{Postgres.PGDATABASE}}

# Cloud Storage (same as main service)
CLOUD_STORAGE_ENABLED=true
CLOUD_STORAGE_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
CLOUD_STORAGE_BUCKET=your-bucket-name
CLOUD_STORAGE_REGION=auto
CLOUD_STORAGE_ACCESS_KEY=your-access-key
CLOUD_STORAGE_SECRET_KEY=your-secret-key
CLOUD_STORAGE_USE_SSL=true

# Google Drive (same as main service)
GOOGLE_DRIVE_CREDENTIALS_JSON={"type":"service_account",...}
STOCK_HEALTH_DRIVE_FOLDER_ID=your-folder-id

# Pipeline Configuration
STOCK_HEALTH_SNAPSHOT_DATE=20251214  # Optional: specific date, or leave empty for latest
SKIP_MIGRATIONS=true  # Skip migrations on cron runs (main service handles this)
```

**Cron Schedule:**
```bash
0 2 * * *  # Run daily at 2 AM UTC
```

**Start Command:**
```bash
/app/scripts/run-stock-health-pipeline.sh
```

Or for a specific date:
```bash
/app/scripts/run-stock-health-pipeline.sh 20251214
```

### 3. One-off Manual Runs

To run the pipeline manually via Railway CLI:

```bash
# Run for latest available date
railway run /app/bin/seed pipeline-stock-health --db-url "$DATABASE_URL"

# Run for specific date
railway run env STOCK_HEALTH_SNAPSHOT_DATE=20251214 /app/bin/seed pipeline-stock-health --db-url "$DATABASE_URL"
```

Or using the wrapper script:
```bash
railway run /app/scripts/run-stock-health-pipeline.sh 20251214
```

## Pipeline Behavior

### With Cloud Storage Enabled

1. Downloads raw files from Google Drive folder `STOCK_HEALTH_DRIVE_FOLDER_ID/{YYYYMMDD}/input/`
2. Uploads raw files to S3: `{bucket}/stock_health/raw/{YYYY}/{MM}/{DD}/`
3. Processes and transforms data
4. Uploads intermediate CSVs to S3: `{bucket}/stock_health/intermediate/3_with_metrics/{YYYY}/{MM}/{DD}/`
5. Uploads final output to S3: `{bucket}/stock_health/output/{YYYY}/{MM}/{DD}/`
6. Seeds database with processed records

### Without Cloud Storage

1. Downloads raw files from Google Drive to local temp directory
2. Processes and transforms data locally
3. Seeds database with processed records
4. No S3 uploads

## Monitoring

Check logs in Railway dashboard:
- Main service: Application logs, API requests
- Cron service: Pipeline execution logs, data quality warnings

## Troubleshooting

### Pipeline fails with "PostgreSQL is unavailable"
- Ensure the PostgreSQL service is linked to your Railway service
- Check `DATABASE_URL` is correctly set

### Pipeline skips rows
- Check logs for warnings like: `warning: skipping row X: empty SKU`
- Review source data quality in Google Drive

### Cloud storage upload fails
- Verify `CLOUD_STORAGE_ACCESS_KEY` and `CLOUD_STORAGE_SECRET_KEY`
- Check bucket permissions
- Ensure `CLOUD_STORAGE_ENDPOINT` is correct

### No data processed
- Verify `STOCK_HEALTH_DRIVE_FOLDER_ID` points to correct folder
- Check date folder exists: `{folder_id}/{YYYYMMDD}/input/`
- Ensure Google Drive service account has read access

## Cost Optimization

1. **Separate cron service**: Runs only when scheduled, doesn't consume resources 24/7
2. **Skip migrations on cron**: Set `SKIP_MIGRATIONS=true` for cron jobs
3. **Use cloud storage**: Reduces local disk usage and enables data persistence across deployments
