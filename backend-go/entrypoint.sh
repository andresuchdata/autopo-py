#!/bin/sh
set -e

# Function to wait for PostgreSQL
wait_for_postgres() {
  echo "Waiting for PostgreSQL to be ready..."
  until PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q' 2>/dev/null; do
    >&2 echo "PostgreSQL is unavailable - sleeping"
    sleep 1
  done
  echo "PostgreSQL is ready!"
}

# Function to run migrations
run_migrations() {
  # Check if schema_migrations exists and has a 'version' column (golang-migrate style)
  if PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "\d schema_migrations" 2>/dev/null | grep -q "version"; then
    echo "Detected golang-migrate style schema_migrations table. Skipping custom entrypoint migrations."
    return
  fi

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
}

# Check if this is a direct seed command (for cron/manual runs)
if [ "$1" = "/app/bin/seed" ] || [ "$1" = "seed" ]; then
  echo "Direct seed command detected - running in one-off mode"
  wait_for_postgres
  # Run migrations only if SKIP_MIGRATIONS is not set
  if [ "$SKIP_MIGRATIONS" != "true" ]; then
    run_migrations
  fi
  exec "$@"
fi

# Otherwise, run normal startup flow
wait_for_postgres

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  run_migrations
fi

# Check if we should run seed data
if [ "$RUN_SEED_DATA" = "true" ]; then
  echo "Running Go seed CLI..."

  # Prefer DATABASE_URL if provided, otherwise build one from discrete DB_* envs
  if [ -n "$DATABASE_URL" ]; then
    SEED_DB_URL="$DATABASE_URL"
  else
    SEED_DB_URL="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=${DB_SSLMODE:-disable}"
  fi

  SEED_TARGET=${SEED_TARGET:-all}
  SEED_DATA_DIR=${SEED_DATA_DIR:-/app/data/seeds}
  MASTER_DATA_DIR=${MASTER_DATA_DIR:-$SEED_DATA_DIR/master_data}
  STOCK_HEALTH_DIR=${STOCK_HEALTH_DIR:-$SEED_DATA_DIR/stock_health}
  STOCK_HEALTH_FILE=${STOCK_HEALTH_FILE:-}
  PO_SNAPSHOTS_DIR=${PO_SNAPSHOTS_DIR:-$SEED_DATA_DIR/po_snapshots}
  PO_SNAPSHOTS_FILE=${PO_SNAPSHOTS_FILE:-}
  MIGRATIONS_DIR=${MIGRATIONS_DIR:-/app/scripts/migrations}
  RESET_DB=${RESET_DB:-false}
  RESET_MASTER_SEED=${RESET_MASTER_SEED:-false}
  RESET_ANALYTICS_SEED=${RESET_ANALYTICS_SEED:-false}
  INCLUDE_MAPPINGS=${INCLUDE_MAPPINGS:-false}

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
      (
        eval set -- $(build_common_args "master")
        set -- "$@" --data-dir "$MASTER_DATA_DIR"
        if [ "$RESET_MASTER_SEED" = "true" ]; then
          set -- "$@" --reset-master
        fi
        if [ "$INCLUDE_MAPPINGS" = "true" ]; then
          set -- "$@" --include-mappings
        fi
        run_seed_command "$@"
      )
      ;;
    pipeline-stock-health)
      (
        eval set -- $(build_common_args "pipeline-stock-health")
        run_seed_command "$@"
      )
      ;;
    analytics)
      (
        eval set -- $(build_common_args "analytics")
        set -- "$@" --stock-health-dir "$STOCK_HEALTH_DIR" --po-snapshots-dir "$PO_SNAPSHOTS_DIR"
        if [ -n "$STOCK_HEALTH_FILE" ]; then
          set -- "$@" --stock-health-file "$STOCK_HEALTH_FILE"
        fi
        if [ -n "$PO_SNAPSHOTS_FILE" ]; then
          set -- "$@" --po-snapshots-file "$PO_SNAPSHOTS_FILE"
        fi
        if [ "$RESET_ANALYTICS_SEED" = "true" ]; then
          set -- "$@" --reset-analytics
        fi
        run_seed_command "$@"
      )
      ;;
    analytics-stock)
      (
        eval set -- $(build_common_args "analytics-stock")
        set -- "$@" --stock-health-dir "$STOCK_HEALTH_DIR"
        if [ -n "$STOCK_HEALTH_FILE" ]; then
          set -- "$@" --stock-health-file "$STOCK_HEALTH_FILE"
        fi
        if [ "$RESET_ANALYTICS_SEED" = "true" ]; then
          set -- "$@" --reset-analytics
        fi
        run_seed_command "$@"
      )
      ;;
    analytics-po)
      (
        eval set -- $(build_common_args "analytics-po")
        set -- "$@" --po-snapshots-dir "$PO_SNAPSHOTS_DIR"
        if [ -n "$PO_SNAPSHOTS_FILE" ]; then
          set -- "$@" --po-snapshots-file "$PO_SNAPSHOTS_FILE"
        fi
        if [ "$RESET_ANALYTICS_SEED" = "true" ]; then
          set -- "$@" --reset-analytics
        fi
        run_seed_command "$@"
      )
      ;;
    all)
      (
        eval set -- $(build_common_args "all")
        set -- "$@" --data-dir "$MASTER_DATA_DIR" --stock-health-dir "$STOCK_HEALTH_DIR" --po-snapshots-dir "$PO_SNAPSHOTS_DIR"
        if [ -n "$STOCK_HEALTH_FILE" ]; then
          set -- "$@" --stock-health-file "$STOCK_HEALTH_FILE"
        fi
        if [ -n "$PO_SNAPSHOTS_FILE" ]; then
          set -- "$@" --po-snapshots-file "$PO_SNAPSHOTS_FILE"
        fi
        if [ "$RESET_MASTER_SEED" = "true" ]; then
          set -- "$@" --reset-master
        fi
        if [ "$INCLUDE_MAPPINGS" = "true" ]; then
          set -- "$@" --include-mappings
        fi
        if [ "$RESET_ANALYTICS_SEED" = "true" ]; then
          set -- "$@" --reset-analytics
        fi
        run_seed_command "$@"
      )
      ;;
    *)
      echo "Unknown SEED_TARGET '$SEED_TARGET', skipping seed run."
      ;;
  esac
fi

echo "Starting application..."
# Start the application
exec "$@"
