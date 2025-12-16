#!/bin/sh
# Wrapper script for running PO snapshot pipeline manually or via cron
# Usage: ./scripts/run-po-snapshot-pipeline.sh [YYYYMMDD]
# If no date is provided, uses PO_SNAPSHOT_SNAPSHOT_DATE env var

set -e

# Build DATABASE_URL if not provided
if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="postgres://${DB_USER:-postgres}:${DB_PASSWORD:-postgres}@${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-autopo}?sslmode=${DB_SSLMODE:-disable}"
fi

# Use provided date or fall back to env var
SNAPSHOT_DATE="${1:-$PO_SNAPSHOT_SNAPSHOT_DATE}"

# Build command
CMD="/app/bin/seed pipeline-po-snapshot --db-url \"$DATABASE_URL\""

# Add optional flags
if [ -n "$SNAPSHOT_DATE" ]; then
  export PO_SNAPSHOT_SNAPSHOT_DATE="$SNAPSHOT_DATE"
  echo "Running PO snapshot pipeline for date: $SNAPSHOT_DATE"
else
  echo "Running PO snapshot pipeline (no specific date - will process all available)"
fi

if [ "$CLOUD_STORAGE_ENABLED" = "true" ]; then
  echo "Cloud storage: ENABLED"
else
  echo "Cloud storage: DISABLED"
fi

# Execute via entrypoint (handles DB wait and migrations)
exec /app/entrypoint.sh /app/bin/seed pipeline-po-snapshot --db-url "$DATABASE_URL"
