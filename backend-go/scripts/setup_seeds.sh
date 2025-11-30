#!/bin/bash

# Create the seeds directory if it doesn't exist
mkdir -p /app/data/seeds

# Copy all CSV files from master_data to the seeds directory
cp /app/data/seeds/master_data/*.csv /app/data/seeds/

# Run the seeder against the configured database URL (defaults to local db container)
DB_URL=${DATABASE_URL:-postgres://postgres:postgres@db:5432/autopo?sslmode=disable}
/app/bin/seed --db-url "$DB_URL"
