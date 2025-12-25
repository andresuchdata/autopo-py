#!/bin/sh
# Wrapper script for running stock health pipeline manually or via Railway cron
# Usage: ./scripts/run-stock-health-pipeline.sh [YYYYMMDD]
# If no date is provided, uses STOCK_HEALTH_SNAPSHOT_DATE env var
#
# Environment Variables:
#   STOCK_HEALTH_SNAPSHOT_DATE - Date to process (YYYYMMDD format)
#   STOCK_HEALTH_STORE_FILTER  - Optional: Store name filter (e.g., "Padang")
#   LEGACY_DB_HOST             - Legacy MySQL host (required for DB mode)
#   LEGACY_DB_USER             - Legacy MySQL user
#   LEGACY_DB_PASSWORD         - Legacy MySQL password
#   LEGACY_DB_NAME             - Legacy MySQL database name
#   LEGACY_STORE_IDS           - Optional: Comma-separated store IDs (e.g., "7,8,9")
#   CLOUD_STORAGE_ENABLED      - Enable cloud storage (true/false)

set -e

# Build DATABASE_URL if not provided
if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="postgres://${DB_USER:-postgres}:${DB_PASSWORD:-postgres}@${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-autopo}?sslmode=${DB_SSLMODE:-disable}"
fi

# Use provided date or fall back to env var, or use today's date
SNAPSHOT_DATE="${1:-$STOCK_HEALTH_SNAPSHOT_DATE}"
if [ -z "$SNAPSHOT_DATE" ]; then
  SNAPSHOT_DATE=$(date +%Y%m%d)
  echo "No date provided, using today: $SNAPSHOT_DATE"
fi

# Convert YYYYMMDD to YYYY-MM-DD for legacy DB mode
SNAPSHOT_DATE_FORMATTED=$(echo "$SNAPSHOT_DATE" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3/')

echo "========================================"
echo "Stock Health Pipeline - Railway Cron"
echo "========================================"
echo "Snapshot Date: $SNAPSHOT_DATE ($SNAPSHOT_DATE_FORMATTED)"

# Check if legacy DB mode is enabled
if [ -n "$LEGACY_DB_HOST" ] && [ -n "$LEGACY_DB_USER" ] && [ -n "$LEGACY_DB_NAME" ]; then
  echo "Mode: LEGACY DATABASE (Direct MySQL fetch)"
  echo "Legacy DB Host: $LEGACY_DB_HOST"
  echo "Legacy DB Name: $LEGACY_DB_NAME"
  
  # Build command with legacy DB flags
  CMD="/app/bin/seed pipeline-stock-health"
  CMD="$CMD --db-url \"$DATABASE_URL\""
  CMD="$CMD --legacy-db-host \"$LEGACY_DB_HOST\""
  CMD="$CMD --legacy-db-port \"${LEGACY_DB_PORT:-3306}\""
  CMD="$CMD --legacy-db-user \"$LEGACY_DB_USER\""
  CMD="$CMD --legacy-db-password \"$LEGACY_DB_PASSWORD\""
  CMD="$CMD --legacy-db-name \"$LEGACY_DB_NAME\""
  CMD="$CMD --legacy-db-timezone \"${LEGACY_DB_TIMEZONE:-Asia/Jakarta}\""
  CMD="$CMD --snapshot-date \"$SNAPSHOT_DATE\""
  
  # Add store filter if provided
  if [ -n "$LEGACY_STORE_IDS" ]; then
    echo "Store Filter: IDs = $LEGACY_STORE_IDS"
    CMD="$CMD --legacy-store-ids \"$LEGACY_STORE_IDS\""
  elif [ -n "$STOCK_HEALTH_STORE_FILTER" ]; then
    echo "Store Filter: Name contains '$STOCK_HEALTH_STORE_FILTER'"
    echo "Note: Store name filter will fetch all stores and filter by name match"
    # Store name filtering is handled by the API endpoint, not CLI
    # For CLI, we fetch all stores or use specific IDs
  else
    echo "Store Filter: ALL ACTIVE STORES"
  fi
  
else
  echo "Mode: GOOGLE DRIVE (Download CSV files)"
  
  # Check if Drive folder ID is provided
  if [ -z "$STOCK_HEALTH_DRIVE_FOLDER_ID" ]; then
    echo "ERROR: Neither LEGACY_DB_HOST nor STOCK_HEALTH_DRIVE_FOLDER_ID is configured"
    echo "Please set either legacy DB credentials or Google Drive folder ID"
    exit 1
  fi
  
  echo "Drive Folder ID: $STOCK_HEALTH_DRIVE_FOLDER_ID"
  
  # Build command with Drive flags
  CMD="/app/bin/seed pipeline-stock-health"
  CMD="$CMD --db-url \"$DATABASE_URL\""
  CMD="$CMD --drive-folder-id \"$STOCK_HEALTH_DRIVE_FOLDER_ID\""
  CMD="$CMD --snapshot-date \"$SNAPSHOT_DATE\""
fi

# Add common flags
CMD="$CMD --download-dir \"${STOCK_HEALTH_DOWNLOAD_DIR:-/app/data/pipeline/stock_health/raw}\""
CMD="$CMD --intermediate-dir \"${STOCK_HEALTH_INTERMEDIATE_DIR:-/app/data/pipeline/stock_health/intermediate}\""
CMD="$CMD --output-dir \"${STOCK_HEALTH_OUTPUT_DIR:-/app/data/pipeline/stock_health/output}\""
CMD="$CMD --pipeline-workers \"${PIPELINE_WORKERS:-4}\""

if [ "$STOCK_HEALTH_PERSIST_DEBUG_LAYERS" = "true" ]; then
  CMD="$CMD --persist-debug-layers"
  echo "Debug layers: ENABLED"
fi

# Add cloud storage flags if enabled
if [ "$CLOUD_STORAGE_ENABLED" = "true" ]; then
  echo "Cloud storage: ENABLED"
  CMD="$CMD --cloud-storage-enabled"
  CMD="$CMD --cloud-storage-endpoint \"$CLOUD_STORAGE_ENDPOINT\""
  CMD="$CMD --cloud-storage-bucket \"$CLOUD_STORAGE_BUCKET\""
  CMD="$CMD --cloud-storage-region \"${CLOUD_STORAGE_REGION:-us-east-1}\""
  CMD="$CMD --cloud-storage-access-key \"$CLOUD_STORAGE_ACCESS_KEY\""
  CMD="$CMD --cloud-storage-secret-key \"$CLOUD_STORAGE_SECRET_KEY\""
  
  if [ -n "$CLOUD_STORAGE_PREFIX" ]; then
    CMD="$CMD --cloud-storage-prefix \"$CLOUD_STORAGE_PREFIX\""
  fi
  
  if [ "$CLOUD_STORAGE_USE_SSL" = "false" ]; then
    CMD="$CMD --cloud-storage-use-ssl=false"
  fi
else
  echo "Cloud storage: DISABLED"
fi

echo "========================================"
echo "Starting pipeline..."
echo "========================================"

# Execute via entrypoint (handles DB wait and migrations)
exec /app/entrypoint.sh sh -c "$CMD"
