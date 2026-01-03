// backend-go/internal/api/handlers/po_handler.go
package handlers

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"github.com/xuri/excelize/v2"
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

// GetStores returns a list of stores with optional search
func (h *POHandler) GetStores(c *gin.Context) {
	search := c.Query("search")
	stores, err := h.poService.GetStores(c.Request.Context(), search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch stores"})
		return
	}

	c.JSON(http.StatusOK, stores)
}

// GetBrands returns a list of brands with optional search
func (h *POHandler) GetBrands(c *gin.Context) {
	search := c.Query("search")
	brands, err := h.poService.GetBrands(c.Request.Context(), search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch brands"})
		return
	}

	c.JSON(http.StatusOK, brands)
}

// GetSuppliers returns a paginated list of suppliers with optional search
func (h *POHandler) GetSuppliers(c *gin.Context) {
	search := c.Query("search")
	limit := parsePositiveIntWithDefault(c.Query("limit"), 50)
	offset := parseNonNegativeInt(c.Query("offset"))

	suppliers, err := h.poService.GetSuppliers(c.Request.Context(), search, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch suppliers"})
		return
	}

	c.JSON(http.StatusOK, suppliers)
}

// GetSkus returns a list of SKUs with optional search
func (h *POHandler) GetSkus(c *gin.Context) {
	search := c.Query("search")
	limit := parsePositiveIntWithDefault(c.Query("limit"), 50)
	offset := parseNonNegativeInt(c.Query("offset"))

	// Optional brand filter: accept both brand_ids (comma-separated) and brand_id (single)
	brandIDsParam := strings.TrimSpace(c.Query("brand_ids"))
	if brandIDsParam == "" {
		brandIDsParam = strings.TrimSpace(c.Query("brand_id"))
	}
	var brandIDs []int64
	if brandIDsParam != "" {
		parts := strings.Split(brandIDsParam, ",")
		for _, part := range parts {
			if id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64); err == nil && id > 0 {
				brandIDs = append(brandIDs, id)
			}
		}
	}

	skus, err := h.poService.GetSkus(c.Request.Context(), search, limit, offset, brandIDs)
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
	storeIDsParam := strings.TrimSpace(c.Query("store_ids"))
	brandIDsParam := strings.TrimSpace(c.Query("brand_ids"))
	supplierIDsParam := strings.TrimSpace(c.Query("supplier_ids"))

	filter := &domain.DashboardFilter{}

	if poType != "" {
		filter.POType = strings.ToUpper(poType)
	}
	if releasedDate != "" {
		filter.ReleasedDate = releasedDate
	}

	parseInt64List := func(raw string) []int64 {
		if raw == "" {
			return nil
		}
		parts := strings.Split(raw, ",")
		result := make([]int64, 0, len(parts))
		for _, part := range parts {
			if id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64); err == nil && id > 0 {
				result = append(result, id)
			}
		}
		if len(result) == 0 {
			return nil
		}
		return result
	}

	if storeIDs := parseInt64List(storeIDsParam); len(storeIDs) > 0 {
		filter.StoreIDs = storeIDs
	}
	if brandIDs := parseInt64List(brandIDsParam); len(brandIDs) > 0 {
		filter.BrandIDs = brandIDs
	}
	if supplierIDs := parseInt64List(supplierIDsParam); len(supplierIDs) > 0 {
		filter.SupplierIDs = supplierIDs
	}

	// Return nil if no filters are actually set
	if filter.POType == "" && filter.ReleasedDate == "" && len(filter.StoreIDs) == 0 && len(filter.BrandIDs) == 0 && len(filter.SupplierIDs) == 0 {
		return nil
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

// GetStatusSummaryRaw returns PO snapshot summary grouped directly by stored status
func (h *POHandler) GetStatusSummaryRaw(c *gin.Context) {
	filter := h.parseDashboardFilter(c)
	summary, err := h.poService.GetPOSnapshotStatusSummaryRaw(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch raw status summary"})
		return
	}
	c.JSON(http.StatusOK, summary)
}

// GetStatusSummary returns status summaries (granular)
func (h *POHandler) GetStatusSummary(c *gin.Context) {
	filter := h.parseDashboardFilter(c)
	summary, err := h.poService.GetDashboardStatusSummary(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch status summary"})
		return
	}
	c.JSON(http.StatusOK, summary)
}

// GetTotals returns dashboard totals (granular)
func (h *POHandler) GetTotals(c *gin.Context) {
	filter := h.parseDashboardFilter(c)
	totals, err := h.poService.GetDashboardTotals(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch dashboard totals"})
		return
	}
	c.JSON(http.StatusOK, totals)
}

// GetPOTrend returns the trend data
func (h *POHandler) GetPOTrend(c *gin.Context) {
	interval := c.DefaultQuery("interval", "day")
	filter := h.parseDashboardFilter(c)
	trends, err := h.poService.GetPOTrend(c.Request.Context(), interval, filter)
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

		response, err := h.poService.GetPOAgingItems(c.Request.Context(), page, pageSize, sortField, sortDirection, status, h.parseDashboardFilter(c))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch aging items"})
			return
		}
		c.JSON(http.StatusOK, response)
		return
	}

	// Summary request (legacy)
	filter := h.parseDashboardFilter(c)
	aging, err := h.poService.GetPOAging(c.Request.Context(), filter)
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

		response, err := h.poService.GetSupplierPerformanceItems(c.Request.Context(), page, pageSize, sortField, sortDirection, h.parseDashboardFilter(c))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch supplier performance items"})
			return
		}
		c.JSON(http.StatusOK, response)
		return
	}

	// Legacy summary request
	filter := h.parseDashboardFilter(c)
	perf, err := h.poService.GetSupplierPerformance(c.Request.Context(), filter)
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

