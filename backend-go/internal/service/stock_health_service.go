package service

import (
	"context"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/cache"
	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
	"github.com/rs/zerolog/log"
)

type StockHealthService struct {
	repo  repository.StockHealthRepository
	cache cache.StockHealthCache
}

func NewStockHealthService(repo repository.StockHealthRepository, cacheImpl cache.StockHealthCache) *StockHealthService {
	if cacheImpl == nil {
		cacheImpl = cache.NewNoopStockHealthCache()
	}
	return &StockHealthService{repo: repo, cache: cacheImpl}
}

func (s *StockHealthService) GetSummary(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealthSummary, error) {
	if summaries, ok, err := s.cache.GetSummary(ctx, filter); err == nil && ok {
		return summaries, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("stock health: cache get summary failed")
	}

	summaries, err := s.repo.GetStockHealthSummary(ctx, filter)
	if err != nil {
		return nil, err
	}

	if err := s.cache.SetSummary(ctx, filter, summaries); err != nil {
		log.Warn().Err(err).Msg("stock health: cache set summary failed")
	}

	return summaries, nil
}

func (s *StockHealthService) GetItems(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealth, int, error) {
	return s.repo.GetStockItems(ctx, filter)
}

func (s *StockHealthService) GetTimeSeries(ctx context.Context, days int, filter domain.StockHealthFilter) (map[string][]domain.TimeSeriesData, error) {
	if days <= 0 {
		days = 30
	}
	return s.repo.GetTimeSeriesData(ctx, days, filter)
}

func (s *StockHealthService) GetBrandBreakdown(ctx context.Context, filter domain.StockHealthFilter) ([]domain.ConditionBreakdown, error) {
	return s.repo.GetBrandBreakdown(ctx, filter)
}

func (s *StockHealthService) GetStoreBreakdown(ctx context.Context, filter domain.StockHealthFilter) ([]domain.ConditionBreakdown, error) {
	return s.repo.GetStoreBreakdown(ctx, filter)
}

func (s *StockHealthService) GetDashboard(ctx context.Context, days int, filter domain.StockHealthFilter) (*domain.StockHealthDashboard, error) {
	summary, err := s.GetSummary(ctx, filter)
	if err != nil {
		return nil, err
	}
	if summary == nil {
		summary = make([]domain.StockHealthSummary, 0)
	}

	timeSeries, err := s.GetTimeSeries(ctx, days, filter)
	if err != nil {
		return nil, err
	}
	if timeSeries == nil {
		timeSeries = make(map[string][]domain.TimeSeriesData)
	}

	brandBreakdown, err := s.repo.GetBrandBreakdown(ctx, filter)
	if err != nil {
		return nil, err
	}
	if brandBreakdown == nil {
		brandBreakdown = make([]domain.ConditionBreakdown, 0)
	}

	storeBreakdown, err := s.repo.GetStoreBreakdown(ctx, filter)
	if err != nil {
		return nil, err
	}
	if storeBreakdown == nil {
		storeBreakdown = make([]domain.ConditionBreakdown, 0)
	}

	overstockBreakdown, err := s.repo.GetOverstockBreakdown(ctx, filter)
	if err != nil {
		return nil, err
	}
	if overstockBreakdown == nil {
		overstockBreakdown = make([]domain.OverstockBreakdown, 0)
	}

	return &domain.StockHealthDashboard{
		Summary:            summary,
		TimeSeries:         timeSeries,
		BrandBreakdown:     brandBreakdown,
		StoreBreakdown:     storeBreakdown,
		OverstockBreakdown: overstockBreakdown,
	}, nil
}

func (s *StockHealthService) GetAvailableDates(ctx context.Context, limit int) ([]time.Time, error) {
	return s.repo.GetAvailableDates(ctx, limit)
}
