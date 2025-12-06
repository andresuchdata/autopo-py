// backend-go/internal/api/handlers/po_handler.go
package handlers

import (
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

type POHandler struct {
	poService *service.POService
}

func NewPOHandler(poService *service.POService) *POHandler {
	return &POHandler{poService: poService}
}

// UploadPO handles file uploads for processing
func (h *POHandler) UploadPO(c *gin.Context) {
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid form data"})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no files provided"})
		return
	}

	// Process files
	uploadedFiles := make([]*domain.UploadedFile, 0, len(files))
	for _, file := range files {
		// Save the uploaded file temporarily
		filePath := filepath.Join("data/uploads", file.Filename)
		if err := c.SaveUploadedFile(file, filePath); err != nil {
			log.Error().Err(err).Str("filename", file.Filename).Msg("failed to save uploaded file")
			continue
		}

		uploadedFiles = append(uploadedFiles, &domain.UploadedFile{
			Filename: file.Filename,
			Path:     filePath,
			Size:     file.Size,
		})
	}

	if len(uploadedFiles) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no valid files to process"})
		return
	}

	// Process files in the background
	go func() {
		_, err := h.poService.ProcessPOFiles(c.Request.Context(), uploadedFiles)
		if err != nil {
			log.Error().Err(err).Msg("failed to process PO files")
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "files are being processed",
		"count":   len(uploadedFiles),
	})
}

// GetStores returns a list of all stores
func (h *POHandler) GetStores(c *gin.Context) {
	stores, err := h.poService.GetStores(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch stores"})
		return
	}

	c.JSON(http.StatusOK, stores)
}

// GetBrands returns a list of all brands
func (h *POHandler) GetBrands(c *gin.Context) {
	brands, err := h.poService.GetBrands(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch brands"})
		return
	}

	c.JSON(http.StatusOK, brands)
}

// GetSkus returns a list of SKUs with optional search
func (h *POHandler) GetSkus(c *gin.Context) {
	search := c.Query("search")
	limit := parsePositiveIntWithDefault(c.Query("limit"), 50)
	offset := parseNonNegativeInt(c.Query("offset"))

	skus, err := h.poService.GetSkus(c.Request.Context(), search, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch skus"})
		return
	}

	c.JSON(http.StatusOK, skus)
}

func parsePositiveIntWithDefault(value string, fallback int) int {
	if fallback <= 0 {
		fallback = 50
	}
	if v, err := strconv.Atoi(strings.TrimSpace(value)); err == nil && v > 0 {
		return v
	}
	return fallback
}

func parseNonNegativeInt(value string) int {
	if v, err := strconv.Atoi(strings.TrimSpace(value)); err == nil && v >= 0 {
		return v
	}
	return 0
}

func (h *POHandler) parseDashboardFilter(c *gin.Context) *domain.DashboardFilter {
	poType := strings.TrimSpace(c.Query("po_type"))
	releasedDate := strings.TrimSpace(c.Query("released_date"))

	if poType == "" && releasedDate == "" {
		return nil
	}

	filter := &domain.DashboardFilter{}
	if poType != "" {
		filter.POType = strings.ToUpper(poType)
	}
	if releasedDate != "" {
		filter.ReleasedDate = releasedDate
	}
	return filter
}

// GetStoreResults returns the processing results for a specific store
func (h *POHandler) GetStoreResults(c *gin.Context) {
	storeName := c.Param("store")
	if storeName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "store name is required"})
		return
	}

	results, err := h.poService.GetStoreResults(c.Request.Context(), storeName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "failed to fetch store results",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, results)
}

// GetDashboardSummary returns the aggregated dashboard data
func (h *POHandler) GetDashboardSummary(c *gin.Context) {
	filter := h.parseDashboardFilter(c)
	summary, err := h.poService.GetDashboardSummary(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch dashboard summary"})
		return
	}
	c.JSON(http.StatusOK, summary)
}