// DownloadPOSnapshotItems handles downloading PO snapshot items as CSV or Excel
func (h *POHandler) DownloadPOSnapshotItems(c *gin.Context) {
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
	downloadAll := c.Query("download_all") == "true"
	format := strings.ToLower(c.DefaultQuery("format", "csv"))

	// Parse optional filter parameters
	filter := h.parseDashboardFilter(c)

	var items []domain.POSnapshotItem
	var err error

	if downloadAll {
		items, err = h.poService.GetPOSnapshotItemsForExport(c.Request.Context(), statusCode, sortField, sortDirection, filter)
	} else {
		// Re-use paginated fetch but extract items
		var response *domain.POSnapshotItemsResponse
		response, err = h.poService.GetPOSnapshotItems(c.Request.Context(), statusCode, page, pageSize, sortField, sortDirection, filter)
		if response != nil {
			items = response.Items
		}
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch items for download"})
		return
	}

	filename := fmt.Sprintf("po_snapshot_%s_%s", status, time.Now().Format("20060102_150405"))

	if format == "xlsx" || format == "excel" {
		writeExcel(c, items, filename)
	} else {
		writeIDLocaleCSV(c, items, filename)
	}
}

func writeIDLocaleCSV(c *gin.Context, items []domain.POSnapshotItem, filename string) {
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.csv", filename))

	writer := c.Writer
	// BOM for Excel to recognize UTF-8
	writer.Write([]byte{0xEF, 0xBB, 0xBF})

	// Header
	header := []string{
		"Snapshot Time", "PO Number", "SKU", "Product Name", "Brand", "Store", "Supplier",
		"Qty", "Total Amount", "Released", "Sent", "Approved", "ETA", "Arrived", "Received",
	}
	fmt.Fprintf(writer, "%s\n", strings.Join(header, ";"))

	// Data
	for _, item := range items {
		record := []string{
			formatDateNullable(item.SnapshotTime),
			escapeCSV(item.PONumber),
			escapeCSV(item.SKU),
			escapeCSV(item.ProductName),
			escapeCSV(item.BrandName),
			escapeCSV(item.StoreName),
			escapeCSV(item.SupplierName),
			fmt.Sprintf("%d", item.POQty),
			formatNumberID(item.TotalAmount),
			formatDateNullable(item.POReleasedAt),
			formatDateNullable(item.POSentAt),
			formatDateNullable(item.POApprovedAt),
			formatDateNullable(item.ETA),
			formatDateNullable(item.POArrivedAt),
			formatDateNullable(item.POReceivedAt),
		}
		fmt.Fprintf(writer, "%s\n", strings.Join(record, ";"))
	}
}

