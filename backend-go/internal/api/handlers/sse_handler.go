package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/models"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/andresuchdata/autopo-py/backend-go/pkg/logger"
	"github.com/gin-gonic/gin"
)

// SSEHandler handles Server-Sent Events for realtime pipeline updates
type SSEHandler struct {
	managementService *service.PipelineManagementService
}

// NewSSEHandler creates a new SSE handler
func NewSSEHandler(pms *service.PipelineManagementService) *SSEHandler {
	return &SSEHandler{
		managementService: pms,
	}
}

// SSEEvent represents a server-sent event
type SSEEvent struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

// ProgressUpdate represents a progress update event
type ProgressUpdate struct {
	RunID           int64                  `json:"run_id"`
	Status          models.PipelineStatus  `json:"status"`
	ProcessedFiles  int                    `json:"processed_files"`
	TotalFiles      int                    `json:"total_files"`
	TotalRows       int                    `json:"total_rows"`
	StoreProgress   []models.StoreProgress `json:"store_progress"`
	QueuedCount     int                    `json:"queued_count"`
	ProcessingCount int                    `json:"processing_count"`
	CompletedCount  int                    `json:"completed_count"`
	FailedCount     int                    `json:"failed_count"`
	Timestamp       time.Time              `json:"timestamp"`
}

// StreamPipelineProgress streams realtime progress updates for a pipeline run
func (h *SSEHandler) StreamPipelineProgress(c *gin.Context) {
	runIDStr := c.Param("id")
	var runID int64
	if _, err := fmt.Sscanf(runIDStr, "%d", &runID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid run ID"})
		return
	}

	// Verify the run exists
	_, err := h.managementService.GetRun(c.Request.Context(), runID)
	if err != nil {
		if err == models.ErrPipelineNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "pipeline run not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get pipeline run"})
		return
	}

	// Set headers for SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // Disable nginx buffering

	// Create a channel for updates
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	// Send initial state
	h.sendProgressUpdate(c, ctx, runID)

	// Stream updates while the pipeline is running
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.Log.Info().Int64("run_id", runID).Msg("SSE client disconnected")
			return
		case <-ticker.C:
			// Get current run status
			currentRun, err := h.managementService.GetRun(ctx, runID)
			if err != nil {
				logger.Log.Error().Err(err).Int64("run_id", runID).Msg("Failed to get run status")
				continue
			}

			// Send progress update
			h.sendProgressUpdate(c, ctx, runID)

			// If the run is completed or failed, send final update and close
			if currentRun.Status == models.StatusCompleted || currentRun.Status == models.StatusFailed {
				// Send completion event
				h.sendEvent(c, "complete", gin.H{
					"run_id": runID,
					"status": currentRun.Status,
				})

				// Wait a bit to ensure client receives the message
				time.Sleep(500 * time.Millisecond)
				return
			}
		}
	}
}

// sendProgressUpdate sends a progress update event
func (h *SSEHandler) sendProgressUpdate(c *gin.Context, ctx context.Context, runID int64) {
	summary, err := h.managementService.GetRunSummary(ctx, runID)
	if err != nil {
		logger.Log.Error().Err(err).Int64("run_id", runID).Msg("Failed to get run summary")
		return
	}

	update := ProgressUpdate{
		RunID:           runID,
		Status:          summary.Run.Status,
		ProcessedFiles:  summary.Run.ProcessedFiles,
		TotalFiles:      summary.Run.TotalFiles,
		TotalRows:       summary.Run.TotalRows,
		StoreProgress:   summary.StoreProgress,
		QueuedCount:     summary.QueuedCount,
		ProcessingCount: summary.ProcessingCount,
		CompletedCount:  summary.CompletedCount,
		FailedCount:     summary.FailedCount,
		Timestamp:       time.Now(),
	}

	h.sendEvent(c, "progress", update)
}

// sendEvent sends an SSE event to the client
func (h *SSEHandler) sendEvent(c *gin.Context, event string, data interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		logger.Log.Error().Err(err).Msg("Failed to marshal SSE event data")
		return
	}

	// Format: event: <event_name>\ndata: <json_data>\n\n
	fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, string(jsonData))
	c.Writer.Flush()
}

// sendHeartbeat sends a heartbeat to keep the connection alive
func (h *SSEHandler) sendHeartbeat(c *gin.Context) {
	fmt.Fprintf(c.Writer, ": heartbeat\n\n")
	c.Writer.Flush()
}
