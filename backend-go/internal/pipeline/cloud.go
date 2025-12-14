package pipeline

import (
	"context"
	"time"
)

// CloudPipeline is an optional interface a pipeline can implement to support
// remote input/output workflows.
type CloudPipeline interface {
	// FetchInputFile downloads the remote object referenced by remotePath into a
	// scratch location and returns the local path plus an optional cleanup func.
	FetchInputFile(ctx context.Context, remotePath string) (localPath string, cleanup func(), err error)

	// UploadAggregatedOutput persists the aggregated CSV produced for a snapshot
	// date after it has been successfully seeded into the database.
	UploadAggregatedOutput(ctx context.Context, snapshotDate time.Time, localPath string) error
}
