package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/gin-gonic/gin"
)

type StockHealthHandler struct {
	service *service.StockHealthService
}

func NewStockHealthHandler(service *service.StockHealthService) *StockHealthHandler {
	return &StockHealthHandler{service: service}
}

func (h *StockHealthHandler) parseFilter(c *gin.Context) domain.StockHealthFilter {
	filter := domain.StockHealthFilter{
		Page:     1,
		PageSize: 50,
	}

	if page, err := strconv.Atoi(c.DefaultQuery("page", "1")); err == nil && page > 0 {
		filter.Page = page
	}

	if size, err := strconv.Atoi(c.DefaultQuery("page_size", "50")); err == nil && size > 0 {
		filter.PageSize = size
	}

	if condition := strings.TrimSpace(c.Query("condition")); condition != "" {
		filter.Condition = condition
	}

	// Support multiple kategori_brand values via repeated params or comma-separated string
	rawKategori := c.QueryArray("kategori_brand")
	if len(rawKategori) == 0 {
		// Backwards/forwards compatibility: some clients send kategori_brands
		rawKategori = c.QueryArray("kategori_brands")
	}

	if len(rawKategori) == 0 {
		if single := strings.TrimSpace(c.Query("kategori_brand")); single != "" {
			rawKategori = strings.Split(single, ",")
		} else if single := strings.TrimSpace(c.Query("kategori_brands")); single != "" {
			rawKategori = strings.Split(single, ",")
		}
	}

	// If kategori values come from QueryArray but contain comma-separated lists,
	// flatten them so both styles are supported:
	//   ?kategori_brand=A&kategori_brand=B
	//   ?kategori_brand=A,B
	if len(rawKategori) > 0 {
		flattened := make([]string, 0, len(rawKategori))
		for _, v := range rawKategori {
			v = strings.TrimSpace(v)
			if v == "" {
				continue
			}
			if strings.Contains(v, ",") {
				parts := strings.Split(v, ",")
				for _, p := range parts {
					p = strings.TrimSpace(p)
					if p != "" {
						flattened = append(flattened, p)
					}
				}
				continue
			}
			flattened = append(flattened, v)
		}
		rawKategori = flattened
	}

	if len(rawKategori) > 0 {
		seen := make(map[string]struct{})
		for _, v := range rawKategori {
			v = strings.TrimSpace(v)
			if v == "" {
				continue
			}
			upper := strings.ToUpper(v)
			if _, ok := seen[upper]; ok {
				continue
			}
			seen[upper] = struct{}{}
			filter.KategoriBrand = append(filter.KategoriBrand, upper)
		}
	}

	if stockDate := strings.TrimSpace(c.Query("stock_date")); stockDate != "" {
		filter.StockDate = stockDate
	}

	parseInt64List := func(param string) []int64 {
		value := strings.TrimSpace(c.Query(param))
		if value == "" {
			return nil
		}

		parts := strings.Split(value, ",")
		result := make([]int64, 0, len(parts))
		for _, part := range parts {
			if id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64); err == nil {
				result = append(result, id)
			}
		}
		return result
	}

	filter.StoreIDs = parseInt64List("store_ids")
	filter.BrandIDs = parseInt64List("brand_ids")

	if skus := strings.TrimSpace(c.Query("sku_ids")); skus != "" {
		filter.SKUIds = strings.Split(skus, ",")
	}

	if grouping := strings.TrimSpace(c.Query("grouping")); grouping != "" {
		filter.Grouping = strings.ToLower(grouping)
	}

	if sortField := strings.TrimSpace(c.Query("sort_field")); sortField != "" {
		filter.SortField = strings.ToLower(sortField)
	}

	sortDir := strings.ToLower(strings.TrimSpace(c.Query("sort_direction")))
	if sortDir != "desc" {
		sortDir = "asc"
	}
	filter.SortDir = sortDir

	parseFloat64 := func(param string) *float64 {
		value := strings.TrimSpace(c.Query(param))
		if value == "" {
			return nil
		}
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return &f
		}
		return nil
	}

	filter.DailyCoverMin = parseFloat64("daily_cover_min")
	filter.DailyCoverMax = parseFloat64("daily_cover_max")

	if overstockGroup := strings.TrimSpace(c.Query("overstock_group")); overstockGroup != "" {
		filter.OverstockGroup = overstockGroup
	}

	return filter
}

func (h *StockHealthHandler) GetSummary(c *gin.Context) {
	filter := h.parseFilter(c)
	results, err := h.service.GetSummary(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch summary", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, results)
}

func (h *StockHealthHandler) GetItems(c *gin.Context) {
	filter := h.parseFilter(c)
	items, total, err := h.service.GetItems(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch items", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"total": total,
	})
}

func (h *StockHealthHandler) GetTimeSeries(c *gin.Context) {
	filter := h.parseFilter(c)
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 {
		days = 30
	}

	data, err := h.service.GetTimeSeries(c.Request.Context(), days, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch time series", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, data)
}

func (h *StockHealthHandler) GetDashboard(c *gin.Context) {
	filter := h.parseFilter(c)
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 {
		days = 30
	}

	data, err := h.service.GetDashboard(c.Request.Context(), days, filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch dashboard", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, data)
}

func (h *StockHealthHandler) GetAvailableDates(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))
	if limit <= 0 {
		limit = 30
	}

	dates, err := h.service.GetAvailableDates(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch available dates", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"dates": dates})
}

// GetKategoriBrands returns the list of supported kategori_brand values
func (h *StockHealthHandler) GetKategoriBrands(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"kategori_brands": []string{
			"BRAND VIRAL",
			"BEAUTY MATURE",
			"ACCESSORIES",
			"BEAUTY TRENDING",
			"",
			"MEN",
			"SWALAYAN BEAUTY",
			"SWALAYAN UMUM",
			"DELISTING",
			"GRACE AND GLOW",
			"GA",
			"KMART IMPOR",
			"KMART LOKAL",
			"FASHION",
			"LUXURY",
		},
	})
}
