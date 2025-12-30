package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/models"
	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/andresuchdata/autopo-py/backend-go/internal/validation"
	"github.com/gin-gonic/gin"
)

type PipelineHandler struct {
	pipelineService   *service.PipelineService
	validationRunner  *validation.Runner
	managementService *service.PipelineManagementService
	defaultFolderID   string
}

func NewPipelineHandler(ps *service.PipelineService, vr *validation.Runner, pms *service.PipelineManagementService, defaultFolderID string) *PipelineHandler {
	return &PipelineHandler{
		pipelineService:   ps,
		validationRunner:  vr,
		managementService: pms,
		defaultFolderID:   defaultFolderID,
	}
}

// ValidationRequest represents the request body for triggering validation
type ValidationRequest struct {
	Date string `json:"date" binding:"required"` // YYYY-MM-DD
}

// PipelineTriggerRequest represents the request body for triggering a pipeline
type PipelineTriggerRequest struct {
	Names []string `json:"files"` // Optional specific files
}

// PipelineConfigRequest represents the request body for configuring and triggering a pipeline
type PipelineConfigRequest struct {
	DataSource    string              `json:"data_source" binding:"required,oneof=google_drive legacy_db"`
	RunDate       string              `json:"run_date" binding:"required"`
	StoreIDs      []int               `json:"store_ids,omitempty"`
	DriveFolderID string              `json:"drive_folder_id,omitempty"`
	Priority      int                 `json:"priority"`
	ScheduledAt   *string             `json:"scheduled_at,omitempty"` // RFC3339 format
	RetryConfig   *models.RetryConfig `json:"retry_config,omitempty"`
}

// TriggerValidation runs the validation script for a given date
func (h *PipelineHandler) TriggerValidation(c *gin.Context) {
	var req ValidationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format, expected YYYY-MM-DD"})
		return
	}

	// For now, this is synchronous. In production, this should likely be async.
	result, err := h.validationRunner.Run(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

// TriggerPipeline runs a specific pipeline (legacy endpoint for backward compatibility)
func (h *PipelineHandler) TriggerPipeline(c *gin.Context) {
	name := c.Param("name")
	dateStr := c.Query("date")

	if dateStr == "" {
		dateStr = time.Now().Format("2006-01-02")
	}

	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format"})
		return
	}

	var req PipelineTriggerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		// input files is optional
	}

	// Trigger pipeline
	runID, err := h.pipelineService.TriggerPipeline(c.Request.Context(), name, date, req.Names)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"message": "Pipeline run triggered",
		"run_id":  runID,
		"date":    dateStr,
		"status":  "pending",
	})
}

// ConfigureAndRunPipeline configures and triggers a pipeline with full configuration
func (h *PipelineHandler) ConfigureAndRunPipeline(c *gin.Context) {
	name := c.Param("name")

	var req PipelineConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse run date
	runDate, err := time.Parse("2006-01-02", req.RunDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid run_date format, expected YYYY-MM-DD"})
		return
	}

	// Build pipeline config
	config := models.PipelineConfig{
		DataSource:    models.DataSource(req.DataSource),
		RunDate:       req.RunDate,
		StoreIDs:      req.StoreIDs,
		DriveFolderID: req.DriveFolderID,
		Priority:      req.Priority,
	}

	// Use default folder ID if none provided and source is Google Drive
	if config.DataSource == models.DataSourceGoogleDrive && config.DriveFolderID == "" {
		config.DriveFolderID = h.defaultFolderID
	}

	// Parse scheduled time if provided
	if req.ScheduledAt != nil {
		scheduledTime, err := time.Parse(time.RFC3339, *req.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scheduled_at format, expected RFC3339"})
			return
		}
		config.ScheduledAt = &scheduledTime
	}

	// Set retry config or use defaults
	if req.RetryConfig != nil {
		config.RetryConfig = *req.RetryConfig
	} else {
		config.RetryConfig = models.DefaultRetryConfig()
	}

	// Validate configuration
	if err := config.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Trigger pipeline with configuration
	runID, err := h.pipelineService.TriggerPipelineWithConfig(c.Request.Context(), name, runDate, &config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"message": "Pipeline run configured and triggered",
		"run_id":  runID,
		"date":    req.RunDate,
		"status":  "pending",
	})
}

