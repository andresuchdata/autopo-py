#!/bin/sh
set -e

# Wait for PostgreSQL to be ready
until PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c '\q'; do
  >&2 echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done

# Run database migrations
echo "Running database migrations..."
for migration in /app/scripts/migrations/*.sql; do
  echo "Applying migration: $(basename $migration)"
  PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$migration"
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
