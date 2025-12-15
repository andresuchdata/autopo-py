package po_snapshot

// Config holds configuration for the PO snapshot pipeline.
// Keep this package focused on transforming raw PO snapshot exports into
// normalized rows suitable for analytics ingestion.
type Config struct {
	InputDateFormat string

	DownloadDir     string
	IntermediateDir string
	OutputDir       string

	CloudStorageEnabled bool
	CloudBucket         string
	CloudEndpoint       string
	CloudRegion         string
	CloudAccessKey      string
	CloudSecretKey      string
	CloudUseSSL         bool
	CloudPrefix         string
}
