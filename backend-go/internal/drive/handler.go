package drive

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(router *mux.Router) {
	router.HandleFunc("/api/drive/files", h.ListFiles).Methods("GET")
	router.HandleFunc("/api/drive/files/download", h.DownloadFile).Methods("GET")
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
