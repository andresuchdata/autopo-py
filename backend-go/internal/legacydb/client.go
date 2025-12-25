package legacydb

import (
	"database/sql"
	"fmt"
	"net/url"

	"github.com/andresuchdata/autopo-py/backend-go/internal/config"
	_ "github.com/go-sql-driver/mysql"
)

// NewClient creates a MySQL database connection to the legacy CI3 database
func NewClient(cfg config.LegacyDatabaseConfig) (*sql.DB, error) {
	if cfg.Host == "" || cfg.User == "" || cfg.DBName == "" {
		return nil, fmt.Errorf("legacy database configuration is incomplete (host, user, and dbname are required)")
	}

	// Build DSN: user:password@tcp(host:port)/dbname?parseTime=true&loc=timezone
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=%s",
		cfg.User,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.DBName,
		url.QueryEscape(cfg.Timezone),
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open legacy database connection: %w", err)
	}

	// Test the connection
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping legacy database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)

	return db, nil
}
