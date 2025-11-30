# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the server and seeder
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/seed ./cmd/seed

# Final stage
FROM alpine:3.18

WORKDIR /app

# Install dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    postgresql-client \
    bash \
    grep \
    coreutils

# Copy the binaries from builder
COPY --from=builder /app/bin/server /app/server
COPY --from=builder /app/bin/seed /app/bin/seed

# Copy configuration files and scripts
COPY entrypoint.sh /app/entrypoint.sh

# Create necessary directories and copy seed data
RUN mkdir -p /app/data/uploads /app/data/output /app/data/seeds && \
    chmod +x /app/entrypoint.sh

# Include static seed CSVs for container seeding
COPY data/seeds /app/data/seeds

# Copy scripts
COPY scripts /app/scripts

# Expose port
EXPOSE 8080

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]