// backend-go/internal/domain/models.go
package domain

import "time"

// Store represents a store location
type Store struct {
	ID        int64     `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// POResult represents the result of processing a PO record
type POResult struct {
	ID              int64     `json:"id" db:"id"`
	StoreID         int64     `json:"store_id" db:"store_id"`
	StoreName       string    `json:"store_name" db:"-"`
	SKU             string    `json:"sku" db:"sku"`
	ProductName     string    `json:"product_name" db:"product_name"`
	Stock           int       `json:"stock" db:"stock"`
	DailySales      float64   `json:"daily_sales" db:"daily_sales"`
	StockCoverDays  float64   `json:"stock_cover_days" db:"stock_cover_days"`
	Status          string    `json:"status" db:"status"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

// UploadedFile represents an uploaded file for processing
type UploadedFile struct {
	Filename string
	Path     string
	Size     int64
}

// StoreResult represents the result of processing a store's PO file
type StoreResult struct {
	StoreName   string    `json:"store_name"`
	TotalItems  int       `json:"total_items"`
	ProcessedAt time.Time `json:"processed_at"`
}

// PORecord represents a single record from a PO file
type PORecord struct {
	SKU         string
	ProductName string
	Stock       int
	DailySales  float64
}