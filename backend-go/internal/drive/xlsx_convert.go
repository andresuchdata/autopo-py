package drive

import (
	"encoding/csv"
	"fmt"
	"os"

	"github.com/xuri/excelize/v2"
)

// convertXLSXToCSV converts the first sheet of an XLSX file to a CSV file.
// It expects the XLSX to have a header row compatible with downstream CSV processing.
func convertXLSXToCSV(xlsxPath, csvPath string) error {
	f, err := excelize.OpenFile(xlsxPath)
	if err != nil {
		return fmt.Errorf("failed to open xlsx file %s: %w", xlsxPath, err)
	}
	defer f.Close()

	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return fmt.Errorf("xlsx file %s has no sheets", xlsxPath)
	}
	sheet := sheets[0]

	rows, err := f.Rows(sheet)
	if err != nil {
		return fmt.Errorf("failed to read rows from sheet %s: %w", sheet, err)
	}
	defer rows.Close()

	out, err := os.Create(csvPath)
	if err != nil {
		return fmt.Errorf("failed to create csv file %s: %w", csvPath, err)
	}
	defer out.Close()

	w := csv.NewWriter(out)
	defer w.Flush()

	for rows.Next() {
		record, err := rows.Columns()
		if err != nil {
			return fmt.Errorf("failed to read row from %s: %w", xlsxPath, err)
		}
		if err := w.Write(record); err != nil {
			return fmt.Errorf("failed to write csv row to %s: %w", csvPath, err)
		}
	}

	if err := rows.Error(); err != nil {
		return fmt.Errorf("error iterating rows in %s: %w", xlsxPath, err)
	}

	return nil
}
