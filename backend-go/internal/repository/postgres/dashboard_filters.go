package postgres

import (
	"fmt"
	"strings"

	"github.com/andresuchdata/autopo-py/backend-go/internal/domain"
)

// buildDashboardFilterClause constructs SQL filter clauses for dashboard queries
func buildDashboardFilterClause(filter *domain.DashboardFilter, alias string, startIndex int) (string, []interface{}) {
	if filter == nil {
		return "", nil
	}

	var (
		clauses []string
		args    []interface{}
	)
	idx := startIndex

	if filter.POType != "" {
		switch strings.ToUpper(filter.POType) {
		case "AU":
			clauses = append(clauses, fmt.Sprintf("%spo_number ILIKE $%d", alias, idx))
			args = append(args, "AU%")
			idx++
		case "PO":
			clauses = append(clauses, fmt.Sprintf("%spo_number ILIKE $%d", alias, idx))
			args = append(args, "PO%")
			idx++
		case "OTHERS":
			clauses = append(clauses, fmt.Sprintf("(%spo_number NOT ILIKE $%d AND %spo_number NOT ILIKE $%d)", alias, idx, alias, idx+1))
			args = append(args, "AU%", "PO%")
			idx += 2
		}
	}

	if filter.ReleasedDate != "" {
		clauses = append(clauses, fmt.Sprintf("DATE(%spo_released_at) = $%d", alias, idx))
		args = append(args, filter.ReleasedDate)
		idx++
	}

	if len(filter.StoreIDs) > 0 {
		placeholders := make([]string, len(filter.StoreIDs))
		for i, id := range filter.StoreIDs {
			placeholders[i] = fmt.Sprintf("$%d", idx)
			args = append(args, id)
			idx++
		}
		clauses = append(clauses, fmt.Sprintf("%sstore_id IN (%s)", alias, strings.Join(placeholders, ",")))
	}

	if len(filter.BrandIDs) > 0 {
		placeholders := make([]string, len(filter.BrandIDs))
		for i, id := range filter.BrandIDs {
			placeholders[i] = fmt.Sprintf("$%d", idx)
			args = append(args, id)
			idx++
		}
		clauses = append(clauses, fmt.Sprintf("%sbrand_id IN (%s)", alias, strings.Join(placeholders, ",")))
	}

	if len(filter.SupplierIDs) > 0 {
		placeholders := make([]string, len(filter.SupplierIDs))
		for i, id := range filter.SupplierIDs {
			placeholders[i] = fmt.Sprintf("$%d", idx)
			args = append(args, id)
			idx++
		}
		clauses = append(clauses, fmt.Sprintf("%ssupplier_id IN (%s)", alias, strings.Join(placeholders, ",")))
	}

	if len(clauses) == 0 {
		return "", nil
	}

	return " AND " + strings.Join(clauses, " AND "), args
}

func normalizeAlias(alias string) string {
	if alias == "" {
		return ""
	}
	if !strings.HasSuffix(alias, ".") {
		return alias + "."
	}
	return alias
}

func buildDerivedStatusCase(alias string) string {
	normalized := normalizeAlias(alias)
	return fmt.Sprintf(`CASE
	        WHEN %[1]spo_received_at IS NOT NULL THEN 3
	        WHEN %[1]spo_arrived_at IS NOT NULL THEN 5
	        WHEN %[1]spo_approved_at IS NOT NULL THEN 1
	        WHEN %[1]spo_sent_at IS NOT NULL THEN 4
	        WHEN %[1]spo_released_at IS NOT NULL THEN 0
	        ELSE -1
	    END`, normalized)
}

func buildDerivedStatusTimestampCase(alias, fallbackColumn string) string {
	normalized := normalizeAlias(alias)
	fallback := fallbackColumn
	switch {
	case fallback == "":
		fallback = fmt.Sprintf("%stime", normalized)
	case !strings.Contains(fallbackColumn, "."):
		fallback = fmt.Sprintf("%s%s", normalized, fallbackColumn)
	}

	return fmt.Sprintf(`CASE
        WHEN %[1]sstatus = 2 THEN %[2]s
        WHEN %[1]spo_received_at IS NOT NULL THEN %[1]spo_received_at
        WHEN %[1]spo_arrived_at IS NOT NULL THEN %[1]spo_arrived_at
        WHEN %[1]spo_approved_at IS NOT NULL THEN %[1]spo_approved_at
        WHEN %[1]spo_sent_at IS NOT NULL THEN %[1]spo_sent_at
        WHEN %[1]spo_released_at IS NOT NULL THEN %[1]spo_released_at
        ELSE %[2]s
    END`, normalized, fallback)
}
