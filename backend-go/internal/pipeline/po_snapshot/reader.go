package po_snapshot

import (
	"bufio"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/pipeline"
)

var outputHeaders = []string{
	"SKU",
	"Nama Produk",
	"No PO",
	"Brand",
	"Store",
	"Supplier",
	"Qty PO",
	"Harga",
	"Amount",
	"Status",
	"PO Released",
	"PO Sent",
	"PO Approved",
	"PO Arrived",
	"PO Received",
	"Qty Received",
}

func readRawRows(path string) ([]RawRow, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	bufReader := bufio.NewReader(f)
	firstLine, err := bufReader.ReadString('\n')
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("failed to read header line: %w", err)
	}

	sep := pipeline.DetectCSVDelimiter(firstLine)
	reader := csv.NewReader(io.MultiReader(strings.NewReader(firstLine), bufReader))
	reader.Comma = sep
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err != nil {
		return nil, fmt.Errorf("failed to read CSV header: %w", err)
	}

	colMap := make(map[string]int)
	for i, col := range header {
		colMap[pipeline.NormalizeHeaderKey(col)] = i
	}

	get := func(record []string, key string) string {
		idx, ok := colMap[key]
		if !ok || idx < 0 || idx >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[idx])
	}

	var out []RawRow
	for {
		record, err := reader.Read()
		if err != nil {
			if err == io.EOF {
				break
			}
			if _, ok := err.(*csv.ParseError); ok {
				continue
			}
			return nil, fmt.Errorf("failed to read record: %w", err)
		}

		row := RawRow{
			SKU:         get(record, "sku"),
			NamaProduk:  get(record, "namaproduk"),
			NoPO:        get(record, "nopo"),
			Brand:       get(record, "brand"),
			Store:       get(record, "store"),
			Supplier:    get(record, "supplier"),
			QtyPO:       get(record, "qtypo"),
			Harga:       get(record, "harga"),
			Amount:      get(record, "amount"),
			Status:      get(record, "status"),
			POReleased:  get(record, "poreleased"),
			POSent:      get(record, "posent"),
			POApproved:  get(record, "poapproved"),
			POArrived:   get(record, "poarrived"),
			POReceived:  get(record, "poreceived"),
			QtyReceived: get(record, "qtyreceived"),
		}

		if row.SKU == "" && row.NoPO == "" {
			continue
		}
		out = append(out, row)
	}

	return out, nil
}
