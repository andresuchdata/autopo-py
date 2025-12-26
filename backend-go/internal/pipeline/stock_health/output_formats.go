package stock_health

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// generateAndUploadM2Format creates M2 format CSV from the complete output and uploads it
// M2 format: Toko, SKU, HPP, final_updated_regular_po_qty (filtered for qty > 0)
// Creates both a global file and per-store files
func (p *StockHealthPipeline) generateAndUploadM2Format(ctx context.Context, snapshotDate time.Time, completeCSVPath string) error {
	if p.storageClient == nil || p.cloudLayout == nil {
		return nil
	}

	// Read the complete CSV
	file, err := os.Open(completeCSVPath)
	if err != nil {
		return fmt.Errorf("failed to open complete CSV: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read header: %w", err)
	}

	// Find column indices
	colIndex := func(name string) int {
		for i, h := range header {
			if normalizeColumnName(h) == normalizeColumnName(name) {
				return i
			}
		}
		return -1
	}

	idxStore := colIndex("store")
	idxSKU := colIndex("sku")
	idxHPP := colIndex("hpp")
	idxFinalQty := colIndex("final_updated_regular_po_qty")

	if idxStore == -1 || idxSKU == -1 || idxHPP == -1 || idxFinalQty == -1 {
		return fmt.Errorf("missing required columns for M2 format")
	}

	// Build M2 CSV in memory (global file)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Comma = ';' // Use semicolon as separator for Indonesian locale

	// Write M2 header
	if err := w.Write([]string{"Toko", "SKU", "HPP", "final_updated_regular_po_qty"}); err != nil {
		return err
	}

	// Store-based buffers
	storeBuffers := make(map[string]*bytes.Buffer)
	storeWriters := make(map[string]*csv.Writer)

	// Filter and write rows where final_updated_regular_po_qty > 0
	for {
		record, err := reader.Read()
		if err != nil {
			break
		}

		if idxFinalQty >= len(record) {
			continue
		}

		// Parse quantity
		qtyStr := strings.TrimSpace(record[idxFinalQty])
		qty, err := strconv.ParseFloat(qtyStr, 64)
		if err != nil || qty <= 0 {
			continue
		}

		// Get field values
		get := func(idx int) string {
			if idx < 0 || idx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[idx])
		}

		storeName := get(idxStore)
		rowData := []string{
			storeName,
			get(idxSKU),
			get(idxHPP),
			get(idxFinalQty),
		}

		// Write to global file
		if err := w.Write(rowData); err != nil {
			return err
		}

		// Write to store-specific file
		if storeName != "" {
			if _, exists := storeBuffers[storeName]; !exists {
				storeBuffers[storeName] = &bytes.Buffer{}
				storeWriters[storeName] = csv.NewWriter(storeBuffers[storeName])
				storeWriters[storeName].Comma = ';'
				// Write header for store file
				if err := storeWriters[storeName].Write([]string{"Toko", "SKU", "HPP", "final_updated_regular_po_qty"}); err != nil {
					return err
				}
			}
			if err := storeWriters[storeName].Write(rowData); err != nil {
				return err
			}
		}
	}

	// Flush global writer
	w.Flush()
	if err := w.Error(); err != nil {
		return err
	}

	// Flush all store writers
	for storeName, writer := range storeWriters {
		writer.Flush()
		if err := writer.Error(); err != nil {
			return fmt.Errorf("failed to flush store writer for %s: %w", storeName, err)
		}
	}

	// Upload global M2 file to cloud storage
	baseName := filepath.Base(completeCSVPath)
	key := p.cloudLayout.Path("output", "m2", fmt.Sprintf("%04d", snapshotDate.Year()),
		fmt.Sprintf("%02d", int(snapshotDate.Month())),
		fmt.Sprintf("%02d", snapshotDate.Day()), baseName)

	if err := p.storageClient.UploadObject(ctx, key, buf.Bytes()); err != nil {
		return fmt.Errorf("failed to upload M2 format: %w", err)
	}

	log.Printf("[%s] Uploaded M2 format to %s", p.Name(), key)

	// Upload store-based M2 files
	for storeName, storeBuf := range storeBuffers {
		// Create store-specific filename
		storeFileName := strings.TrimSuffix(baseName, filepath.Ext(baseName)) + "_" + normalizeStoreNameForFile(storeName) + filepath.Ext(baseName)
		storeKey := p.cloudLayout.Path("output", "m2", fmt.Sprintf("%04d", snapshotDate.Year()),
			fmt.Sprintf("%02d", int(snapshotDate.Month())),
			fmt.Sprintf("%02d", snapshotDate.Day()), storeFileName)

		if err := p.storageClient.UploadObject(ctx, storeKey, storeBuf.Bytes()); err != nil {
			log.Printf("Warning: failed to upload M2 format for store %s: %v", storeName, err)
			continue
		}
		log.Printf("[%s] Uploaded M2 format for store %s to %s", p.Name(), storeName, storeKey)
	}

	return nil
}