// GetPOTrend returns the trend data
func (h *POHandler) GetPOTrend(c *gin.Context) {
	interval := c.DefaultQuery("interval", "day")
	trends, err := h.poService.GetPOTrend(c.Request.Context(), interval)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch trends"})
		return
	}
	c.JSON(http.StatusOK, trends)
}

// GetPOAging returns the aging data
func (h *POHandler) GetPOAging(c *gin.Context) {
	pageStr := c.Query("page")
	if pageStr != "" {
		// Paginated list request
		page := parsePositiveIntWithDefault(pageStr, 1)
		pageSize := parsePositiveIntWithDefault(c.Query("page_size"), 20)
		sortField := c.DefaultQuery("sort_field", "days_in_status")
		sortDirection := c.DefaultQuery("sort_direction", "desc")
		status := c.Query("status")

		response, err := h.poService.GetPOAgingItems(c.Request.Context(), page, pageSize, sortField, sortDirection, status)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch aging items"})
			return
		}
		c.JSON(http.StatusOK, response)
		return
	}

	// Summary request (legacy)
	aging, err := h.poService.GetPOAging(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch aging data"})
		return
	}
	c.JSON(http.StatusOK, aging)
}

// GetSupplierPerformance returns the supplier performance data
func (h *POHandler) GetSupplierPerformance(c *gin.Context) {
	pageStr := c.Query("page")
	if pageStr != "" {
		// Paginated list request
		page := parsePositiveIntWithDefault(pageStr, 1)
		pageSize := parsePositiveIntWithDefault(c.Query("page_size"), 20)
		sortField := c.DefaultQuery("sort_field", "avg_lead_time")
		sortDirection := c.DefaultQuery("sort_direction", "asc")

		response, err := h.poService.GetSupplierPerformanceItems(c.Request.Context(), page, pageSize, sortField, sortDirection)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch supplier performance items"})
			return
		}
		c.JSON(http.StatusOK, response)
		return
	}

	// Legacy summary request
	perf, err := h.poService.GetSupplierPerformance(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch supplier performance"})
		return
	}
	c.JSON(http.StatusOK, perf)
}

// GetPOSnapshotItems returns PO snapshot items filtered by status with pagination and sorting

func (h *POHandler) GetPOSnapshotItems(c *gin.Context) {
	status := c.Query("status")
	if status == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status parameter is required"})
		return
	}

	statusCode, ok := domain.ParsePOStatus(status)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status value"})
		return
	}

	page := parsePositiveIntWithDefault(c.Query("page"), 1)
	pageSize := parsePositiveIntWithDefault(c.Query("page_size"), 20)
	sortField := c.DefaultQuery("sort_field", "po_number")
	sortDirection := c.DefaultQuery("sort_direction", "asc")

	// Parse optional filter parameters
	filter := h.parseDashboardFilter(c)

	response, err := h.poService.GetPOSnapshotItems(c.Request.Context(), statusCode, page, pageSize, sortField, sortDirection, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch PO snapshot items"})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetSupplierPOItems returns PO entries filtered by supplier
func (h *POHandler) GetSupplierPOItems(c *gin.Context) {
	supplierIDStr := c.Query("supplier_id")
	if supplierIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "supplier_id parameter is required"})
		return
	}

	supplierID, err := strconv.ParseInt(supplierIDStr, 10, 64)
	if err != nil || supplierID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid supplier_id value"})
		return
	}

	page := parsePositiveIntWithDefault(c.Query("page"), 1)
	pageSize := parsePositiveIntWithDefault(c.Query("page_size"), 20)
	sortField := c.DefaultQuery("sort_field", "po_number")
	sortDirection := c.DefaultQuery("sort_direction", "asc")

	response, err := h.poService.GetSupplierPOItems(c.Request.Context(), supplierID, page, pageSize, sortField, sortDirection)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch supplier purchase orders"})
		return
	}

	c.JSON(http.StatusOK, response)
}
