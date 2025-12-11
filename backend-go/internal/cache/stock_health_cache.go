package cache

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/redis/go-redis/v9"
)

const (
	stockHealthSummaryKeyPrefix = "stock_health:summary"
	stockHealthScanBatchSize    = 100
)

type StockHealthCache interface {
	GetSummary(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealthSummary, bool, error)
	SetSummary(ctx context.Context, filter domain.StockHealthFilter, summaries []domain.StockHealthSummary) error
	InvalidateSummary(ctx context.Context, filter domain.StockHealthFilter) error
	InvalidateAll(ctx context.Context) error
}

type redisStockHealthCache struct {
	client *redis.Client
	ttl    time.Duration
}

type noopStockHealthCache struct{}

func NewStockHealthCache(cfg config.CacheConfig) (StockHealthCache, error) {
	if !cfg.Enabled {
		return &noopStockHealthCache{}, nil
	}

	client, ttl, err := newRedisClient(cfg)
	if err != nil {
		return nil, err
	}

	return &redisStockHealthCache{
		client: client,
		ttl:    ttl,
	}, nil
}

func NewNoopStockHealthCache() StockHealthCache {
	return &noopStockHealthCache{}
}

func (c *redisStockHealthCache) GetSummary(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealthSummary, bool, error) {
	key := buildStockHealthSummaryKey(filter)

	payload, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("redis get failed: %w", err)
	}

	var summaries []domain.StockHealthSummary
	if err := json.Unmarshal(payload, &summaries); err != nil {
		return nil, false, fmt.Errorf("decode stock health summary cache: %w", err)
	}

	return summaries, true, nil
}

func (c *redisStockHealthCache) SetSummary(ctx context.Context, filter domain.StockHealthFilter, summaries []domain.StockHealthSummary) error {
	key := buildStockHealthSummaryKey(filter)
	payload, err := json.Marshal(summaries)
	if err != nil {
		return fmt.Errorf("encode stock health summary cache: %w", err)
	}

	if err := c.client.Set(ctx, key, payload, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}
	return nil
}

func (c *redisStockHealthCache) InvalidateSummary(ctx context.Context, filter domain.StockHealthFilter) error {
	key := buildStockHealthSummaryKey(filter)
	return c.client.Del(ctx, key).Err()
}

func (c *redisStockHealthCache) InvalidateAll(ctx context.Context) error {
	return deleteKeysWithPrefix(ctx, c.client, stockHealthSummaryKeyPrefix, stockHealthScanBatchSize)
}

func (n *noopStockHealthCache) GetSummary(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealthSummary, bool, error) {
	return nil, false, nil
}

func (n *noopStockHealthCache) SetSummary(ctx context.Context, filter domain.StockHealthFilter, summaries []domain.StockHealthSummary) error {
	return nil
}

func (n *noopStockHealthCache) InvalidateSummary(ctx context.Context, filter domain.StockHealthFilter) error {
	return nil
}

func (n *noopStockHealthCache) InvalidateAll(ctx context.Context) error {
	return nil
}

func buildStockHealthSummaryKey(filter domain.StockHealthFilter) string {
	return fmt.Sprintf("%s:%s", stockHealthSummaryKeyPrefix, stockHealthFilterHash(filter))
}

func stockHealthFilterHash(filter domain.StockHealthFilter) string {
	parts := []string{}

	if filter.StockDate != "" {
		parts = append(parts, "stock_date="+strings.TrimSpace(filter.StockDate))
	}
	if filter.Condition != "" {
		parts = append(parts, "condition="+strings.ToLower(strings.TrimSpace(filter.Condition)))
	}
	if filter.Grouping != "" {
		parts = append(parts, "grouping="+strings.ToLower(strings.TrimSpace(filter.Grouping)))
	}
	if filter.OverstockGroup != "" {
		parts = append(parts, "overstock_group="+strings.ToLower(strings.TrimSpace(filter.OverstockGroup)))
	}

	if len(filter.StoreIDs) > 0 {
		parts = append(parts, "store_ids="+joinInt64s(filter.StoreIDs))
	}
	if len(filter.BrandIDs) > 0 {
		parts = append(parts, "brand_ids="+joinInt64s(filter.BrandIDs))
	}
	if len(filter.SKUIds) > 0 {
		parts = append(parts, "sku_ids="+joinStrings(filter.SKUIds))
	}

	// Include kategori_brand values so different kategori filters don't share the same cache entry
	if len(filter.KategoriBrand) > 0 {
		// Normalize: trim and uppercase values, then sort for stable hashing
		normalized := make([]string, 0, len(filter.KategoriBrand))
		for _, v := range filter.KategoriBrand {
			v = strings.TrimSpace(v)
			if v == "" {
				continue
			}

			normalized = append(normalized, strings.ToUpper(v))
		}
		if len(normalized) > 0 {
			sort.Strings(normalized)
			parts = append(parts, "kategori_brand="+strings.Join(normalized, ","))
		}
	}

	if filter.DailyCoverMin != nil {
		parts = append(parts, fmt.Sprintf("daily_cover_min=%.2f", *filter.DailyCoverMin))
	}
	if filter.DailyCoverMax != nil {
		parts = append(parts, fmt.Sprintf("daily_cover_max=%.2f", *filter.DailyCoverMax))
	}

	if len(parts) == 0 {
		return "default"
	}

	sort.Strings(parts)
	raw := strings.Join(parts, "|")
	sum := sha1.Sum([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func joinInt64s(values []int64) string {
	c := append([]int64(nil), values...)
	sort.Slice(c, func(i, j int) bool { return c[i] < c[j] })
	strs := make([]string, len(c))
	for i, v := range c {
		strs[i] = fmt.Sprintf("%d", v)
	}
	return strings.Join(strs, ",")
}

func joinStrings(values []string) string {
	c := append([]string(nil), values...)
	for i := range c {
		c[i] = strings.TrimSpace(strings.ToLower(c[i]))
	}
	sort.Strings(c)
	return strings.Join(c, ",")
}
