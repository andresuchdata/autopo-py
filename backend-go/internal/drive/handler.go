package drive

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
)

type Handler struct {
	service       *Service
	ingestService *IngestService
}

func NewHandler(service *Service, ingestService *IngestService) *Handler {
	return &Handler{
		service:       service,
		ingestService: ingestService,
	}
}

func (h *Handler) RegisterRoutes(router *mux.Router) {
	router.HandleFunc("/api/drive/files", h.ListFiles).Methods("GET")
	router.HandleFunc("/api/drive/files/download", h.DownloadFile).Methods("GET")
	router.HandleFunc("/api/drive/ingest", h.IngestFile).Methods("POST")
}

func (h *Handler) ListFiles(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	folderID := query.Get("folderId")
	folderPath := query.Get("path")

	var files []*File
	var err error

	if folderPath != "" {
		// Find folder by path
		folderID, err = h.service.FindFolderByPath(folderPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
	}

	files, err = h.service.ListFiles(folderID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func (h *Handler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	fileID := r.URL.Query().Get("fileId")
	if fileID == "" {
		http.Error(w, "fileId parameter is required", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=data.csv")

	err := h.service.DownloadFile(fileID, w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (h *Handler) IngestFile(w http.ResponseWriter, r *http.Request) {
	fileID := r.URL.Query().Get("fileId")
	if fileID == "" {
		http.Error(w, "fileId parameter is required", http.StatusBadRequest)
		return
	}

	if err := h.ingestService.IngestFile(r.Context(), fileID); err != nil {
		http.Error(w, fmt.Sprintf("ingestion failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "File ingested successfully"})
}