// generateAndUploadEmergencyFormat creates Emergency PO format CSV and uploads it
// Emergency format: Brand, SKU, Nama, Toko, HPP, emergency_po_qty, emergency_po_cost (filtered for qty > 0)
// Creates both a global file and per-store files
func (p *StockHealthPipeline) generateAndUploadEmergencyFormat(ctx context.Context, snapshotDate time.Time, completeCSVPath string) error {
	if p.storageClient == nil || p.cloudLayout == nil {
		return nil
	}

	// Read the complete CSV
	file, err := os.Open(completeCSVPath)
	if err != nil {
		return fmt.Errorf("failed to open complete CSV: %w", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	header, err := reader.Read()
	if err != nil {
		return fmt.Errorf("failed to read header: %w", err)
	}

	// Find column indices
	colIndex := func(name string) int {
		for i, h := range header {
			if normalizeColumnName(h) == normalizeColumnName(name) {
				return i
			}
		}
		return -1
	}

	idxBrand := colIndex("brand")
	idxSKU := colIndex("sku")
	idxNama := colIndex("nama")
	idxStore := colIndex("store")
	idxHPP := colIndex("hpp")
	idxEmergencyQty := colIndex("emergency_po_qty")
	idxEmergencyCost := colIndex("emergency_po_cost")

	if idxBrand == -1 || idxSKU == -1 || idxNama == -1 || idxStore == -1 ||
		idxHPP == -1 || idxEmergencyQty == -1 || idxEmergencyCost == -1 {
		return fmt.Errorf("missing required columns for Emergency format")
	}

	// Build Emergency CSV in memory (global file)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Comma = ';' // Use semicolon as separator for Indonesian locale

	// Write Emergency header
	if err := w.Write([]string{"Brand", "SKU", "Nama", "Toko", "HPP", "emergency_po_qty", "emergency_po_cost"}); err != nil {
		return err
	}

	// Store-based buffers
	storeBuffers := make(map[string]*bytes.Buffer)
	storeWriters := make(map[string]*csv.Writer)

	// Filter and write rows where emergency_po_qty > 0
	for {
		record, err := reader.Read()
		if err != nil {
			break
		}

		if idxEmergencyQty >= len(record) {
			continue
		}

		// Parse quantity
		qtyStr := strings.TrimSpace(record[idxEmergencyQty])
		qty, err := strconv.ParseFloat(qtyStr, 64)
		if err != nil || qty <= 0 {
			continue
		}

		// Get field values
		get := func(idx int) string {
			if idx < 0 || idx >= len(record) {
				return ""
			}
			return strings.TrimSpace(record[idx])
		}

		storeName := get(idxStore)
		rowData := []string{
			get(idxBrand),
			get(idxSKU),
			get(idxNama),
			storeName,
			get(idxHPP),
			get(idxEmergencyQty),
			get(idxEmergencyCost),
		}

		// Write to global file
		if err := w.Write(rowData); err != nil {
			return err
		}

		// Write to store-specific file
		if storeName != "" {
			if _, exists := storeBuffers[storeName]; !exists {
				storeBuffers[storeName] = &bytes.Buffer{}
				storeWriters[storeName] = csv.NewWriter(storeBuffers[storeName])
				storeWriters[storeName].Comma = ';'
				// Write header for store file
				if err := storeWriters[storeName].Write([]string{"Brand", "SKU", "Nama", "Toko", "HPP", "emergency_po_qty", "emergency_po_cost"}); err != nil {
					return err
				}
			}
			if err := storeWriters[storeName].Write(rowData); err != nil {
				return err
			}
		}
	}

	// Flush global writer
	w.Flush()
	if err := w.Error(); err != nil {
		return err
	}

	// Flush all store writers
	for storeName, writer := range storeWriters {
		writer.Flush()
		if err := writer.Error(); err != nil {
			return fmt.Errorf("failed to flush store writer for %s: %w", storeName, err)
		}
	}

	// Upload global Emergency file to cloud storage
	baseName := filepath.Base(completeCSVPath)
	key := p.cloudLayout.Path("output", "emergency", fmt.Sprintf("%04d", snapshotDate.Year()),
		fmt.Sprintf("%02d", int(snapshotDate.Month())),
		fmt.Sprintf("%02d", snapshotDate.Day()), baseName)

	if err := p.storageClient.UploadObject(ctx, key, buf.Bytes()); err != nil {
		return fmt.Errorf("failed to upload Emergency format: %w", err)
	}

	log.Printf("[%s] Uploaded Emergency format to %s", p.Name(), key)

	// Upload store-based Emergency files
	for storeName, storeBuf := range storeBuffers {
		// Create store-specific filename
		storeFileName := strings.TrimSuffix(baseName, filepath.Ext(baseName)) + "_" + normalizeStoreNameForFile(storeName) + filepath.Ext(baseName)
		storeKey := p.cloudLayout.Path("output", "emergency", fmt.Sprintf("%04d", snapshotDate.Year()),
			fmt.Sprintf("%02d", int(snapshotDate.Month())),
			fmt.Sprintf("%02d", snapshotDate.Day()), storeFileName)

		if err := p.storageClient.UploadObject(ctx, storeKey, storeBuf.Bytes()); err != nil {
			log.Printf("Warning: failed to upload Emergency format for store %s: %v", storeName, err)
			continue
		}
		log.Printf("[%s] Uploaded Emergency format for store %s to %s", p.Name(), storeName, storeKey)
	}

	return nil
}
