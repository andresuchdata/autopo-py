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
  echo "Running seed data import..."
  cd /app/scripts
  chmod +x seed_import.sh
  ./seed_import.sh
fi

# Start the application
exec "$@"
