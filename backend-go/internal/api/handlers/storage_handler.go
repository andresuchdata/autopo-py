package handlers

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
	"github.com/gin-gonic/gin"
)

type StorageHandler struct {
	storage storage.ObjectStorage
}

func NewStorageHandler(s storage.ObjectStorage) *StorageHandler {
	return &StorageHandler{storage: s}
}

func (h *StorageHandler) ListFiles(c *gin.Context) {
	prefix := c.Query("prefix")
	limitStr := c.DefaultQuery("limit", "100")
	cursor := c.Query("cursor")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 100
	}

	result, err := h.storage.ListObjects(c.Request.Context(), prefix, limit, cursor)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *StorageHandler) DownloadFile(c *gin.Context) {
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key is required"})
		return
	}

	content, err := h.storage.GetObjectContent(c.Request.Context(), key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	fileName := filepath.Base(key)
	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fileName))
	c.Header("Content-Type", "application/octet-stream")
	c.Data(http.StatusOK, "application/octet-stream", content)
}

func (h *StorageHandler) GetFileContent(c *gin.Context) {
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key is required"})
		return
	}

	content, err := h.storage.GetObjectContent(c.Request.Context(), key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Data(http.StatusOK, "text/plain; charset=utf-8", content)
}

func (h *StorageHandler) DeleteFile(c *gin.Context) {
	key := c.Query("key")
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "key is required"})
		return
	}

	err := h.storage.DeleteObject(c.Request.Context(), key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

func (h *StorageHandler) DeletePrefix(c *gin.Context) {
	prefix := c.Query("prefix")
	if prefix == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "prefix is required"})
		return
	}

	err := h.storage.DeletePrefix(c.Request.Context(), prefix)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

func (h *StorageHandler) DownloadAll(c *gin.Context) {
	prefix := c.Query("prefix")
	if prefix == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "prefix is required"})
		return
	}

	var allFiles []storage.ObjectInfo
	cursor := ""

	for {
		page, err := h.storage.ListObjects(c.Request.Context(), prefix, 1000, cursor)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		allFiles = append(allFiles, page.Objects...)

		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}

	if len(allFiles) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no files found"})
		return
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, obj := range allFiles {
		content, err := h.storage.GetObjectContent(c.Request.Context(), obj.Key)
		if err != nil {
			zw.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		relPath := strings.TrimPrefix(obj.Key, prefix)
		relPath = strings.TrimPrefix(relPath, "/")

		f, err := zw.Create(relPath)
		if err != nil {
			zw.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_, err = io.Copy(f, bytes.NewReader(content))
		if err != nil {
			zw.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	zw.Close()

	zipName := filepath.Base(strings.TrimSuffix(prefix, "/")) + ".zip"
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", zipName))
	c.Header("Content-Type", "application/zip")
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

func (h *StorageHandler) BulkDeleteFiles(c *gin.Context) {
	var req struct {
		Keys []string `json:"keys"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if len(req.Keys) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no keys provided"})
		return
	}

	err := h.storage.DeleteObjects(c.Request.Context(), req.Keys)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "count": len(req.Keys)})
}

func (h *StorageHandler) BulkDownloadFiles(c *gin.Context) {
	keysStr := c.Query("keys")
	if keysStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "keys are required"})
		return
	}
	keys := strings.Split(keysStr, ",")

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, key := range keys {
		content, err := h.storage.GetObjectContent(c.Request.Context(), key)
		if err != nil {
			zw.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Errorf("failed to get %s: %w", key, err).Error()})
			return
		}

		fileName := filepath.Base(key)
		f, err := zw.Create(fileName)
		if err != nil {
			zw.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_, err = io.Copy(f, bytes.NewReader(content))
		if err != nil {
			zw.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := zw.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Disposition", "attachment; filename=bulk_download.zip")
	c.Header("Content-Type", "application/zip")
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

func (h *StorageHandler) ListPrefixes(c *gin.Context) {
	prefix := c.Query("prefix")
	prefixes, err := h.storage.ListPrefixes(c.Request.Context(), prefix)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	base := strings.Trim(prefix, "/")
	if base != "" && !strings.HasSuffix(base, "/") {
		base += "/"
	}

	type prefixResponse struct {
		Name   string `json:"name"`
		Prefix string `json:"prefix"`
	}

	result := make([]prefixResponse, 0, len(prefixes))
	for _, name := range prefixes {
		full := name
		if base != "" {
			full = base + name
		}
		if !strings.HasSuffix(full, "/") {
			full += "/"
		}
		result = append(result, prefixResponse{
			Name:   name,
			Prefix: full,
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	c.JSON(http.StatusOK, result)
}
