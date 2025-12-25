# Railway Cron Job Setup

This document explains how to set up and configure the stock health pipeline as a Railway cron job.

## Overview

The stock health pipeline can run as a scheduled cron job on Railway to automatically fetch and process stock data from the legacy M2 (CI3) database on a daily or custom schedule.

## Railway Cron Configuration

### 1. Create Cron Job Service

In your Railway project:

1. Add a new service
2. Select your repository
3. Set the service type to **Cron Job**
4. Configure the schedule and command

### 2. Cron Schedule Examples

**Daily at 2 AM (Jakarta Time):**
```
0 19 * * *
```
(19:00 UTC = 02:00 WIB/Jakarta Time, UTC+7)

**Every 6 hours:**
```
0 */6 * * *
```

**Daily at midnight:**
```
0 17 * * *
```
(17:00 UTC = 00:00 WIB)

**Weekdays only at 3 AM:**
```
0 20 * * 1-5
```

### 3. Command Configuration

Set the cron command to:
```bash
/app/scripts/run-stock-health-pipeline.sh
```

Or for a specific date:
```bash
/app/scripts/run-stock-health-pipeline.sh 20250115
```

## Environment Variables

Configure these environment variables in your Railway cron job service:

### Required Variables

#### PostgreSQL (Analytics Database)
```bash
DATABASE_URL=postgres://user:password@host:port/database?sslmode=disable
# Or individual components:
DB_HOST=your-postgres-host
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=autopo
DB_SSLMODE=disable
```

#### Legacy MySQL Database (M2/CI3)
```bash
LEGACY_DB_HOST=your-mysql-host.railway.app
LEGACY_DB_PORT=3306
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=your-mysql-password
LEGACY_DB_NAME=your_database_name
LEGACY_DB_TIMEZONE=Asia/Jakarta
```

### Optional Variables

#### Date Configuration
```bash
# If not set, uses today's date
STOCK_HEALTH_SNAPSHOT_DATE=20250115
```

#### Store Filtering

**Option 1: Filter by Store IDs (Recommended)**
```bash
# Fetch specific stores by their M2 database ID
LEGACY_STORE_IDS=7,8,9
```

**Option 2: Filter by Store Name**
```bash
# Filter stores containing this name (e.g., "Padang" matches "Miss Glam Padang")
STOCK_HEALTH_STORE_FILTER=Padang
```

**Option 3: Fetch All Stores**
```bash
# Leave both LEGACY_STORE_IDS and STOCK_HEALTH_STORE_FILTER empty
# This will fetch all active stores from the database
```

#### Cloud Storage (S3-compatible)
```bash
CLOUD_STORAGE_ENABLED=true
CLOUD_STORAGE_ENDPOINT=https://s3.amazonaws.com
CLOUD_STORAGE_BUCKET=your-bucket-name
CLOUD_STORAGE_REGION=us-east-1
CLOUD_STORAGE_ACCESS_KEY=your-access-key
CLOUD_STORAGE_SECRET_KEY=your-secret-key
CLOUD_STORAGE_PREFIX=stock_health
CLOUD_STORAGE_USE_SSL=true
```

#### Pipeline Configuration
```bash
STOCK_HEALTH_DOWNLOAD_DIR=/app/data/pipeline/stock_health/raw
STOCK_HEALTH_INTERMEDIATE_DIR=/app/data/pipeline/stock_health/intermediate
STOCK_HEALTH_OUTPUT_DIR=/app/data/pipeline/stock_health/output
STOCK_HEALTH_PERSIST_DEBUG_LAYERS=false
PIPELINE_WORKERS=4
```

## Store ID Mapping

The `stores` table in your PostgreSQL database has an `original_id` column that maps to the M2 database store ID:

