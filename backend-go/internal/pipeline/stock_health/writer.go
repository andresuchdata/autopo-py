package stock_health

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// serializeRawStockRows converts RawStockRow slice to CSV bytes
func serializeRawStockRows(header []string, rows []RawStockRow) ([]byte, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	writer.Comma = ';' // Use semicolon as separator for Indonesian locale
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	for _, r := range rows {
		record := make([]string, len(header))
		for i, h := range header {
			switch strings.ToLower(strings.TrimSpace(h)) {
			case "brand":
				record[i] = r.Brand
			case "sku":
				record[i] = r.SKU
			case "nama":
				record[i] = r.Nama
			case "store":
				record[i] = r.Toko
			case "stock":
				record[i] = formatIDFloat(r.Stock, 2)
			case "daily_sales":
				record[i] = formatIDFloat(r.DailySales, 2)
			case "max_daily_sales":
				record[i] = formatIDFloat(r.MaxDailySales, 2)
			case "lead_time":
				record[i] = formatIDFloat(r.LeadTime, 2)
			case "max_lead_time":
				record[i] = formatIDFloat(r.MaxLeadTime, 2)
			case "sedang_po":
				record[i] = formatIDFloat(r.SedangPO, 2)
			case "hpp":
				record[i] = formatIDFloat(r.HPP, 2)
			case "harga":
				record[i] = formatIDFloat(r.Harga, 2)
			case "min_order":
				record[i] = formatIDFloat(r.MinOrder, 2)
			}
		}
		if err := writer.Write(record); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// writeIntermediateCSV writes intermediate CSV files to cloud storage or local disk
func (p *StockHealthPipeline) writeIntermediateCSV(date time.Time, stage string, inputFile string, header []string, rows []RawStockRow) error {
	fileName := filepath.Base(inputFile)
	data, err := serializeRawStockRows(header, rows)
	if err != nil {
		return fmt.Errorf("failed to serialize rows: %w", err)
	}

	if p.storageClient != nil && p.cloudLayout != nil {
		key := intermediateKey(p.cloudLayout, stage, date, fileName)
		if err := p.storageClient.UploadObject(context.Background(), key, data); err != nil {
			return fmt.Errorf("failed to upload intermediate %s: %w", key, err)
		}
		return nil
	}

	if p.config.IntermediateDir == "" {
		return nil
	}

	baseDir := filepath.Join(p.config.IntermediateDir, stage, date.Format("20060102"))
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return err
	}

	path := filepath.Join(baseDir, fileName)
	if err := os.WriteFile(path, data, 0644); err != nil {
		return err
	}

	return nil
}

// writeMetricsIntermediate writes transformed rows with metrics to intermediate storage
func (p *StockHealthPipeline) writeMetricsIntermediate(date time.Time, inputFile string, rows []TransformedStockRow) error {
	fileName := filepath.Base(inputFile)

	// Serialize to CSV bytes
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Comma = ';' // Use semicolon as separator for Indonesian locale

	headers := []string{
		"date",
		"brand",
		"sku",
		"nama",
		"store",
		"stock",
		"daily_sales",
		"max_daily_sales",
		"lead_time",
		"max_lead_time",
		"sedang_po",
		"hpp",
		"harga",
		"min_order",
		"sales_contribution",
		"is_in_padang",
		"safety_stock",
		"reorder_point",
		"target_days_cover",
		"qty_for_target_days_cover",
		"current_days_stock_cover",
		"is_open_po",
		"initial_qty_po",
		"emergency_po_qty",
		"updated_regular_po_qty",
		"final_updated_regular_po_qty",
		"emergency_po_cost",
		"final_updated_regular_po_cost",
		"supplier_store",
		"supplier_name",
		"supplier_phone",
	}

	if err := w.Write(headers); err != nil {
		return err
	}

	for _, r := range rows {
		salesContribution := r.DailySales * r.Harga
		rec := []string{
			date.Format("2006-01-02"),
			r.Brand,
			r.SKU,
			r.Nama,
			r.Toko,
			fmt.Sprintf("%v", r.Stock),
			formatIDFloat(r.DailySales, 2),
			formatIDFloat(r.MaxDailySales, 2),
			fmt.Sprintf("%v", r.LeadTime),
			fmt.Sprintf("%v", r.MaxLeadTime),
			fmt.Sprintf("%v", r.SedangPO),
			fmt.Sprintf("%v", r.HPP),
			fmt.Sprintf("%v", r.Harga),
			fmt.Sprintf("%v", r.MinOrder),
			formatIDFloat(salesContribution, 2),
			fmt.Sprintf("%v", r.IsInPadang),
			fmt.Sprintf("%v", r.Metrics.SafetyStock),
			fmt.Sprintf("%v", r.Metrics.ReorderPoint),
			fmt.Sprintf("%v", r.Metrics.TargetDaysCover),
			fmt.Sprintf("%v", r.Metrics.QtyForTargetDaysCover),
			formatIDFloat(r.Metrics.CurrentDaysStockCover, 2),
			fmt.Sprintf("%v", r.Metrics.IsOpenPO),
			fmt.Sprintf("%v", r.Metrics.InitialQtyPO),
			fmt.Sprintf("%v", r.Metrics.EmergencyPOQty),
			fmt.Sprintf("%v", r.Metrics.UpdatedRegularPOQty),
			fmt.Sprintf("%v", r.Metrics.FinalUpdatedRegularPOQty),
			formatIDFloat(r.Metrics.EmergencyPOCost, 2),
			formatIDFloat(r.Metrics.FinalUpdatedRegularPOCost, 2),
			r.SupplierStore,
			r.SupplierName,
			r.SupplierPhone,
		}
		if err := w.Write(rec); err != nil {
			return err
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		return err
	}

	data := buf.Bytes()

	// Upload to cloud storage if enabled
	if p.storageClient != nil && p.cloudLayout != nil {
		key := intermediateKey(p.cloudLayout, "3_with_metrics", date, fileName)
		if err := p.storageClient.UploadObject(context.Background(), key, data); err != nil {
			return fmt.Errorf("failed to upload metrics intermediate %s: %w", key, err)
		}
		return nil
	}

	// Otherwise write to local disk
	if p.config.IntermediateDir == "" {
		return nil
	}

	baseDir := filepath.Join(p.config.IntermediateDir, "3_with_metrics", date.Format("20060102"))
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return err
	}

	path := filepath.Join(baseDir, fileName)
	if err := os.WriteFile(path, data, 0644); err != nil {
		return err
	}

	return nil
}
