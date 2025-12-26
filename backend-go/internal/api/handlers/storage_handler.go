package handlers

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
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
	files, err := h.storage.ListObjects(c.Request.Context(), prefix)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, files)
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

	files, err := h.storage.ListObjects(c.Request.Context(), prefix)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(files) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no files found"})
		return
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, obj := range files {
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
