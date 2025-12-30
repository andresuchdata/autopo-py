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
	dashboardSummaryKeyPrefix          = "dashboard:summary"
	dashboardStatusSummaryRawPrefix    = "dashboard:status_summary_raw"
	dashboardStatusSummaryPrefix       = "dashboard:status_summary"
	dashboardTotalsPrefix              = "dashboard:totals"
	dashboardTrendKeyPrefix            = "dashboard:trend"
	dashboardAgingKeyPrefix            = "dashboard:aging"
	dashboardSupplierPerformancePrefix = "dashboard:supplier_performance"
	scanBatchSize                      = 100
	defaultDashboardTTL                = time.Minute
)

type DashboardCache interface {
	GetSummary(ctx context.Context, filter *domain.DashboardFilter) (*domain.DashboardSummary, bool, error)
	SetSummary(ctx context.Context, filter *domain.DashboardFilter, summary *domain.DashboardSummary) error
	GetStatusSummaryRaw(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, bool, error)
	SetStatusSummaryRaw(ctx context.Context, filter *domain.DashboardFilter, summary []domain.POStatusSummary) error
	GetTrend(ctx context.Context, interval string, filter *domain.DashboardFilter) ([]domain.POTrend, bool, error)
	SetTrend(ctx context.Context, interval string, filter *domain.DashboardFilter, trends []domain.POTrend) error
	GetAging(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POAging, bool, error)
	SetAging(ctx context.Context, filter *domain.DashboardFilter, items []domain.POAging) error
	GetSupplierPerformance(ctx context.Context, filter *domain.DashboardFilter) ([]domain.SupplierPerformance, bool, error)
	SetSupplierPerformance(ctx context.Context, filter *domain.DashboardFilter, items []domain.SupplierPerformance) error
	// Granular methods
	GetStatusSummary(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, bool, error)
	SetStatusSummary(ctx context.Context, filter *domain.DashboardFilter, summary []domain.POStatusSummary) error
	GetTotals(ctx context.Context, filter *domain.DashboardFilter) (*domain.PODashboardTotals, bool, error)
	SetTotals(ctx context.Context, filter *domain.DashboardFilter, totals *domain.PODashboardTotals) error
	InvalidateAll(ctx context.Context) error
}

type redisDashboardCache struct {
	client *redis.Client
	ttl    time.Duration
}

type noopDashboardCache struct{}

func NewDashboardCache(cfg config.CacheConfig) (DashboardCache, error) {
	if !cfg.Enabled {
		return &noopDashboardCache{}, nil
	}

	client, ttl, err := newRedisClient(cfg, cfg.DashboardTTLSeconds)
	if err != nil {
		return nil, err
	}

	return &redisDashboardCache{
		client: client,
		ttl:    ttl,
	}, nil
}

func NewNoopDashboardCache() DashboardCache {
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

func (c *redisDashboardCache) GetStatusSummaryRaw(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, bool, error) {
	key := buildStatusSummaryRawKey(filter)

	payload, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("redis get failed: %w", err)
	}

	var summary []domain.POStatusSummary
	if err := json.Unmarshal(payload, &summary); err != nil {
		return nil, false, fmt.Errorf("decode status summary raw cache: %w", err)
	}

	return summary, true, nil
}

func (c *redisDashboardCache) SetStatusSummaryRaw(ctx context.Context, filter *domain.DashboardFilter, summary []domain.POStatusSummary) error {
	key := buildStatusSummaryRawKey(filter)
	payload, err := json.Marshal(summary)
	if err != nil {
		return fmt.Errorf("encode status summary raw cache: %w", err)
	}

	if err := c.client.Set(ctx, key, payload, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}

	return nil
}

func (c *redisDashboardCache) GetTrend(ctx context.Context, interval string, filter *domain.DashboardFilter) ([]domain.POTrend, bool, error) {
	key := buildTrendKey(interval, filter)

	payload, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("redis get failed: %w", err)
	}

	var trends []domain.POTrend
	if err := json.Unmarshal(payload, &trends); err != nil {
		return nil, false, fmt.Errorf("decode trend cache: %w", err)
	}

	return trends, true, nil
}

func (c *redisDashboardCache) SetTrend(ctx context.Context, interval string, filter *domain.DashboardFilter, trends []domain.POTrend) error {
	key := buildTrendKey(interval, filter)
	payload, err := json.Marshal(trends)
	if err != nil {
		return fmt.Errorf("encode trend cache: %w", err)
	}
	if err := c.client.Set(ctx, key, payload, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}
	return nil
}

