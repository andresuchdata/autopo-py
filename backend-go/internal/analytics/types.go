package analytics

import (
	"database/sql"
	"time"
)

type stockHealthRecord struct {
	snapshotTime              time.Time
	storeID                   int
	productID                 int
	brandID                   sql.NullInt64
	sku                       string
	kategoriBrand             string
	stock                     int
	dailySales                float64
	maxDailySales             float64
	dailyStockCover           float64
	hpp                       float64
	leadTime                  int
	maxLeadTime               int
	minOrder                  int
	sedangPO                  int
	safetyStock               int
	reorderPoint              int
	isOpenPO                  bool
	initialQtyPO              int
	emergencyPOQty            int
	updatedRegularPOQty       int
	finalUpdatedRegularPOQty  int
	emergencyPOCost           float64
	finalUpdatedRegularPOCost float64
	contributionPct           float64
	salesContribution         float64
	targetDays                int
	targetDaysCover           int
	currentDaysStockCover     float64
}

type rawPOSnapshotRow struct {
	sku              string
	productName      string
	poNumber         string
	brandName        string
	storeName        string
	supplierName     string
	quantityOrdered  int
	unitPrice        float64
	totalAmount      float64
	status           int
	releasedAt       *time.Time
	sentAt           *time.Time
	approvedAt       *time.Time
	arrivedAt        *time.Time
	receivedAt       *time.Time
	quantityReceived int
}

type rawStockHealthRow struct {
	storeName                 string
	sku                       string
	brandName                 string
	kategoriBrand             string
	stock                     int
	dailySales                float64
	maxDailySales             float64
	dailyStockCover           float64
	hpp                       float64
	leadTime                  int
	maxLeadTime               int
	minOrder                  int
	sedangPO                  int
	safetyStock               int
	reorderPoint              int
	isOpenPO                  bool
	initialQtyPO              int
	emergencyPOQty            int
	updatedRegularPOQty       int
	finalUpdatedRegularPOQty  int
	emergencyPOCost           float64
	finalUpdatedRegularPOCost float64
	contributionPct           float64
	salesContribution         float64
	targetDays                int
	targetDaysCover           int
	currentDaysStockCover     float64
}

type poSnapshotRecord struct {
	snapshotTime     time.Time
	poNumber         string
	productID        int
	sku              string
	productName      string
	brandID          sql.NullInt64
	storeID          int
	supplierID       sql.NullInt64
	quantityOrdered  int
	unitPrice        float64
	totalAmount      float64
	status           int
	releasedAt       *time.Time
	sentAt           *time.Time
	approvedAt       *time.Time
	arrivedAt        *time.Time
	receivedAt       *time.Time
	quantityReceived int
}

type stockHealthKey struct {
	snapshotTime time.Time
	sku          string
	storeID      int
	productID    int
	brandID      int64
	brandValid   bool
}

type poSnapshotKey struct {
	snapshotTime  time.Time
	poNumber      string
	sku           string
	brandID       int64
	brandValid    bool
	storeID       int
	supplierID    int64
	supplierValid bool
}

type inventoryMetricsInput struct {
	Stock         float64
	DailySales    float64
	MaxDailySales float64
	LeadTime      float64
	MaxLeadTime   float64
	SedangPO      float64
	HPP           float64
	MinOrder      float64
	TargetDays    float64
	IsTop100      bool
}

type inventoryMetricsResult struct {
	SafetyStock               int
	ReorderPoint              int
	TargetDaysCover           int
	QtyForTargetDaysCover     int
	CurrentDaysStockCover     float64
	IsOpenPO                  bool
	InitialQtyPO              int
	EmergencyPOQty            int
	UpdatedRegularPOQty       int
	FinalUpdatedRegularPOQty  int
	EmergencyPOCost           float64
	FinalUpdatedRegularPOCost float64
}
