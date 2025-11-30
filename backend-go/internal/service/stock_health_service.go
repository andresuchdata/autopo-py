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

func (s *StockHealthService) GetDashboard(ctx context.Context, days int, filter domain.StockHealthFilter) (*domain.StockHealthDashboard, error) {
	summary, err := s.repo.GetStockHealthSummary(ctx, filter)
	if err != nil {
		return nil, err
	}

	timeSeries, err := s.GetTimeSeries(ctx, days, filter)
	if err != nil {
		return nil, err
	}

	return &domain.StockHealthDashboard{
		Summary:    summary,
		TimeSeries: timeSeries,
	}, nil
}

func (s *StockHealthService) GetAvailableDates(ctx context.Context, limit int) ([]time.Time, error) {
	return s.repo.GetAvailableDates(ctx, limit)
}
