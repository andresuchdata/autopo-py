package cache

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/redis/go-redis/v9"
)

const (
	dashboardSummaryKeyPrefix = "dashboard:summary"
	scanBatchSize             = 100
	defaultDashboardTTL       = time.Minute
)

type DashboardSummaryCache interface {
	GetSummary(ctx context.Context, filter *domain.DashboardFilter) (*domain.DashboardSummary, bool, error)
	SetSummary(ctx context.Context, filter *domain.DashboardFilter, summary *domain.DashboardSummary) error
	InvalidateAll(ctx context.Context) error
}

type redisDashboardCache struct {
	client *redis.Client
	ttl    time.Duration
}

type noopDashboardCache struct{}

func NewDashboardCache(cfg config.CacheConfig) (DashboardSummaryCache, error) {
	if !cfg.Enabled {
		return &noopDashboardCache{}, nil
	}

	opts, err := buildRedisOptions(cfg)
	if err != nil {
		return nil, err
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	ttl := time.Duration(cfg.DashboardTTLSeconds) * time.Second
	if ttl <= 0 {
		ttl = defaultDashboardTTL
	}

	return &redisDashboardCache{
		client: client,
		ttl:    ttl,
	}, nil
}

func NewNoopDashboardCache() DashboardSummaryCache {
	return &noopDashboardCache{}
}

func (c *redisDashboardCache) GetSummary(ctx context.Context, filter *domain.DashboardFilter) (*domain.DashboardSummary, bool, error) {
	key := buildDashboardSummaryKey(filter)

	payload, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("redis get failed: %w", err)
	}

	var summary domain.DashboardSummary
	if err := json.Unmarshal(payload, &summary); err != nil {
		return nil, false, fmt.Errorf("decode dashboard summary cache: %w", err)
	}

	return &summary, true, nil
}

func (c *redisDashboardCache) SetSummary(ctx context.Context, filter *domain.DashboardFilter, summary *domain.DashboardSummary) error {
	key := buildDashboardSummaryKey(filter)
	payload, err := json.Marshal(summary)
	if err != nil {
		return fmt.Errorf("encode dashboard summary cache: %w", err)
	}

	if err := c.client.Set(ctx, key, payload, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}

	return nil
}

func (c *redisDashboardCache) InvalidateAll(ctx context.Context) error {
	var cursor uint64
	for {
		keys, nextCursor, err := c.client.Scan(ctx, cursor, dashboardSummaryKeyPrefix+"*", scanBatchSize).Result()
		if err != nil {
			return fmt.Errorf("redis scan failed: %w", err)
		}

		if len(keys) > 0 {
			if err := c.client.Del(ctx, keys...).Err(); err != nil {
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

func (n *noopDashboardCache) GetSummary(ctx context.Context, filter *domain.DashboardFilter) (*domain.DashboardSummary, bool, error) {
	return nil, false, nil
}

func (n *noopDashboardCache) SetSummary(ctx context.Context, filter *domain.DashboardFilter, summary *domain.DashboardSummary) error {
	return nil
}

func (n *noopDashboardCache) InvalidateAll(ctx context.Context) error {
	return nil
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

func buildDashboardSummaryKey(filter *domain.DashboardFilter) string {
	if filter == nil {
		return dashboardSummaryKeyPrefix + ":default"
	}

	var parts []string
	if filter.POType != "" {
		parts = append(parts, "po_type="+strings.ToUpper(filter.POType))
	}
	if filter.ReleasedDate != "" {
		parts = append(parts, "released_date="+filter.ReleasedDate)
	}

	if len(parts) == 0 {
		return dashboardSummaryKeyPrefix + ":default"
	}

	raw := strings.Join(parts, "|")
	hash := sha1.Sum([]byte(raw))
	return fmt.Sprintf("%s:%s", dashboardSummaryKeyPrefix, hex.EncodeToString(hash[:]))
}
