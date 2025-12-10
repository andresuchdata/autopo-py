package pipeline

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"time"
)

// Orchestrator coordinates running a Pipeline over a set of local files grouped by snapshot date.
type Orchestrator struct {
	db    *sql.DB
	cfg   PipelineConfig
	makeW func(p Pipeline, cfg PipelineConfig, db *sql.DB) *Worker
}

// NewOrchestrator creates a new Orchestrator.
func NewOrchestrator(db *sql.DB, cfg PipelineConfig) *Orchestrator {
	return &Orchestrator{
		db:    db,
		cfg:   cfg,
		makeW: NewWorker,
	}
}

// Run groups the provided files by snapshot date (using p.GetSnapshotDate) and
// runs a Worker batch for each date.
func (o *Orchestrator) Run(ctx context.Context, p Pipeline, files []string) error {
	if len(files) == 0 {
		return nil
	}

	// Group files by date
	byDate := make(map[time.Time][]string)
	for _, f := range files {
		date, err := p.GetSnapshotDate(filepath.Base(f))
		if err != nil {
			return fmt.Errorf("failed to get snapshot date for %s: %w", f, err)
		}

		date = date.Truncate(24 * time.Hour)
		byDate[date] = append(byDate[date], f)
	}

	worker := o.makeW(p, o.cfg, o.db)

	for date, batch := range byDate {
		if err := worker.ProcessBatch(ctx, date, batch); err != nil {
			return fmt.Errorf("failed to process batch for %s: %w", date.Format("2006-01-02"), err)
		}
	}

	return nil
}
