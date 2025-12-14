# AutoPo Backend

This is the Go backend for the AutoPo application.

## Prerequisites

- Go 1.24 or later
- PostgreSQL 13 or later
- Google Cloud Project with Google Drive API enabled
- Service account credentials with Google Drive API access
- Make (optional)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   make deps
   ```

## Google Drive Integration

### Configuration

1. Copy the example environment file and update with your credentials:
   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your Google Cloud service account credentials.

### API Endpoints

#### List Files
```
GET /api/drive/files?folderId=<folderId>
GET /api/drive/files?path=<folderPath>
```

#### Download File
```
GET /api/drive/files/download?fileId=<fileId>
```

### Environment Variables

- `SERVER_PORT`: Port to run the server on (default: 8080)
- `GOOGLE_DRIVE_CREDENTIALS_JSON`: JSON string containing Google service account credentials

## Running the Service

```bash
go run cmd/api/main.go
```

The service will be available at `http://localhost:8080`.

## Deployment

The service can be built and run in a container:

```bash
docker build -t autopo-backend-go .
docker run -p 8080:8080 --env-file .env autopo-backend-go
```

## Analytics Seeding with Sevalla Storage

Large stock health and PO snapshot CSV files can be pulled directly from Sevalla (an S3-compatible storage service) when running the analytics seeder.

### CLI Flags / Environment Variables

| Flag / Env | Description |
|------------|-------------|
| `--use-sevalla` / `USE_SEVALLA` | Enable Sevalla downloads instead of local files. |
| `--sevalla-endpoint` / `SEVALLA_ENDPOINT` | Sevalla endpoint (e.g. `https://storage.example.com`). |
| `--sevalla-bucket` / `SEVALLA_BUCKET` | Bucket containing analytics exports. |
| `--sevalla-access-key` / `SEVALLA_ACCESS_KEY` | Access key ID. |
| `--sevalla-secret-key` / `SEVALLA_SECRET_KEY` | Secret access key. |
| `--sevalla-region` / `SEVALLA_REGION` | Region (defaults to `us-east-1` if not provided). |
| `--sevalla-use-ssl` / `SEVALLA_USE_SSL` | Whether to use HTTPS (on by default). |
| `--sevalla-download-dir` / `SEVALLA_DOWNLOAD_DIR` | Local temp directory for downloaded CSVs (default `./data/tmp/sevalla`). |
| `--sevalla-stock-prefix` / `SEVALLA_STOCK_PREFIX` | Object prefix for stock health files (e.g. `analytics/stock_health`). |
| `--sevalla-po-prefix` / `SEVALLA_PO_PREFIX` | Object prefix for PO snapshot files. |
| `--stock-health-file` / `STOCK_HEALTH_FILE` | Optional override (`YYYYMMDD.csv`) to fetch a specific stock health file. |
| `--po-snapshots-file` / `PO_SNAPSHOTS_FILE` | Optional override for a specific PO snapshot file. |

### Example

```bash
go run cmd/seed/main.go analytics \
  --db-url "$DATABASE_URL" \
  --use-sevalla \
  --sevalla-endpoint https://storage.example.com \
  --sevalla-bucket analytics-data \
  --sevalla-access-key "$SEVALLA_ACCESS_KEY" \
  --sevalla-secret-key "$SEVALLA_SECRET_KEY" \
  --sevalla-stock-prefix stock_health \
  --sevalla-po-prefix po_snapshots \
  --stock-health-file 20251201.csv
```

When `--use-sevalla` is specified, the seeder downloads CSVs to the temporary download directory and feeds them into the existing analytics pipeline automatically.