#!/bin/bash

# Create the seeds directory if it doesn't exist
mkdir -p /app/data/seeds

# Copy all CSV files from master_data to the seeds directory
cp /app/data/seeds/master_data/*.csv /app/data/seeds/

# Run the seeder
/app/bin/seed --db-url "postgres://postgres:postgres@db:5432/autopo?sslmode=disable"
