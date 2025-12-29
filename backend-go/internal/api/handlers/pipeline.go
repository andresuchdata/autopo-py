package handlers

import (
	"net/http"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/service"
	"github.com/andresuchdata/autopo-py/backend-go/internal/validation"
	"github.com/gin-gonic/gin"
)

type PipelineHandler struct {
	pipelineService  *service.PipelineService
	validationRunner *validation.Runner
}

func NewPipelineHandler(ps *service.PipelineService, vr *validation.Runner) *PipelineHandler {
	return &PipelineHandler{
		pipelineService:  ps,
		validationRunner: vr,
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

// TriggerPipeline runs a specific pipeline
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
