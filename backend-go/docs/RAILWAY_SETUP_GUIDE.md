# Railway Cron Job - Quick Setup Guide

This is a step-by-step guide to set up the stock health pipeline as a Railway cron job.

## Prerequisites

- Railway account with project created
- PostgreSQL database service running on Railway
- Access to legacy M2 (CI3) MySQL database
- (Optional) S3-compatible cloud storage

## Step 1: Prepare Store IDs

Find your store IDs from the M2 database:

```sql
-- Connect to your M2 MySQL database
SELECT id_store, store FROM ap_store WHERE status = 1 ORDER BY id_store;
```

Example output:
```
+----------+---------------------+
| id_store | store               |
+----------+---------------------+
|        7 | Miss Glam Padang    |
|        8 | Miss Glam Pekanbaru |
|        9 | Miss Glam Medan     |
+----------+---------------------+
```

Note down the `id_store` values you want to process.

## Step 2: Create Cron Job Service in Railway

1. **Open your Railway project**
2. **Click "New Service"**
3. **Select "GitHub Repo"** and choose your repository
4. **Configure the service:**
   - Service Name: `stock-health-cron`
   - Service Type: **Cron Job**

## Step 3: Set Cron Schedule

In the cron job settings, set your schedule:

**For daily at 2 AM Jakarta time (UTC+7):**
```
0 19 * * *
```

**Explanation:**
- `0` = minute (0)
- `19` = hour in UTC (19:00 UTC = 02:00 WIB)
- `*` = any day of month
- `*` = any month
- `*` = any day of week

## Step 4: Set Cron Command

Set the command to:
```bash
/app/scripts/run-stock-health-pipeline.sh
```

## Step 5: Configure Environment Variables

Add these environment variables to your cron job service:

### Required Variables

```bash
# PostgreSQL (from your Railway database service)
DATABASE_URL=postgres://user:password@host:5432/autopo?sslmode=disable

# Legacy MySQL Database
LEGACY_DB_HOST=your-mysql-host.railway.app
LEGACY_DB_PORT=3306
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=your-password
LEGACY_DB_NAME=your_database_name
LEGACY_DB_TIMEZONE=Asia/Jakarta
```

### Store Filtering (Choose One)

**Option A: All Stores (Default)**
```bash
# Don't set LEGACY_STORE_IDS or STOCK_HEALTH_STORE_FILTER
# This will fetch all active stores
```

**Option B: Specific Stores (Recommended)**
```bash
LEGACY_STORE_IDS=7,8,9
```

**Option C: Filter by Name**
```bash
STOCK_HEALTH_STORE_FILTER=Padang
```

### Optional: Cloud Storage

```bash
CLOUD_STORAGE_ENABLED=true
CLOUD_STORAGE_ENDPOINT=https://s3.amazonaws.com
CLOUD_STORAGE_BUCKET=your-bucket
CLOUD_STORAGE_REGION=us-east-1
CLOUD_STORAGE_ACCESS_KEY=your-key
CLOUD_STORAGE_SECRET_KEY=your-secret
```

## Step 6: Deploy

1. Click **"Deploy"**
2. Wait for the build to complete
3. The cron job will run according to your schedule

## Step 7: Test Manually (Optional)

Before waiting for the scheduled run, test manually:

1. Go to your cron job service
2. Click **"Run Now"** or trigger via Railway CLI:
   ```bash
   railway run /app/scripts/run-stock-health-pipeline.sh
   ```

## Step 8: Monitor First Run

1. Go to your cron job service
2. Click **"Deployments"**
3. Select the latest deployment
4. Click **"View Logs"**

Look for:
```
========================================
Stock Health Pipeline - Railway Cron
========================================
Snapshot Date: 20250115 (2025-01-15)
Mode: LEGACY DATABASE (Direct MySQL fetch)
Store Filter: IDs = 7,8,9
...
Successfully generated 3 CSV files from legacy database
```

## Step 9: Verify Data

Check if data was inserted into PostgreSQL:

```sql
-- Connect to your Railway PostgreSQL database
SELECT 
    stock_date, 
    COUNT(*) as row_count,
    COUNT(DISTINCT toko) as store_count
FROM daily_stock_data 
WHERE stock_date = '2025-01-15'
GROUP BY stock_date;
```

