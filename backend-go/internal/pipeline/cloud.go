package pipeline

import (
	"context"
	"fmt"
	"path"
	"strings"
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

type CloudLayout struct {
	taskName string
}

func NewCloudLayout(task string) *CloudLayout {
	return &CloudLayout{taskName: strings.Trim(task, "/")}
}

func (l *CloudLayout) Path(parts ...string) string {
	segments := []string{l.taskName}
	segments = append(segments, parts...)
	return path.Join(segments...)
}

func (l *CloudLayout) DateParts(date time.Time) []string {
	return []string{
		fmt.Sprintf("%04d", date.Year()),
		fmt.Sprintf("%02d", int(date.Month())),
		fmt.Sprintf("%02d", date.Day()),
	}
}
