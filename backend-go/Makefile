.PHONY: build run test lint clean deps db-up db-down migrate-up migrate-down

# Build the application
build:
	go build -o bin/server ./cmd/server

# Run the application
run: build
	./bin/server

# Run tests
test:
	go test -v ./...

# Lint the code
lint:
	golangci-lint run

# Clean build files
clean:
	rm -rf bin/

# Install dependencies
deps:
	go mod download
	go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Database commands
db-up:
	docker-compose up -d db

db-down:
	docker-compose down

# Migration commands
migrate-up:
	migrate -path ./scripts/migrations -database "postgres://postgres:postgres@localhost:5432/autopo?sslmode=disable" up

migrate-down:
	migrate -path ./scripts/migrations -database "postgres://postgres:postgres@localhost:5432/autopo?sslmode=disable" down

# Combined commands
start: db-up migrate-up run

stop: 
	lsof -ti:8082 | xargs kill -9 2>/dev/null || true

# Bring up the app service with cloud storage env vars loaded from .env
app-up:
	@bash -c 'set -a && source .env && set +a && docker-compose up -d app'

app-build:
	@bash -c 'set -a && source .env && set +a && docker compose up -d --build app'

# =============================================================================
# Pipeline Seed Commands
# =============================================================================

# Stock Health Pipeline
# Run using local files in data/test_ingestion (no Drive download, no Legacy DB)
seed-stock-health-local:
	@echo "Running Stock Health Pipeline (LOCAL MODE)"
	@bash -c 'set -a && source .env && set +a && \
		LEGACY_DB_HOST="" \
		STOCK_HEALTH_REUSE_LOCAL=true \
		STOCK_HEALTH_DOWNLOAD_DIR="./data/test_ingestion" \
		go run cmd/seed/*.go pipeline-stock-health --reuse-local'

# Run using Google Drive download (as configured in .env)
seed-stock-health-drive:
	@echo "Running Stock Health Pipeline (DRIVE MODE)"
	@bash -c 'set -a && source .env && set +a && \
		LEGACY_DB_HOST="" \
		go run cmd/seed/*.go pipeline-stock-health'

# PO Snapshot Pipeline
# Run using local files in data/test_ingestion/po_snapshots (example path)
seed-po-snapshot-local:
	@echo "Running PO Snapshot Pipeline (LOCAL MODE)"
	@bash -c 'set -a && source .env && set +a && \
		LEGACY_DB_HOST="" \
		PO_SNAPSHOT_REUSE_LOCAL=true \
		PO_SNAPSHOT_DOWNLOAD_DIR="./data/test_ingestion/po_snapshots" \
		go run cmd/seed/*.go pipeline-po-snapshots --reuse-local'

# Run using Google Drive download (as configured in .env)
seed-po-snapshot-drive:
	@echo "Running PO Snapshot Pipeline (DRIVE MODE)"
	@bash -c 'set -a && source .env && set +a && \
		LEGACY_DB_HOST="" \
		go run cmd/seed/*.go pipeline-po-snapshots'