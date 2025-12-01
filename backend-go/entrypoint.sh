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
    SEED_DB_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST@$DB_PORT/$DB_NAME?sslmode=${DB_SSLMODE:-disable}"
  fi

  SEED_TARGET=${SEED_TARGET:-all}
  SEED_DATA_DIR=${SEED_DATA_DIR:-/app/data/seeds}
  STOCK_HEALTH_DIR=${STOCK_HEALTH_DIR:-$SEED_DATA_DIR/stock_health}
  PO_SNAPSHOTS_DIR=${PO_SNAPSHOTS_DIR:-$SEED_DATA_DIR/po_snapshots}
  MIGRATIONS_DIR=${MIGRATIONS_DIR:-/app/scripts/migrations}
  RESET_DB=${RESET_DB:-false}
  RESET_MASTER_SEED=${RESET_MASTER_SEED:-false}
  RESET_ANALYTICS_SEED=${RESET_ANALYTICS_SEED:-false}

  build_common_args() {
    set -- /app/bin/seed "$1" --db-url "$SEED_DB_URL" --migrations-dir "$MIGRATIONS_DIR"
    if [ "$RESET_DB" = "true" ]; then
      set -- "$@" --reset-db
    fi
    echo "$@"
  }

  run_seed_command() {
    echo "Executing: $*"
    "$@"
  }

  case "$SEED_TARGET" in
    master)
      eval set -- $(build_common_args "master")
      set -- "$@" --data-dir "$SEED_DATA_DIR"
      if [ "$RESET_MASTER_SEED" = "true" ]; then
        set -- "$@" --reset-master
      fi
      run_seed_command "$@"
      ;;
    analytics)
      eval set -- $(build_common_args "analytics")
      set -- "$@" --stock-health-dir "$STOCK_HEALTH_DIR" --po-snapshots-dir "$PO_SNAPSHOTS_DIR"
      if [ "$RESET_ANALYTICS_SEED" = "true" ]; then
        set -- "$@" --reset-analytics
      fi
      run_seed_command "$@"
      ;;
    analytics-stock)
      eval set -- $(build_common_args "analytics-stock")
      set -- "$@" --stock-health-dir "$STOCK_HEALTH_DIR"
      if [ "$RESET_ANALYTICS_SEED" = "true" ]; then
        set -- "$@" --reset-analytics
      fi
      run_seed_command "$@"
      ;;
    analytics-po)
      eval set -- $(build_common_args "analytics-po")
      set -- "$@" --po-snapshots-dir "$PO_SNAPSHOTS_DIR"
      if [ "$RESET_ANALYTICS_SEED" = "true" ]; then
        set -- "$@" --reset-analytics
      fi
      run_seed_command "$@"
      ;;
    all)
      eval set -- $(build_common_args "all")
      set -- "$@" --data-dir "$SEED_DATA_DIR" --stock-health-dir "$STOCK_HEALTH_DIR" --po-snapshots-dir "$PO_SNAPSHOTS_DIR"
      if [ "$RESET_MASTER_SEED" = "true" ]; then
        set -- "$@" --reset-master
      fi
      if [ "$RESET_ANALYTICS_SEED" = "true" ]; then
        set -- "$@" --reset-analytics
      fi
      run_seed_command "$@"
      ;;
    *)
      echo "Unknown SEED_TARGET '$SEED_TARGET', skipping seed run."
      ;;
  esac
fi

echo "Starting application..."
# Start the application
exec "$@"