func writeExcel(c *gin.Context, items []domain.POSnapshotItem, filename string) {
	f := excelize.NewFile()
	sheetName := "PO Items"
	index, _ := f.NewSheet(sheetName)
	f.SetActiveSheet(index)
	f.DeleteSheet("Sheet1")

	headers := []string{
		"Snapshot Time", "PO Number", "SKU", "Product Name", "Brand", "Store", "Supplier",
		"Qty", "Total Amount", "Released", "Sent", "Approved", "ETA", "Arrived", "Received",
	}

	// Style for header
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#E0E0E0"}, Pattern: 1},
	})

	// Style for numbers (comma decimal, dot thousands - though Excel might respect local user settings, usually safest to send raw numbers and let Excel format, OR send strings.
	// User requested ID locale format. "Comma for decimal, dot for thousand".
	// If we send raw numbers, Excel uses user's system locale.
	// If we send strings, it stays as is. Given specific requirement, strings might be safer or custom format string.)
	// Let's use custom number format string like "#.##0,00" but Excel format strings usually use standard US notation in code (e.g. "#,##0.00") and Excel displays it according to locale.
	// HOWEVER, user requested "Indonesian locale settings (semicolon separator, decimal comma...)". This strongly implies CSV structure.
	// For Excel, it's a binary format. The "locale" is mostly presentation.
	// I will just dump values. For "Total Amount", I will use Number type. For dates, I will use string to ensure "DD MMM YYYY".

	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
		f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}

	for i, item := range items {
		row := i + 2
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), formatDateNullable(item.SnapshotTime))
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), item.PONumber)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", row), item.SKU)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", row), item.ProductName)
		f.SetCellValue(sheetName, fmt.Sprintf("E%d", row), item.BrandName)
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", row), item.StoreName)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", row), item.SupplierName)
		f.SetCellValue(sheetName, fmt.Sprintf("H%d", row), item.POQty)
		f.SetCellValue(sheetName, fmt.Sprintf("I%d", row), item.TotalAmount) // Number
		f.SetCellValue(sheetName, fmt.Sprintf("J%d", row), formatDateNullable(item.POReleasedAt))
		f.SetCellValue(sheetName, fmt.Sprintf("K%d", row), formatDateNullable(item.POSentAt))
		f.SetCellValue(sheetName, fmt.Sprintf("L%d", row), formatDateNullable(item.POApprovedAt))
		f.SetCellValue(sheetName, fmt.Sprintf("M%d", row), formatDateNullable(item.ETA))
		f.SetCellValue(sheetName, fmt.Sprintf("N%d", row), formatDateNullable(item.POArrivedAt))
		f.SetCellValue(sheetName, fmt.Sprintf("O%d", row), formatDateNullable(item.POReceivedAt))
	}

	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.xlsx", filename))
	if err := f.Write(c.Writer); err != nil {
		log.Error().Err(err).Msg("failed to write excel file")
	}
}

func formatDateNullable(s *string) string {
	if s == nil || *s == "" {
		return "-"
	}
	// Try parsing standard SQL format if needed, or if it's already string.
	// The DB repo uses TO_CHAR(..., 'YYYY-MM-DD HH24:MI:SS') or similar.
	// We want DD MMM YYYY.
	t, err := time.Parse("2006-01-02 15:04:05", *s)
	if err != nil {
		// Try date only
		t, err = time.Parse("2006-01-02", *s)
	}
	if err == nil {
		return t.Format("02 Jan 2006")
	}
	return *s
}

