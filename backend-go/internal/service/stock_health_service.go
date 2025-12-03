package service

import (
	"context"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/andresuchdata/autopo-py/backend-go/internal/repository"
)

type StockHealthService struct {
	repo repository.StockHealthRepository
}

func NewStockHealthService(repo repository.StockHealthRepository) *StockHealthService {
	return &StockHealthService{repo: repo}
}

func (s *StockHealthService) GetSummary(ctx context.Context, filter domain.StockHealthFilter) ([]domain.StockHealthSummary, error) {
	return s.repo.GetStockHealthSummary(ctx, filter)
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
	summary, err := s.repo.GetStockHealthSummary(ctx, filter)
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

	return &domain.StockHealthDashboard{
		Summary:        summary,
		TimeSeries:     timeSeries,
		BrandBreakdown: brandBreakdown,
		StoreBreakdown: storeBreakdown,
	}, nil
}

func (s *StockHealthService) GetAvailableDates(ctx context.Context, limit int) ([]time.Time, error) {
	return s.repo.GetAvailableDates(ctx, limit)
}
