// backend-go/internal/api/handlers/po_handler.go
package handlers

import (
	"net/http"
	"path/filepath"

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