func (c *redisDashboardCache) GetAging(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POAging, bool, error) {
	key := buildAgingKey(filter)

	payload, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("redis get failed: %w", err)
	}

	var items []domain.POAging
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, false, fmt.Errorf("decode aging cache: %w", err)
	}

	return items, true, nil
}

func (c *redisDashboardCache) SetAging(ctx context.Context, filter *domain.DashboardFilter, items []domain.POAging) error {
	key := buildAgingKey(filter)
	payload, err := json.Marshal(items)
	if err != nil {
		return fmt.Errorf("encode aging cache: %w", err)
	}
	if err := c.client.Set(ctx, key, payload, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}
	return nil
}

func (c *redisDashboardCache) GetSupplierPerformance(ctx context.Context, filter *domain.DashboardFilter) ([]domain.SupplierPerformance, bool, error) {
	key := buildSupplierPerformanceKey(filter)

	payload, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("redis get failed: %w", err)
	}

	var items []domain.SupplierPerformance
	if err := json.Unmarshal(payload, &items); err != nil {
		return nil, false, fmt.Errorf("decode supplier performance cache: %w", err)
	}

	return items, true, nil
}

func (c *redisDashboardCache) SetSupplierPerformance(ctx context.Context, filter *domain.DashboardFilter, items []domain.SupplierPerformance) error {
	key := buildSupplierPerformanceKey(filter)
	payload, err := json.Marshal(items)
	if err != nil {
		return fmt.Errorf("encode supplier performance cache: %w", err)
	}
	if err := c.client.Set(ctx, key, payload, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}
	return nil
}

func (c *redisDashboardCache) GetStatusSummary(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, bool, error) {
	key := buildStatusSummaryKey(filter)
	payload, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("redis get failed: %w", err)
	}
	var summary []domain.POStatusSummary
	if err := json.Unmarshal(payload, &summary); err != nil {
		return nil, false, fmt.Errorf("decode status summary cache: %w", err)
	}
	return summary, true, nil
}

func (c *redisDashboardCache) SetStatusSummary(ctx context.Context, filter *domain.DashboardFilter, summary []domain.POStatusSummary) error {
	key := buildStatusSummaryKey(filter)
	payload, err := json.Marshal(summary)
	if err != nil {
		return fmt.Errorf("encode status summary cache: %w", err)
	}
	if err := c.client.Set(ctx, key, payload, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}
	return nil
}

func (c *redisDashboardCache) GetTotals(ctx context.Context, filter *domain.DashboardFilter) (*domain.PODashboardTotals, bool, error) {
	key := buildTotalsKey(filter)
	payload, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("redis get failed: %w", err)
	}
	var totals domain.PODashboardTotals
	if err := json.Unmarshal(payload, &totals); err != nil {
		return nil, false, fmt.Errorf("decode totals cache: %w", err)
	}
	return &totals, true, nil
}

func (c *redisDashboardCache) SetTotals(ctx context.Context, filter *domain.DashboardFilter, totals *domain.PODashboardTotals) error {
	key := buildTotalsKey(filter)
	payload, err := json.Marshal(totals)
	if err != nil {
		return fmt.Errorf("encode totals cache: %w", err)
	}
	if err := c.client.Set(ctx, key, payload, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set failed: %w", err)
	}
	return nil
}

func (c *redisDashboardCache) InvalidateAll(ctx context.Context) error {
	prefixes := []string{
		dashboardSummaryKeyPrefix,
		dashboardStatusSummaryRawPrefix,
		dashboardStatusSummaryPrefix,
		dashboardTotalsPrefix,
		dashboardTrendKeyPrefix,
		dashboardAgingKeyPrefix,
		dashboardSupplierPerformancePrefix,
	}

	for _, prefix := range prefixes {
		if err := c.deleteKeysWithPrefix(ctx, prefix); err != nil {
			return err
		}
	}

	return nil
}

