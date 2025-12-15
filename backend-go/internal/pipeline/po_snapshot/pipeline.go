package po_snapshot

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
	"github.com/andresuchdata/autopo-py/backend-go/internal/storage"
)

type Pipeline struct {
	cfg         Config
	storage     storage.ObjectStorage
	cloudLayout *pipeline.CloudLayout
	tempDir     string
}

func New(cfg Config) (*Pipeline, error) {
	if cfg.InputDateFormat == "" {
		cfg.InputDateFormat = "20060102"
	}

	p := &Pipeline{cfg: cfg}

	if cfg.CloudStorageEnabled {
		client, err := storage.NewS3Client(storage.Config{
			Endpoint:  cfg.CloudEndpoint,
			AccessKey: cfg.CloudAccessKey,
			SecretKey: cfg.CloudSecretKey,
			Bucket:    cfg.CloudBucket,
			Region:    cfg.CloudRegion,
			UseSSL:    cfg.CloudUseSSL,
			Prefix:    strings.Trim(cfg.CloudPrefix, "/"),
		})
		if err != nil {
			return nil, fmt.Errorf("failed to initialize cloud storage client: %w", err)
		}

		tmp, err := os.MkdirTemp("", "po-snapshot-cloud")
		if err != nil {
			return nil, fmt.Errorf("failed to create temp dir for cloud downloads: %w", err)
		}
		p.storage = client
		p.cloudLayout = pipeline.NewCloudLayout(p.Name())
		p.tempDir = tmp
	}

	return p, nil
}

func (p *Pipeline) Name() string {
	return "po_snapshots"
}

func (p *Pipeline) GetOutputTable() string {
	return "po_snapshots"
}

func (p *Pipeline) GetSnapshotDate(filename string) (time.Time, error) {
	base := filepath.Base(filename)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	layout := p.cfg.InputDateFormat
	if len(base) < len(layout) {
		return time.Time{}, fmt.Errorf("filename %s does not contain date with layout %s", filename, layout)
	}
	return time.Parse(layout, base[:len(layout)])
}

func (p *Pipeline) Validate(inputFile string) error {
	info, err := os.Stat(inputFile)
	if err != nil {
		return fmt.Errorf("cannot stat input file %s: %w", inputFile, err)
	}
	if info.IsDir() {
		return fmt.Errorf("input path %s is a directory, expected file", inputFile)
	}
	ext := strings.ToLower(filepath.Ext(inputFile))
	if ext != ".csv" {
		return fmt.Errorf("unsupported file extension %s for %s (only CSV supported)", ext, inputFile)
	}
	return nil
}

func (p *Pipeline) Transform(ctx context.Context, inputFile string) ([]pipeline.TransformedRow, error) {
	rows, err := readRawRows(inputFile)
	if err != nil {
		return nil, err
	}

	out := make([]pipeline.TransformedRow, 0, len(rows))
	for _, r := range rows {
		data := map[string]interface{}{
			"SKU":          r.SKU,
			"Nama Produk":  r.NamaProduk,
			"No PO":        r.NoPO,
			"Brand":        r.Brand,
			"Store":        r.Store,
			"Supplier":     r.Supplier,
			"Qty PO":       r.QtyPO,
			"Harga":        r.Harga,
			"Amount":       r.Amount,
			"Status":       r.Status,
			"PO Released":  r.POReleased,
			"PO Sent":      r.POSent,
			"PO Approved":  r.POApproved,
			"PO Arrived":   r.POArrived,
			"PO Received":  r.POReceived,
			"Qty Received": r.QtyReceived,
		}
		out = append(out, pipeline.TransformedRow{Data: data})
	}

	return out, nil
}

var _ pipeline.Pipeline = (*Pipeline)(nil)
var _ pipeline.CloudPipeline = (*Pipeline)(nil)

func rawKey(l *pipeline.CloudLayout, date time.Time, fileName string) string {
	parts := append([]string{"raw"}, l.DateParts(date)...)
	parts = append(parts, fileName)
	return l.Path(parts...)
}

func outputKey(l *pipeline.CloudLayout, date time.Time, fileName string) string {
	parts := append([]string{"output"}, l.DateParts(date)...)
	parts = append(parts, fileName)
	return l.Path(parts...)
}

func (p *Pipeline) ensureTempDir() error {
	if p.tempDir != "" {
		return nil
	}
	d, err := os.MkdirTemp("", "po-snapshot-pipeline")
	if err != nil {
		return err
	}
	p.tempDir = d
	return nil
}

func (p *Pipeline) FetchInputFile(ctx context.Context, remotePath string) (string, func(), error) {
	if p.storage == nil {
		return remotePath, nil, nil
	}
	if err := p.ensureTempDir(); err != nil {
		return "", nil, err
	}
	localPath := filepath.Join(p.tempDir, fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(remotePath)))
	if err := p.storage.DownloadObject(ctx, remotePath, localPath); err != nil {
		return "", nil, fmt.Errorf("failed to download %s: %w", remotePath, err)
	}
	cleanup := func() { _ = os.Remove(localPath) }
	return localPath, cleanup, nil
}

func (p *Pipeline) UploadAggregatedOutput(ctx context.Context, snapshotDate time.Time, localPath string) error {
	if p.storage == nil || p.cloudLayout == nil {
		return nil
	}

	data, err := os.ReadFile(localPath)
	if err != nil {
		return fmt.Errorf("failed to read aggregated output %s: %w", localPath, err)
	}

	key := outputKey(p.cloudLayout, snapshotDate, filepath.Base(localPath))
	if err := p.storage.UploadObject(ctx, key, data); err != nil {
		return fmt.Errorf("failed to upload aggregated output %s: %w", key, err)
	}

	return nil
}

func (p *Pipeline) UploadRawFile(ctx context.Context, snapshotDate time.Time, localPath string) (string, error) {
	if p.storage == nil || p.cloudLayout == nil {
		return localPath, nil
	}

	data, err := os.ReadFile(localPath)
	if err != nil {
		return "", fmt.Errorf("failed to read %s for upload: %w", localPath, err)
	}

	key := rawKey(p.cloudLayout, snapshotDate, filepath.Base(localPath))
	if err := p.storage.UploadObject(ctx, key, data); err != nil {
		return "", fmt.Errorf("failed to upload raw file %s: %w", key, err)
	}

	return key, nil
}