```sql
-- Example stores table
CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    original_id VARCHAR(255) UNIQUE, -- M2 store ID (e.g., "7", "8", "9")
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Finding Store IDs

**From M2 Database:**
```sql
SELECT id_store, store FROM ap_store WHERE status = 1;
```

**From PostgreSQL (after seeding):**
```sql
SELECT id, name, original_id FROM stores;
```

### Example Store Mapping

| M2 ID | Store Name | PostgreSQL ID |
|-------|------------|---------------|
| 7 | Miss Glam Padang | 1 |
| 8 | Miss Glam Pekanbaru | 2 |
| 9 | Miss Glam Medan | 3 |

## Configuration Examples

### Example 1: Daily All Stores

Fetch all active stores every day at 2 AM Jakarta time:

**Cron Schedule:**
```
0 19 * * *
```

**Environment Variables:**
```bash
DATABASE_URL=postgres://user:pass@host:5432/autopo
LEGACY_DB_HOST=mysql-host.railway.app
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=secret
LEGACY_DB_NAME=glamindo_db
CLOUD_STORAGE_ENABLED=true
CLOUD_STORAGE_ENDPOINT=https://s3.amazonaws.com
CLOUD_STORAGE_BUCKET=missglam-data
CLOUD_STORAGE_ACCESS_KEY=AKIAXXXXX
CLOUD_STORAGE_SECRET_KEY=secret
```

### Example 2: Specific Stores Only

Fetch only Padang and Pekanbaru stores:

**Cron Schedule:**
```
0 19 * * *
```

**Environment Variables:**
```bash
DATABASE_URL=postgres://user:pass@host:5432/autopo
LEGACY_DB_HOST=mysql-host.railway.app
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=secret
LEGACY_DB_NAME=glamindo_db
LEGACY_STORE_IDS=7,8
CLOUD_STORAGE_ENABLED=true
```

### Example 3: Single Store (Padang Only)

**Cron Schedule:**
```
0 19 * * *
```

**Environment Variables:**
```bash
DATABASE_URL=postgres://user:pass@host:5432/autopo
LEGACY_DB_HOST=mysql-host.railway.app
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=secret
LEGACY_DB_NAME=glamindo_db
LEGACY_STORE_IDS=7
```

### Example 4: Filter by Store Name

**Environment Variables:**
```bash
DATABASE_URL=postgres://user:pass@host:5432/autopo
LEGACY_DB_HOST=mysql-host.railway.app
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=secret
LEGACY_DB_NAME=glamindo_db
STOCK_HEALTH_STORE_FILTER=Padang
```

Note: Store name filtering fetches all stores and filters by name match. For better performance, use `LEGACY_STORE_IDS` instead.

### Example 5: Specific Date Processing

Process a specific historical date:

**Environment Variables:**
```bash
DATABASE_URL=postgres://user:pass@host:5432/autopo
LEGACY_DB_HOST=mysql-host.railway.app
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=secret
LEGACY_DB_NAME=glamindo_db
STOCK_HEALTH_SNAPSHOT_DATE=20241225
LEGACY_STORE_IDS=7
```

## Monitoring

### Railway Logs

View cron job logs in Railway dashboard:
1. Go to your cron job service
2. Click on "Deployments"
3. Select the latest deployment
4. View logs

### Log Output

The script provides detailed logging:

```
========================================
Stock Health Pipeline - Railway Cron
========================================
Snapshot Date: 20250115 (2025-01-15)
Mode: LEGACY DATABASE (Direct MySQL fetch)
Legacy DB Host: mysql-host.railway.app
Legacy DB Name: glamindo_db
Store Filter: IDs = 7,8,9
Cloud storage: ENABLED
========================================
Starting pipeline...
========================================
Fetching data for store ID 7...
Generated CSV for store 7 (Miss Glam Padang): 1234 rows -> 20250115_Miss Glam Padang.csv
Fetching data for store ID 8...
Generated CSV for store 8 (Miss Glam Pekanbaru): 987 rows -> 20250115_Miss Glam Pekanbaru.csv
...
Successfully generated 3 CSV files from legacy database
```

### Success Indicators

✅ Pipeline completed successfully:
- Log shows "Successfully generated X CSV files"
- No error messages in logs
- Data appears in PostgreSQL `daily_stock_data` table

❌ Pipeline failed:
- Error messages in logs
- Check database connectivity
- Verify credentials
- Check if data exists for the snapshot date

## Post-Processing

### Cache Invalidation

After a successful pipeline run, invalidate the cache via API:

**Manual:**
```bash
curl -X POST https://your-app.railway.app/api/v1/etl/cache/invalidate/stock_health
```

**Automated (add to cron script):**

Create a wrapper script that calls the API after success:

```bash
#!/bin/sh
/app/scripts/run-stock-health-pipeline.sh