func (c *redisDashboardCache) deleteKeysWithPrefix(ctx context.Context, prefix string) error {
	var cursor uint64
	pattern := prefix + "*"
	for {
		keys, nextCursor, err := c.client.Scan(ctx, cursor, pattern, scanBatchSize).Result()
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

func (n *noopDashboardCache) GetStatusSummaryRaw(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, bool, error) {
	return nil, false, nil
}

func (n *noopDashboardCache) SetStatusSummaryRaw(ctx context.Context, filter *domain.DashboardFilter, summary []domain.POStatusSummary) error {
	return nil
}

func (n *noopDashboardCache) GetTrend(ctx context.Context, interval string, filter *domain.DashboardFilter) ([]domain.POTrend, bool, error) {
	return nil, false, nil
}

func (n *noopDashboardCache) SetTrend(ctx context.Context, interval string, filter *domain.DashboardFilter, trends []domain.POTrend) error {
	return nil
}

func (n *noopDashboardCache) GetAging(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POAging, bool, error) {
	return nil, false, nil
}

func (n *noopDashboardCache) SetAging(ctx context.Context, filter *domain.DashboardFilter, items []domain.POAging) error {
	return nil
}

func (n *noopDashboardCache) GetSupplierPerformance(ctx context.Context, filter *domain.DashboardFilter) ([]domain.SupplierPerformance, bool, error) {
	return nil, false, nil
}

func (n *noopDashboardCache) SetSupplierPerformance(ctx context.Context, filter *domain.DashboardFilter, items []domain.SupplierPerformance) error {
	return nil
}

func (n *noopDashboardCache) InvalidateAll(ctx context.Context) error {
	return nil
}

func (n *noopDashboardCache) GetStatusSummary(ctx context.Context, filter *domain.DashboardFilter) ([]domain.POStatusSummary, bool, error) {
	return nil, false, nil
}

func (n *noopDashboardCache) SetStatusSummary(ctx context.Context, filter *domain.DashboardFilter, summary []domain.POStatusSummary) error {
	return nil
}

func (n *noopDashboardCache) GetTotals(ctx context.Context, filter *domain.DashboardFilter) (*domain.PODashboardTotals, bool, error) {
	return nil, false, nil
}

func (n *noopDashboardCache) SetTotals(ctx context.Context, filter *domain.DashboardFilter, totals *domain.PODashboardTotals) error {
	return nil
}

func buildDashboardSummaryKey(filter *domain.DashboardFilter) string {
	return fmt.Sprintf("%s:%s", dashboardSummaryKeyPrefix, buildFilterHash(filter))
}

func buildStatusSummaryRawKey(filter *domain.DashboardFilter) string {
	return fmt.Sprintf("%s:%s", dashboardStatusSummaryRawPrefix, buildFilterHash(filter))
}

func buildStatusSummaryKey(filter *domain.DashboardFilter) string {
	return fmt.Sprintf("%s:%s", dashboardStatusSummaryPrefix, buildFilterHash(filter))
}

func buildTotalsKey(filter *domain.DashboardFilter) string {
	return fmt.Sprintf("%s:%s", dashboardTotalsPrefix, buildFilterHash(filter))
}

func buildTrendKey(interval string, filter *domain.DashboardFilter) string {
	return fmt.Sprintf("%s:%s:%s", dashboardTrendKeyPrefix, sanitizeInterval(interval), buildFilterHash(filter))
}

func buildAgingKey(filter *domain.DashboardFilter) string {
	return fmt.Sprintf("%s:%s", dashboardAgingKeyPrefix, buildFilterHash(filter))
}

func buildSupplierPerformanceKey(filter *domain.DashboardFilter) string {
	return fmt.Sprintf("%s:%s", dashboardSupplierPerformancePrefix, buildFilterHash(filter))
}

func buildFilterHash(filter *domain.DashboardFilter) string {
	if filter == nil {
		return "default"
	}

	var parts []string
	if filter.POType != "" {
		parts = append(parts, "po_type="+strings.ToUpper(strings.TrimSpace(filter.POType)))
	}
	if filter.ReleasedDate != "" {
		parts = append(parts, "released_date="+strings.TrimSpace(filter.ReleasedDate))
	}
	if len(filter.StoreIDs) > 0 {
		parts = append(parts, "store_ids="+joinInt64s(filter.StoreIDs))
	}
	if len(filter.BrandIDs) > 0 {
		parts = append(parts, "brand_ids="+joinInt64s(filter.BrandIDs))
	}
	if len(filter.SupplierIDs) > 0 {
		parts = append(parts, "supplier_ids="+joinInt64s(filter.SupplierIDs))
	}

	if len(parts) == 0 {
		return "default"
	}

	sort.Strings(parts)
	raw := strings.Join(parts, "|")
	hash := sha1.Sum([]byte(raw))
	return hex.EncodeToString(hash[:])
}

func sanitizeInterval(interval string) string {
	val := strings.ToLower(strings.TrimSpace(interval))
	switch val {
	case "day", "week", "month":
		return val
	default:
		return "day"
	}
}
