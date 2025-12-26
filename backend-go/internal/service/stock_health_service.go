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
		log.Debug().Msg("stock health: cache HIT for summary")
		return summaries, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("stock health: cache get summary failed")
	}

	log.Debug().Msg("stock health: cache MISS for summary - querying database")
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
	if breakdown, ok, err := s.cache.GetBrandBreakdown(ctx, filter); err == nil && ok {
		log.Debug().Msg("stock health: cache HIT for brand breakdown")
		return breakdown, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("stock health: cache get brand breakdown failed")
	}

	log.Debug().Msg("stock health: cache MISS for brand breakdown - querying database")
	breakdown, err := s.repo.GetBrandBreakdown(ctx, filter)
	if err != nil {
		return nil, err
	}

	if err := s.cache.SetBrandBreakdown(ctx, filter, breakdown); err != nil {
		log.Warn().Err(err).Msg("stock health: cache set brand breakdown failed")
	}

	return breakdown, nil
}

func (s *StockHealthService) GetStoreBreakdown(ctx context.Context, filter domain.StockHealthFilter) ([]domain.ConditionBreakdown, error) {
	if breakdown, ok, err := s.cache.GetStoreBreakdown(ctx, filter); err == nil && ok {
		log.Debug().Msg("stock health: cache HIT for store breakdown")
		return breakdown, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("stock health: cache get store breakdown failed")
	}

	log.Debug().Msg("stock health: cache MISS for store breakdown - querying database")
	breakdown, err := s.repo.GetStoreBreakdown(ctx, filter)
	if err != nil {
		return nil, err
	}

	if err := s.cache.SetStoreBreakdown(ctx, filter, breakdown); err != nil {
		log.Warn().Err(err).Msg("stock health: cache set store breakdown failed")
	}

	return breakdown, nil
}

func (s *StockHealthService) GetOverstockBreakdown(ctx context.Context, filter domain.StockHealthFilter) ([]domain.OverstockBreakdown, error) {
	if breakdown, ok, err := s.cache.GetOverstockBreakdown(ctx, filter); err == nil && ok {
		log.Debug().Msg("stock health: cache HIT for overstock breakdown")
		return breakdown, nil
	} else if err != nil {
		log.Warn().Err(err).Msg("stock health: cache get overstock breakdown failed")
	}

	log.Debug().Msg("stock health: cache MISS for overstock breakdown - querying database")
	breakdown, err := s.repo.GetOverstockBreakdown(ctx, filter)
	if err != nil {
		return nil, err
	}

	if err := s.cache.SetOverstockBreakdown(ctx, filter, breakdown); err != nil {
		log.Warn().Err(err).Msg("stock health: cache set overstock breakdown failed")
	}

	return breakdown, nil
}

func (s *StockHealthService) GetDashboard(ctx context.Context, days int, filter domain.StockHealthFilter) (*domain.StockHealthDashboard, error) {
	summary, err := s.GetSummary(ctx, filter)
	if err != nil {
		return nil, err
	}
	if summary == nil {
		summary = make([]domain.StockHealthSummary, 0)
	}

	// Temporarily disable time series computation for the dashboard summary
	// endpoint. The dashboard currently uses per-date snapshot data only,
	// so we return an empty time series map here while keeping the underlying
	// queries and service methods intact for future use.
	timeSeries := make(map[string][]domain.TimeSeriesData)

	brandBreakdown, err := s.GetBrandBreakdown(ctx, filter)
	if err != nil {
		return nil, err
	}
	if brandBreakdown == nil {
		brandBreakdown = make([]domain.ConditionBreakdown, 0)
	}

	storeBreakdown, err := s.GetStoreBreakdown(ctx, filter)
	if err != nil {
		return nil, err
	}
	if storeBreakdown == nil {
		storeBreakdown = make([]domain.ConditionBreakdown, 0)
	}

	overstockBreakdown, err := s.GetOverstockBreakdown(ctx, filter)
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
