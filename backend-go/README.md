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