if [ $? -eq 0 ]; then
  echo "Pipeline succeeded, invalidating cache..."
  curl -X POST http://localhost:8080/api/v1/etl/cache/invalidate/stock_health
fi
```

## Troubleshooting

### Issue: Cron job not running

**Check:**
- Cron schedule syntax is correct
- Service is deployed and active
- Command path is correct (`/app/scripts/run-stock-health-pipeline.sh`)

### Issue: "failed to connect to legacy database"

**Solution:**
- Verify `LEGACY_DB_HOST` is accessible from Railway
- Check MySQL credentials
- Ensure MySQL port (3306) is open
- Test connection: `mysql -h $LEGACY_DB_HOST -u $LEGACY_DB_USER -p`

### Issue: "no data fetched from legacy database"

**Solution:**
- Check if data exists for the snapshot date in M2:
  ```sql
  SELECT COUNT(*) FROM stok_store 
  WHERE DATE(generate_date) = '2025-01-15';
  ```
- Verify store IDs are correct
- Check if stores are active in M2

### Issue: Pipeline runs but no data in PostgreSQL

**Solution:**
- Check PostgreSQL connection
- Verify `DATABASE_URL` is correct
- Check if migrations have run
- Look for errors in pipeline logs

### Issue: "ERROR: Neither LEGACY_DB_HOST nor STOCK_HEALTH_DRIVE_FOLDER_ID is configured"

**Solution:**
- Set either legacy DB credentials OR Google Drive folder ID
- For Railway cron, use legacy DB mode (recommended)

## Best Practices

1. **Use Cloud Storage**: Enable cloud storage to persist raw CSV files for validation
2. **Start with Single Store**: Test with one store before running for all stores
3. **Monitor First Runs**: Watch logs closely for the first few cron executions
4. **Set Appropriate Workers**: Use 4-8 workers based on Railway plan resources
5. **Use Store IDs**: Prefer `LEGACY_STORE_IDS` over name filtering for better performance
6. **Schedule Off-Peak**: Run during low-traffic hours (e.g., 2-4 AM)
7. **Enable Alerts**: Set up Railway alerts for failed deployments
8. **Backup Data**: Regularly backup PostgreSQL database
9. **Version Control**: Keep environment variables documented in a secure location

## Migration from Google Drive

If migrating from Google Drive mode to legacy DB mode:

1. **Test in Parallel**: Run both modes for a few days to compare results
2. **Validate Data**: Use the validation endpoint to compare outputs
3. **Update Cron**: Switch cron job to use legacy DB environment variables
4. **Remove Drive Credentials**: Remove `GOOGLE_DRIVE_CREDENTIALS_JSON` after migration
5. **Monitor**: Watch for any data discrepancies

## Security Notes

- **Never commit credentials**: Use Railway's environment variables
- **Rotate passwords**: Regularly update database passwords
- **Use SSL**: Enable SSL for MySQL connections when possible
- **Limit access**: Use read-only MySQL user for the pipeline
- **Audit logs**: Regularly review cron job logs for suspicious activity

## See Also

- [Pipeline Commands Reference](./PIPELINE_COMMANDS.md) - Complete CLI flag documentation
- [ETL API Documentation](./ETL_API.md) - API endpoints for manual triggering
- [Architecture Documentation](./ARCHITECTURE.md) - System overview
