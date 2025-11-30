package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/semaphore"
)

type DB struct {
	*sqlx.DB
	sem *semaphore.Weighted
}

var (
	dbInstance *DB
	once       sync.Once
)

// NewDB creates a new database connection pool
func NewDB(cfg *config.DatabaseConfig) (*DB, error) {
	var err error
	once.Do(func() {
		connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode)

		var db *sqlx.DB
		db, err = sqlx.Connect("postgres", connStr)
		if err != nil {
			return
		}

		// Configure connection pool
		db.SetMaxOpenConns(25)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(5 * time.Minute)

		// Initialize with a semaphore to limit concurrent operations
		dbInstance = &DB{
			DB:  db,
			sem: semaphore.NewWeighted(10), // Limit to 10 concurrent operations
		}
	})

	return dbInstance, err
}

// WithTx executes a function within a transaction
func (db *DB) WithTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	// Acquire semaphore
	if err := db.sem.Acquire(ctx, 1); err != nil {
		return fmt.Errorf("could not acquire semaphore: %w", err)
	}
	defer db.sem.Release(1)

	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("could not begin transaction: %w", err)
	}

	if err := fn(tx.Tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			log.Error().Err(rbErr).Msg("could not rollback transaction")
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("could not commit transaction: %w", err)
	}

	return nil
}
