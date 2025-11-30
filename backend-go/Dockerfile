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

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/bin/server ./cmd/server

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

# Copy the binary from builder
COPY --from=builder /app/bin/server /app/server

# Copy configuration files and scripts
COPY .env.example /app/.env
COPY entrypoint.sh /app/entrypoint.sh

# Create necessary directories
RUN mkdir -p /app/data/uploads /app/data/output /app/data/seeds && \
    chmod +x /app/entrypoint.sh

# Copy scripts
COPY scripts /app/scripts

# Expose port
EXPOSE 8080

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command
CMD ["/app/server"]