func formatNumberID(f float64) string {
	// 1000.50 -> "1.000,50"
	s := fmt.Sprintf("%.2f", f)         // "1000.50"
	s = strings.Replace(s, ".", ",", 1) // "1000,50"

	// Add thousand separators
	parts := strings.Split(s, ",")
	integerPart := parts[0]
	decimalPart := parts[1]

	var result []byte
	count := 0
	for i := len(integerPart) - 1; i >= 0; i-- {
		if count > 0 && count%3 == 0 {
			result = append([]byte{'.'}, result...)
		}
		result = append([]byte{integerPart[i]}, result...)
		count++
	}

	return string(result) + "," + decimalPart
}

func escapeCSV(s string) string {
	if strings.ContainsAny(s, ";\"\n\r") {
		return fmt.Sprintf("\"%s\"", strings.ReplaceAll(s, "\"", "\"\""))
	}
	return s
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

// UpdatePOItemETA updates the ETA for a PO item
func (h *POHandler) UpdatePOItemETA(c *gin.Context) {
	var req domain.UpdateETARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	if req.PONumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "po_number is required"})
		return
	}
	if req.ETA == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "eta is required"})
		return
	}

	if err := h.poService.UpdatePOItemETA(c.Request.Context(), req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update eta", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "eta updated successfully"})
}

// ResetPOItemETA resets the ETA for a PO item
func (h *POHandler) ResetPOItemETA(c *gin.Context) {
	var req domain.ResetETARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	if req.PONumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "po_number is required"})
		return
	}

	if err := h.poService.ResetPOItemETA(c.Request.Context(), req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset eta", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "eta reset successfully"})
}

// GetPODetails returns the detailed view of a PO
func (h *POHandler) GetPODetails(c *gin.Context) {
	poNumber := c.Param("po_number")
	if poNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "po_number is required"})
		return
	}

	page := parsePositiveIntWithDefault(c.Query("page"), 1)
	pageSize := parsePositiveIntWithDefault(c.Query("page_size"), 20)
	search := c.Query("search")
	sortField := c.DefaultQuery("sort_field", "sku")
	sortDirection := c.DefaultQuery("sort_direction", "asc")

	details, err := h.poService.GetPODetails(c.Request.Context(), poNumber, page, pageSize, search, sortField, sortDirection)
	if err != nil {
		if strings.Contains(err.Error(), "no rows in result set") {
			c.JSON(http.StatusOK, nil)
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch po details", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, details)
}

// GetSupplierDetails returns details for a supplier including their PO list
func (h *POHandler) GetSupplierDetails(c *gin.Context) {
	supplierIDStr := c.Param("supplier_id")
	if supplierIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "supplier_id is required"})
		return
	}

	supplierID, err := strconv.ParseInt(supplierIDStr, 10, 64)
	if err != nil || supplierID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid supplier_id value"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	var storeID *int64
	if storeIDStr := c.Query("store_id"); storeIDStr != "" {
		if id, err := strconv.ParseInt(storeIDStr, 10, 64); err == nil {
			storeID = &id
		}
	}

	var brandID *int64
	if brandIDStr := c.Query("brand_id"); brandIDStr != "" {
		if id, err := strconv.ParseInt(brandIDStr, 10, 64); err == nil {
			brandID = &id
		}
	}

	search := c.Query("search")
	status := c.Query("status")

	details, err := h.poService.GetSupplierDetails(c.Request.Context(), supplierID, page, pageSize, storeID, brandID, search, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch supplier details", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, details)
}

// InvalidatePODetailsCache invalidates the cache for a specific PO
func (h *POHandler) InvalidatePODetailsCache(c *gin.Context) {
	poNumber := c.Param("po_number")
	if poNumber == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "po_number is required"})
		return
	}

	if err := h.poService.InvalidatePODetails(c.Request.Context(), poNumber); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to invalidate cache", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "cache invalidated successfully"})
}