## Common Configurations

### Configuration 1: Single Store (Testing)

Perfect for testing before running all stores:

```bash
DATABASE_URL=postgres://...
LEGACY_DB_HOST=mysql-host.railway.app
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=secret
LEGACY_DB_NAME=glamindo_db
LEGACY_STORE_IDS=7
CLOUD_STORAGE_ENABLED=false
```

### Configuration 2: All Stores (Production)

```bash
DATABASE_URL=postgres://...
LEGACY_DB_HOST=mysql-host.railway.app
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=secret
LEGACY_DB_NAME=glamindo_db
# No LEGACY_STORE_IDS = fetch all stores
CLOUD_STORAGE_ENABLED=true
CLOUD_STORAGE_ENDPOINT=https://s3.amazonaws.com
CLOUD_STORAGE_BUCKET=missglam-data
CLOUD_STORAGE_ACCESS_KEY=AKIAXXXXX
CLOUD_STORAGE_SECRET_KEY=secret
PIPELINE_WORKERS=8
```

### Configuration 3: Multiple Specific Stores

```bash
DATABASE_URL=postgres://...
LEGACY_DB_HOST=mysql-host.railway.app
LEGACY_DB_USER=root
LEGACY_DB_PASSWORD=secret
LEGACY_DB_NAME=glamindo_db
LEGACY_STORE_IDS=7,8,9,10,11
CLOUD_STORAGE_ENABLED=true
```

## Troubleshooting

### Issue: Cron job doesn't run

**Check:**
- ✅ Service is deployed (green status)
- ✅ Cron schedule is correct
- ✅ Command path is `/app/scripts/run-stock-health-pipeline.sh`
- ✅ Script has execute permissions (should be set in Dockerfile)

### Issue: "failed to connect to legacy database"

**Solution:**
1. Verify MySQL host is accessible from Railway
2. Check credentials are correct
3. Test connection from Railway shell:
   ```bash
   railway run mysql -h $LEGACY_DB_HOST -u $LEGACY_DB_USER -p
   ```

### Issue: No data in PostgreSQL

**Check:**
1. Pipeline logs show "Successfully generated X CSV files"
2. PostgreSQL connection is working
3. Migrations have run
4. Check for errors in logs

### Issue: "ERROR: Neither LEGACY_DB_HOST nor STOCK_HEALTH_DRIVE_FOLDER_ID is configured"

**Solution:**
- Set `LEGACY_DB_HOST`, `LEGACY_DB_USER`, and `LEGACY_DB_NAME` environment variables

## Next Steps

After successful setup:

1. **Monitor for a week** - Watch logs daily to ensure stability
2. **Enable cloud storage** - Archive raw CSV files for validation
3. **Set up alerts** - Configure Railway alerts for failed runs
4. **Document store IDs** - Keep a record of which stores are being processed
5. **Schedule cache invalidation** - Set up automatic cache clearing after pipeline runs

## Advanced: Cache Invalidation

To automatically invalidate cache after successful runs, you can:

1. **Use the API endpoint** from another service:
   ```bash
   curl -X POST https://your-app.railway.app/api/v1/etl/cache/invalidate/stock_health
   ```

2. **Or create a wrapper script** that calls the API after pipeline success

## Support

For issues or questions:
- Check logs in Railway dashboard
- Review [RAILWAY_CRON.md](./RAILWAY_CRON.md) for detailed documentation
- Review [PIPELINE_COMMANDS.md](./PIPELINE_COMMANDS.md) for CLI reference
- Check [ETL_API.md](./ETL_API.md) for API endpoints

## Checklist

Before going live, verify:

- [ ] PostgreSQL database is accessible
- [ ] Legacy MySQL database is accessible
- [ ] Store IDs are correct
- [ ] Cron schedule is correct (consider timezone)
- [ ] Environment variables are set
- [ ] Test run completed successfully
- [ ] Data appears in PostgreSQL
- [ ] Cloud storage is configured (if using)
- [ ] Monitoring/alerts are set up
- [ ] Team is notified of new cron job
