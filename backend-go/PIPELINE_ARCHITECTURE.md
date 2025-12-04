# Automated Data Pipeline Architecture

## Overview

This document describes the scalable, multi-pipeline architecture for automated data processing. The system replaces manual XLSX file processing with an automated Go-based pipeline that supports multiple data types (stock health, PO snapshots, future pipelines).

## Architecture Diagrams

### High-Level Flow
```
Google Drive → Watcher → Orchestrator → Pipeline Workers → Streaming Aggregator → Database
                                              ↓
                                       Intermediate CSVs
```

### Components

1. **Data Sources**: Google Drive folders with daily uploads
2. **Ingestion Layer**: Drive Watcher service (polls & downloads)
3. **Orchestration Layer**: Routes files to appropriate pipelines
4. **Pipeline Workers**: Independent execution per pipeline type
5. **Streaming Aggregator**: Buffers and batches data before seeding
6. **Database Layer**: PostgreSQL with tracking tables
7. **Monitoring**: Admin dashboard and notifications

## Key Design Decisions

### 1. Streaming Aggregator Pattern (Hybrid Approach)

**Why**: Balances incremental processing with atomic daily snapshots

**Benefits**:
- ✅ Process stores as they arrive (no waiting for all 30+)
- ✅ Maintains single daily snapshot per pipeline
- ✅ Reuses existing `analytics.ProcessFile` logic (no refactor)
- ✅ Atomic database inserts per date
- ✅ Simple queries (no complex joins needed)

**Implementation**:
- Buffer size: 5 files or 10MB
- Flush interval: 5 minutes
- Output: `data/seeds/{pipeline}/{YYYYMMDD}.csv`

### 2. Pipeline Independence

Each pipeline (stock health, PO, future) runs independently:
- Separate worker pools
- Separate queues
- Separate failure handling
- No cross-pipeline blocking

**Scalability**: Adding new pipelines is copy-paste + customize transform logic

### 3. Database Tracking

Two tables for comprehensive monitoring:
- `pipeline_runs`: Tracks each pipeline execution per date
- `pipeline_file_jobs`: Tracks individual file processing

**Benefits**:
- Retry failed files without reprocessing successful ones
- Dashboard visibility into progress
- Audit trail for debugging

## Implementation Status

### ✅ Completed

1. **Core Infrastructure**
   - `internal/pipeline/types.go`: Base interfaces and types
   - `internal/pipeline/streaming_aggregator.go`: Buffering and batching logic
   - `internal/pipeline/repository.go`: Database operations
   - `internal/pipeline/worker.go`: File processing with retry logic
   - `migrations/004_create_pipeline_tracking.sql`: Database schema

2. **Stock Health Pipeline (Partial)**
   - `internal/pipeline/stock_health/types.go`: Data structures
   - `internal/pipeline/stock_health/calculator.go`: Inventory metrics calculation (ports main.ipynb logic)

### 🚧 In Progress

3. **Stock Health Pipeline (Remaining)**
   - XLSX reader
   - Supplier data merger
   - CSV output generators (complete, m2, emergency formats)
   - Pipeline implementation (implements `Pipeline` interface)

### 📋 Pending

4. **Orchestrator**
   - File router (matches files to pipelines)
   - Worker pool manager
   - CLI commands

5. **PO Snapshot Pipeline**
   - Transform logic
   - Pipeline implementation

6. **Google Drive Integration**
   - Drive API client
   - File watcher daemon
   - Download manager

7. **Monitoring & Notifications**
   - Webhook integration
   - Admin API endpoints
   - Dashboard UI (React)

## File Structure

```
autopo/backend-go/
├── cmd/
│   ├── pipeline/           # Main orchestrator (TODO)
│   └── watcher/            # Drive watcher daemon (TODO)
├── internal/
│   ├── analytics/          # Existing seed logic (reused)
│   └── pipeline/
│       ├── types.go        # ✅ Core interfaces
│       ├── streaming_aggregator.go  # ✅ Buffering logic
│       ├── repository.go   # ✅ Database operations
│       ├── worker.go       # ✅ File processor
│       ├── orchestrator.go # TODO: File routing
│       ├── stock_health/
│       │   ├── types.go    # ✅ Data structures
│       │   ├── calculator.go  # ✅ Metrics calculation
│       │   ├── reader.go   # TODO: XLSX parser
│       │   ├── merger.go   # TODO: Supplier merger
│       │   ├── writer.go   # TODO: CSV outputs
│       │   └── pipeline.go # TODO: Pipeline impl
│       ├── po_snapshots/   # TODO: PO pipeline
│       └── gdrive/         # TODO: Drive integration
├── migrations/
│   └── 004_create_pipeline_tracking.sql  # ✅ Schema
└── PIPELINE_ARCHITECTURE.md  # This file
```

## Usage (When Complete)

### Manual Trigger (Development)
```bash
# Process stock health files for today
go run cmd/pipeline/main.go process \
  --pipeline=stock_health \
  --date=2024-12-04 \
  --input-dir=/path/to/xlsx/files

# Retry failed jobs
go run cmd/pipeline/main.go retry \
  --pipeline=stock_health
```

### Automated (Production)
```bash
# Start drive watcher daemon
go run cmd/watcher/main.go \
  --drive-folder-id=XXXXX \
  --poll-interval=5m
```

## Database Schema

### pipeline_runs
Tracks each pipeline execution:
- `pipeline_name`: stock_health, po_snapshots, etc.
- `date`: Business date being processed
- `status`: pending, processing, completed, failed
- `total_files`, `processed_files`, `total_rows`
- `started_at`, `completed_at`

### pipeline_file_jobs
Tracks individual files:
- `pipeline_run_id`: Foreign key to pipeline_runs
- `file_path`: Input file path
- `store_id`: Associated store (nullable)
- `status`: queued, processing, completed, failed
- `retry_count`: Number of retry attempts

## Configuration

### Pipeline Config (per pipeline)
```go
PipelineConfig{
    Name:            "stock_health",
    BatchSize:       5,              // Files before flush
    BatchSizeBytes:  10 * 1024 * 1024,  // 10MB
    FlushInterval:   5 * time.Minute,
    WorkerCount:     4,              // Concurrent workers
    OutputDir:       "data/seeds/stock_health",
    IntermediateDir: "data/intermediate/stock_health",
    RetryAttempts:   3,
    RetryBackoff:    30 * time.Second,
}
```

## Monitoring

### Metrics Tracked
- Files processed per pipeline
- Rows processed
- Error count
- Average latency
- Last processed timestamp

### Dashboard Views
1. **Today's Runs**: All pipelines for current date
2. **Pipeline History**: Historical runs with filters
3. **Failed Jobs**: Retry interface
4. **File Tracking**: Per-store/file status

## Next Steps

1. Complete stock health pipeline (XLSX reader, merger, writer)
2. Implement orchestrator with file routing
3. Build PO pipeline as second implementation
4. Add Google Drive integration
5. Create admin API and dashboard
6. Deploy and test with real data

## References

- Original notebooks: `autopo/notebook/main.ipynb`, `health_monitor.ipynb`
- Existing seed logic: `autopo/backend-go/internal/analytics/processor.go`
- Architecture discussion: See previous conversation for detailed diagrams
