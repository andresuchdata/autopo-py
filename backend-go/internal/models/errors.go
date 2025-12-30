package models

import "errors"

var (
	ErrInvalidRunDate         = errors.New("invalid run date")
	ErrMissingDriveFolderID   = errors.New("drive folder ID is required for Google Drive data source")
	ErrLegacyDBNotConfigured  = errors.New("legacy database is not configured")
	ErrPipelineNotFound       = errors.New("pipeline run not found")
	ErrPipelineAlreadyRunning = errors.New("pipeline is already running")
	ErrPipelineNotPaused      = errors.New("pipeline is not paused")
	ErrInvalidStoreID         = errors.New("invalid store ID")
)
