#!/bin/sh
set -e

# Wait for PostgreSQL to be ready
until PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q'; do
  >&2 echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

# Run database migrations only once per file
echo "Ensuring schema_migrations table exists..."
PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

echo "Running database migrations..."
for migration in /app/scripts/migrations/*.sql; do
  migration_name=$(basename "$migration")
  applied=$(PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM schema_migrations WHERE name = '$migration_name'")

  if [ "$applied" = "1" ]; then
    echo "Skipping migration $migration_name (already applied)"
    continue
  fi

  echo "Applying migration: $migration_name"
  PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$migration"
  PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "INSERT INTO schema_migrations (name) VALUES ('$migration_name') ON CONFLICT (name) DO NOTHING;"
done

# Check if we should run seed data
if [ "$RUN_SEED_DATA" = "true" ]; then
  echo "Running Go seed CLI..."

  # Prefer DATABASE_URL if provided, otherwise build one from discrete DB_* envs
  if [ -n "$DATABASE_URL" ]; then
    SEED_DB_URL="$DATABASE_URL"
  else
    SEED_DB_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=${DB_SSLMODE:-disable}"
  fi

  SEED_DATA_DIR=${SEED_DATA_DIR:-/app/data/seeds}
  STOCK_HEALTH_DIR=${STOCK_HEALTH_DIR:-$SEED_DATA_DIR/stock_health}
  PO_SNAPSHOTS_DIR=${PO_SNAPSHOTS_DIR:-$SEED_DATA_DIR/po_snapshots}

  RESET_MASTER_SEED=${RESET_MASTER_SEED:-false}
  RESET_FLAG=""
  if [ "$RESET_MASTER_SEED" = "true" ]; then
    RESET_FLAG="--reset-master"
  fi

  /app/bin/seed all \
    --db-url "$SEED_DB_URL" \
    --data-dir "$SEED_DATA_DIR" \
    --stock-health-dir "$STOCK_HEALTH_DIR" \
    --po-snapshots-dir "$PO_SNAPSHOTS_DIR" \
    $RESET_FLAG
fi

# Start the application
exec "$@"
