package cache

import (
	"context"
	"fmt"
	"net"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/redis/go-redis/v9"
)

const defaultCacheTTL = time.Minute

func newRedisClient(cfg config.CacheConfig) (*redis.Client, time.Duration, error) {
	opts, err := buildRedisOptions(cfg)
	if err != nil {
		return nil, 0, err
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, 0, fmt.Errorf("redis ping failed: %w", err)
	}

	ttl := time.Duration(cfg.DashboardTTLSeconds) * time.Second
	if ttl <= 0 {
		ttl = defaultCacheTTL
	}

	return client, ttl, nil
}

func buildRedisOptions(cfg config.CacheConfig) (*redis.Options, error) {
	if cfg.RedisURL != "" {
		opt, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			return nil, fmt.Errorf("invalid redis url: %w", err)
		}
		return opt, nil
	}

	host := cfg.RedisHost
	if host == "" {
		host = "127.0.0.1"
	}

	port := cfg.RedisPort
	if port == "" {
		port = "6379"
	}

	return &redis.Options{
		Addr:     net.JoinHostPort(host, port),
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	}, nil
}

func deleteKeysWithPrefix(ctx context.Context, client *redis.Client, prefix string, batchSize int64) error {
	var cursor uint64
	pattern := prefix + "*"
	for {
		keys, nextCursor, err := client.Scan(ctx, cursor, pattern, batchSize).Result()
		if err != nil {
			return fmt.Errorf("redis scan failed: %w", err)
		}

		if len(keys) > 0 {
			if err := client.Del(ctx, keys...).Err(); err != nil {
				return fmt.Errorf("redis delete failed: %w", err)
			}
		}

		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}
	return nil
}
