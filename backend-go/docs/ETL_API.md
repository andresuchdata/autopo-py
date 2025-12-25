# ETL API Endpoints

This document describes the ETL (Extract, Transform, Load) API endpoints for managing cache invalidation and triggering data synchronization jobs.

## Base URL

All endpoints are prefixed with `/api/v1/etl`

## Endpoints

### 1. Invalidate Stock Health Cache

Invalidates all stock health related cache entries in Redis.

**Endpoint:** `POST /api/v1/etl/cache/invalidate/stock_health`

**Request:**
```bash
curl -X POST http://localhost:8080/api/v1/etl/cache/invalidate/stock_health
```

**Response (200 OK):**
```json
{
  "message": "stock health cache invalidated successfully"
}
```

**Response (500 Internal Server Error):**
```json
{
  "error": "failed to invalidate stock health cache",
  "details": "error message"
}
```

---

### 2. Invalidate PO Snapshot Cache

Invalidates all PO (Purchase Order) snapshot related cache entries in Redis.

**Endpoint:** `POST /api/v1/etl/cache/invalidate/po_snapshot`

**Request:**
```bash
curl -X POST http://localhost:8080/api/v1/etl/cache/invalidate/po_snapshot
```

**Response (200 OK):**
```json
{
  "message": "PO snapshot cache invalidated successfully"
}
```

**Response (500 Internal Server Error):**
```json
{
  "error": "failed to invalidate PO snapshot cache",
  "details": "error message"
}
```

---

### 3. Trigger Stock Data ETL Job

Triggers an asynchronous ETL job to fetch stock data from the legacy M2 (CI3) MySQL database.

**Endpoint:** `POST /api/v1/etl/jobs/stock_data`

**Request Body:**
```json
{
  "generate_date": "2024-01-15",  // MANDATORY: Date in YYYY-MM-DD format
  "store_name": "Padang",         // OPTIONAL: Filter by store name (partial match)
  "store_id": 7                   // OPTIONAL: Filter by specific store ID
}
```

**Request Examples:**

1. **Fetch all stores for a specific date:**
```bash
curl -X POST http://localhost:8080/api/v1/etl/jobs/stock_data \
  -H "Content-Type: application/json" \
  -d '{
    "generate_date": "2024-01-15"
  }'
```

2. **Fetch specific store by ID:**
```bash
curl -X POST http://localhost:8080/api/v1/etl/jobs/stock_data \
  -H "Content-Type: application/json" \
  -d '{
    "generate_date": "2024-01-15",
    "store_id": 7
  }'
```

3. **Fetch stores by name (partial match):**
```bash
curl -X POST http://localhost:8080/api/v1/etl/jobs/stock_data \
  -H "Content-Type: application/json" \
  -d '{
    "generate_date": "2024-01-15",
    "store_name": "Padang"
  }'
```

**Response (202 Accepted):**
```json
{
  "message": "stock data ETL job triggered successfully",
  "generate_date": "2024-01-15",
  "store_name": "Padang",
  "store_id": 7,
  "status": "processing"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "invalid request body",
  "details": "error message"
}
```

or

```json
{
  "error": "invalid generate_date format, expected YYYY-MM-DD",
  "details": "error message"
}
```

**Response (503 Service Unavailable):**
```json
{
  "error": "legacy database is not configured"
}
```

**Notes:**
- The job runs asynchronously in the background
- Check application logs for job progress and results
- If both `store_name` and `store_id` are provided, `store_id` takes precedence
- The job fetches data from the legacy CI3 database using the `exportSuggestion` query logic

---

### 4. Get ETL Status

Returns the status of ETL operations (placeholder for future implementation).

**Endpoint:** `GET /api/v1/etl/status`

**Request:**
```bash
curl http://localhost:8080/api/v1/etl/status
```

**Response (200 OK):**
```json
{
  "message": "ETL status endpoint - to be implemented",
  "status": "available"
}
```

---

## Environment Variables

To use the stock data ETL job, configure the following environment variables:

```bash
# Legacy CI3 MySQL Database Configuration
LEGACY_DB_HOST=your-mysql-host
LEGACY_DB_PORT=3306
LEGACY_DB_USER=your-mysql-user
LEGACY_DB_PASSWORD=your-mysql-password
LEGACY_DB_NAME=your-database-name
LEGACY_DB_TIMEZONE=Asia/Jakarta
```

## Common Use Cases

### 1. After Running Stock Health Pipeline

After running the stock health pipeline and ingesting new data, invalidate the cache:

```bash
# Invalidate stock health cache
curl -X POST http://localhost:8080/api/v1/etl/cache/invalidate/stock_health

# Invalidate PO snapshot cache (if PO data was also updated)
curl -X POST http://localhost:8080/api/v1/etl/cache/invalidate/po_snapshot
```

### 2. Nightly Data Sync

Trigger a nightly sync of stock data from the legacy database:

```bash
# Fetch all stores for today's date
TODAY=$(date +%Y-%m-%d)
curl -X POST http://localhost:8080/api/v1/etl/jobs/stock_data \
  -H "Content-Type: application/json" \
  -d "{\"generate_date\": \"$TODAY\"}"
```

### 3. Backfill Historical Data

Fetch historical data for a specific date:

```bash
curl -X POST http://localhost:8080/api/v1/etl/jobs/stock_data \
  -H "Content-Type: application/json" \
  -d '{
    "generate_date": "2024-12-01"
  }'
```

### 4. Test with Single Store

Test the ETL process with a single store before running for all stores:

```bash
curl -X POST http://localhost:8080/api/v1/etl/jobs/stock_data \
  -H "Content-Type: application/json" \
  -d '{
    "generate_date": "2024-01-15",
    "store_id": 7
  }'
```

## Error Handling

- **400 Bad Request**: Invalid request body or date format
- **500 Internal Server Error**: Redis connection issues or cache operation failures
- **503 Service Unavailable**: Legacy database not configured

## Monitoring

Check application logs for:
- ETL job start/completion messages
- Number of stores processed
- Success/failure counts
- Individual store fetch errors

Example log output:
```
INFO Starting stock data ETL job generate_date=2024-01-15 store_count=10
INFO Fetched stock data for store store_id=7 store_name=Padang row_count=1234
INFO Stock data ETL job completed success_count=9 fail_count=1 total_stores=10
```