// GetPipelineRun retrieves details of a specific pipeline run
func (h *PipelineHandler) GetPipelineRun(c *gin.Context) {
	runID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid run ID"})
		return
	}

	run, err := h.managementService.GetRun(c.Request.Context(), runID)
	if err != nil {
		if err == models.ErrPipelineNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Pipeline run not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get pipeline run"})
		return
	}

	c.JSON(http.StatusOK, run)
}

// GetPipelineRunSummary retrieves a complete summary of a pipeline run
func (h *PipelineHandler) GetPipelineRunSummary(c *gin.Context) {
	runID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid run ID"})
		return
	}

	summary, err := h.managementService.GetRunSummary(c.Request.Context(), runID)
	if err != nil {
		if err == models.ErrPipelineNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Pipeline run not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get pipeline run summary"})
		return
	}

	c.JSON(http.StatusOK, summary)
}

// GetStoreProgress retrieves store-level progress for a pipeline run
func (h *PipelineHandler) GetStoreProgress(c *gin.Context) {
	runID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid run ID"})
		return
	}

	progress, err := h.managementService.GetStoreProgress(c.Request.Context(), runID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get store progress"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"run_id":   runID,
		"progress": progress,
	})
}

// ListPipelineRuns lists pipeline runs with pagination
func (h *PipelineHandler) ListPipelineRuns(c *gin.Context) {
	name := c.Param("name")

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit > 100 {
		limit = 100
	}

	runs, err := h.managementService.ListRuns(c.Request.Context(), name, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list pipeline runs"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"runs":   runs,
		"limit":  limit,
		"offset": offset,
	})
}

// PausePipelineRun pauses a running pipeline
func (h *PipelineHandler) PausePipelineRun(c *gin.Context) {
	runID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid run ID"})
		return
	}

	if err := h.managementService.PauseRun(c.Request.Context(), runID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Pipeline run paused",
		"run_id":  runID,
	})
}

// ResumePipelineRun resumes a paused pipeline
func (h *PipelineHandler) ResumePipelineRun(c *gin.Context) {
	runID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid run ID"})
		return
	}

	if err := h.managementService.ResumeRun(c.Request.Context(), runID); err != nil {
		if err == models.ErrPipelineNotPaused {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Pipeline is not paused"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Pipeline run resumed",
		"run_id":  runID,
	})
}

// RetryFailedStores retries all failed stores in a pipeline run
func (h *PipelineHandler) RetryFailedStores(c *gin.Context) {
	runID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid run ID"})
		return
	}

	// Reset failed jobs to queued
	if err := h.managementService.RetryFailedJobs(c.Request.Context(), runID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reset failed jobs"})
		return
	}

	// Update run status back to processing
	if err := h.managementService.UpdateRunStatus(c.Request.Context(), runID, models.StatusProcessing, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update run status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Failed stores queued for retry",
		"run_id":  runID,
	})
}

// GetAllStores retrieves all stores for selection
func (h *PipelineHandler) GetAllStores(c *gin.Context) {
	stores, err := h.managementService.GetAllStores(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get stores"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"stores": stores,
	})
}

// GetValidationResults retrieves existing validation results for a date
func (h *PipelineHandler) GetValidationResults(c *gin.Context) {
	dateStr := c.Query("date")
	if dateStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date parameter is required (YYYY-MM-DD)"})
		return
	}

	date, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date format, use YYYY-MM-DD"})
		return
	}

	result, err := h.validationRunner.GetResults(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch validation results"})
		return
	}

	if result == nil {
		// No results found for this date
		c.JSON(http.StatusOK, gin.H{"exists": false, "message": "No validation results found for this date"})
		return
	}

	c.JSON(http.StatusOK, result)
}
